import { useMemo, useState } from 'react'
import type { Environment, Project } from '../../domain/config'
import type { DatabaseKey, TableSummary } from '../../domain/engine'
import { EnvironmentPicker } from '../../shell/EnvironmentPicker/EnvironmentPicker'
import { ProjectPill } from '../../shell/ProjectPill/ProjectPill'
import { TitleBar } from '../../shell/TitleBar/TitleBar'
import { SplitPane } from '../../ui/SplitPane/SplitPane'
import { idSchema, type Noeud } from '../Explorer/arbre'
import { BreadcrumbBar, type TypeObjet } from '../Explorer/BreadcrumbBar'
import { DetailPanel } from '../Explorer/DetailPanel'
import { ExplorerSidebar } from '../Explorer/ExplorerSidebar'
import { ObjectTable } from '../Explorer/ObjectTable'
import { TableView } from '../TableView/TableView'
import type { PasserelleLignes } from '../TableView/useLignes'
import { AUCUN_ONGLET, fermer, ongletActif, ouvrir, reordonner } from './onglets'
import { PASSERELLE_TAURI, type PasserelleArbre, useArbre } from './useArbre'
import { PASSERELLE_DETAIL, type PasserelleDetail, useDetailTable } from './useDetailTable'
import styles from './Workbench.module.css'
import { WorkbenchTabs } from './WorkbenchTabs'

type WorkbenchProps = {
  projects: readonly Project[]
  passerelle?: PasserelleArbre
  passerelleDetail?: PasserelleDetail
  passerelleLignes?: PasserelleLignes
  onNewDatabase?: () => void
}

/**
 * L'écran de travail partagé par `A4` → `A9` : sidebar 212 px, centre à onglets, panneau droit.
 *
 * **`A4` n'existait que dans la galerie.** Ses quatre composants étaient écrits, testés et
 * fidèles, mais rien ne les réunissait et `App` ne les montait pas — les tests Playwright de
 * `09c`–`09f` visent tous `/?gallery`. Trou d'assemblage invisible, précisément parce que la
 * galerie donne la même image que l'écran. C'est ce que cette coquille corrige, et elle sert
 * `A5` du même coup.
 */
export function Workbench({
  projects,
  passerelle = PASSERELLE_TAURI,
  passerelleDetail = PASSERELLE_DETAIL,
  passerelleLignes,
  onNewDatabase,
}: WorkbenchProps) {
  const { deplies, charge, etatDeBase, basculer, rafraichir } = useArbre(projects, passerelle)
  const [selection, setSelection] = useState<Noeud | null>(null)
  const [etatOnglets, setEtatOnglets] = useState(AUCUN_ONGLET)
  const [type, setType] = useState<TypeObjet>('tables')
  const [filtre, setFiltre] = useState('')
  const [objetChoisi, setObjetChoisi] = useState<string | null>(null)

  const actif = ongletActif(etatOnglets)

  // Le contexte du **centre** : le schéma de l'onglet actif, sinon celui que la sidebar désigne.
  // Distinct de la barre de titre, qui suit la base ouverte — `09e` a posé la distinction, et
  // elle ne devient visible qu'ici, avec plusieurs onglets.
  const contexte = actif
    ? { project: actif.key.project, database: actif.key.database, schema: actif.schema }
    : selection?.schema && selection.project && selection.database
      ? { project: selection.project, database: selection.database, schema: selection.schema }
      : null

  const projetActif = projects.find((p) => p.name === contexte?.project) ?? projects[0] ?? null
  const environnement: Environment = projetActif?.activeEnvironment ?? 'dev'

  const objets: readonly TableSummary[] = contexte
    ? (charge.objets[idSchema(contexte.project, contexte.database, contexte.schema)] ?? [])
    : []

  const visibles = useMemo(
    () =>
      objets.filter(
        (objet) =>
          objet.name.toLowerCase().includes(filtre.trim().toLowerCase()) && correspond(objet, type),
      ),
    [objets, filtre, type],
  )

  const cle: DatabaseKey | null = contexte
    ? { project: contexte.project, database: contexte.database, environment: environnement }
    : null

  // Le détail sert deux endroits : le panneau droit de `A4` (l'objet sélectionné) et la section
  // « Colonnes de *table* » de la sidebar (la table de l'onglet actif). Une seule lecture, deux
  // lecteurs — la table de l'onglet actif étant aussi celle qu'on vient de sélectionner.
  const cible = actif?.table ?? objetChoisi
  const { detail, loading, error } = useDetailTable(
    cle,
    contexte?.schema ?? null,
    cible,
    passerelleDetail,
  )

  function ouvrirTable(objet: TableSummary) {
    if (!contexte) return
    setEtatOnglets((etat) =>
      ouvrir(etat, {
        key: {
          project: contexte.project,
          database: contexte.database,
          environment: environnement,
        },
        schema: contexte.schema,
        table: objet.name,
        kind: objet.kind === 'view' ? 'view' : 'table',
      }),
    )
  }

  return (
    <div className={styles.root}>
      <TitleBar
        showConsole
        center={
          <>
            <ProjectPill
              projectName={projetActif?.name ?? '—'}
              breadcrumb={contexte ? `${contexte.database} · ${contexte.schema}` : undefined}
              connection={
                contexte
                  ? etatDeBase(contexte.project, contexte.database, environnement)
                  : undefined
              }
            />
            <EnvironmentPicker value={environnement} onValueChange={() => {}} />
          </>
        }
      />
      <div className={styles.body}>
        <SplitPane
          storageKey="workbench:sidebar"
          defaultSize={212}
          min={180}
          max={360}
          handleShadow="start"
          start={
            <ExplorerSidebar
              // **212 px, la largeur standard de `A5` → `A9`, y compris quand le centre montre
              // `A4`.** Le handoff donne 252 px à `A4` et 212 aux écrans de travail ; dans une
              // coquille unique, ce ne peut pas être les deux — la colonne sauterait de 40 px à
              // l'ouverture d'un onglet. Le `SplitPane` la rend de toute façon réglable, ce
              // qu'un mockup figé ne peut pas exprimer. Écart consigné dans `specs/README.md`.
              width="fill"
              projects={projects}
              deplies={deplies}
              charge={charge}
              etatDe={etatDeBase}
              selectedId={selection?.id ?? null}
              onSelect={(noeud) => {
                setSelection(noeud)
                // Une **feuille** de l'arbre est un objet : la sélectionner l'ouvre. Un simple
                // clic suffit, parce qu'une feuille n'a pas d'autre geste — pas de dépliage à
                // distinguer. Dans la liste du centre, où sélectionner remplit le panneau de
                // détail, il faut au contraire un double-clic.
                if (noeud.kind === 'object' && noeud.project && noeud.database && noeud.schema) {
                  setEtatOnglets((etat) =>
                    ouvrir(etat, {
                      key: {
                        project: noeud.project as string,
                        database: noeud.database as string,
                        environment: noeud.environment ?? environnement,
                      },
                      schema: noeud.schema as string,
                      table: noeud.label,
                      kind: noeud.icon === 'view' ? 'view' : 'table',
                    }),
                  )
                }
              }}
              onToggle={basculer}
              onAddDatabase={onNewDatabase}
              onRefresh={rafraichir}
              columns={
                actif ? { table: actif.table, columns: detail?.columns ?? [], loading } : undefined
              }
            />
          }
          end={
            <SplitPane
              storageKey="workbench:detail"
              defaultSize={296}
              min={240}
              max={420}
              handleShadow="end"
              start={
                <div className={styles.centre}>
                  <WorkbenchTabs
                    etat={etatOnglets}
                    onSelect={(id) => setEtatOnglets((etat) => ({ ...etat, actif: id }))}
                    onClose={(id) => setEtatOnglets((etat) => fermer(etat, id))}
                    onReorder={(ids) => setEtatOnglets((etat) => reordonner(etat, ids))}
                  />
                  {actif && cle ? (
                    // Les lignes de la table ouverte (`10c`). La toolbar (`10e`) et le panneau
                    // de ligne (`10f`) viendront l'entourer.
                    <TableView
                      cle={cle}
                      schema={actif.schema}
                      table={actif.table}
                      columns={detail?.columns ?? []}
                      passerelle={passerelleLignes}
                    />
                  ) : (
                    <>
                      <BreadcrumbBar
                        database={contexte?.database ?? '—'}
                        schema={contexte?.schema ?? '—'}
                        counts={comptes(objets)}
                        type={type}
                        onTypeChange={setType}
                        filter={filtre}
                        onFilterChange={setFiltre}
                      />
                      <ObjectTable
                        schema={contexte?.schema ?? ''}
                        objects={visibles}
                        type={type}
                        selectedName={objetChoisi}
                        onSelect={(objet) => setObjetChoisi(objet.name)}
                        onOpen={ouvrirTable}
                      />
                    </>
                  )}
                </div>
              }
              end={
                <DetailPanel
                  detail={actif ? null : detail}
                  schema={contexte?.schema ?? ''}
                  loading={loading && !actif}
                  error={error}
                  onOpenData={() => {
                    const objet = objets.find((o) => o.name === objetChoisi)
                    if (objet) ouvrirTable(objet)
                  }}
                />
              }
            />
          }
        />
      </div>
    </div>
  )
}

function correspond(objet: TableSummary, type: TypeObjet): boolean {
  const attendu = { tables: 'table', views: 'view', functions: 'function', indexes: 'index' }[type]
  return objet.kind === attendu
}

/** Les quatre comptes du contrôle segmenté, **issus des données** — jamais de constantes. */
function comptes(objets: readonly TableSummary[]): Record<TypeObjet, number> {
  return {
    tables: objets.filter((o) => o.kind === 'table').length,
    views: objets.filter((o) => o.kind === 'view').length,
    functions: objets.filter((o) => o.kind === 'function').length,
    indexes: objets.filter((o) => o.kind === 'index').length,
  }
}
