import { useCallback, useEffect, useMemo, useState } from 'react'
import { rowAsInsert as rowAsInsertTauri } from '../../data/commandes'
import type { Database, Environment, Project } from '../../domain/config'
import type {
  DatabaseKey,
  Filter,
  RowWindow,
  SortKey,
  TableSummary,
  Value,
} from '../../domain/engine'
import { EnvironmentPicker } from '../../shell/EnvironmentPicker/EnvironmentPicker'
import { ProjectPill } from '../../shell/ProjectPill/ProjectPill'
import { TitleBar } from '../../shell/TitleBar/TitleBar'
import { SplitPane } from '../../ui/SplitPane/SplitPane'
import { ConsoleView } from '../Console/ConsoleView'
import { RunConfirm } from '../Console/RunConfirm'
import {
  PASSERELLE_EXECUTION,
  type PasserelleExecution,
  useExecution,
} from '../Console/useExecution'
import { idSchema, type Noeud } from '../Explorer/arbre'
import { BreadcrumbBar, type TypeObjet } from '../Explorer/BreadcrumbBar'
import type { CibleDeSuppression } from '../Explorer/DeleteConnectionDialog'
import { DetailPanel } from '../Explorer/DetailPanel'
import { ExplorerSidebar } from '../Explorer/ExplorerSidebar'
import { ObjectTable } from '../Explorer/ObjectTable'
import { ApplyConfirm } from '../TableView/ApplyConfirm'
import { EditBanner } from '../TableView/EditBanner'
import { type EnAttente, retirer } from '../TableView/modifications'
import { PendingPanel } from '../TableView/PendingPanel'
import { RowPanel } from '../TableView/RowPanel'
import { TableStatusBar } from '../TableView/TableStatusBar'
import { TableView } from '../TableView/TableView'
import { PASSERELLE_APPLY, type PasserelleApply, useApplication } from '../TableView/useApplication'
import { PASSERELLE_LIGNES, type PasserelleLignes } from '../TableView/useLignes'
import { PASSERELLE_PREVIEW, type PasserellePreview, useSqlPrevu } from '../TableView/useSqlPrevu'
import {
  AUCUN_ONGLET,
  type EtatOnglets,
  fermer,
  idOnglet,
  ongletActif,
  ouvrir,
  ouvrirConsole,
  reordonner,
  viseeParLId,
} from './onglets'
import { ProjectMenu } from './ProjectMenu'
import { PASSERELLE_TAURI, type PasserelleArbre, useArbre } from './useArbre'
import { PASSERELLE_DETAIL, type PasserelleDetail, useDetailTable } from './useDetailTable'
import styles from './Workbench.module.css'
import { WorkbenchTabs } from './WorkbenchTabs'

type WorkbenchProps = {
  projects: readonly Project[]
  passerelle?: PasserelleArbre
  passerelleDetail?: PasserelleDetail
  passerelleLignes?: PasserelleLignes
  /** Injectable comme les autres commandes : le pont ne répond pas hors de la webview (`08d`). */
  rowAsInsert?: typeof rowAsInsertTauri
  onNewDatabase?: () => void
  /** Ouvre `A2` en mode édition sur cette base (`08g`). */
  onEditDatabase?: (project: string, database: Database) => void
  /** Renommer un projet depuis le « … » de l'arbre (`08i`) — passé tel quel à la sidebar. */
  onRenameProject?: (
    project: string,
    nom: string,
  ) => Promise<{ missingSecrets: string[]; leftoverSecrets: string[] }>
  /** Le pont vers `preview_updates` (`11c`). Injectable : il ne répond pas hors de la webview. */
  passerellePreview?: PasserellePreview
  /** Le pont vers `apply_changes` (`11d`), la seule commande qui **écrit**. */
  passerelleApply?: PasserelleApply
  /** Le pont vers `run_sql` (`12c`) — le SQL de l'utilisateur. */
  passerelleExecution?: PasserelleExecution
  /** Retirer une déclaration de connexion, ou un projet (`08j`). */
  onDelete?: (cible: CibleDeSuppression) => Promise<{ leftoverSecrets: string[] }>
  /** Ouvre l'écran en mode édition au montage — la démo s'en sert (`11a`). */
  edition?: boolean
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
  rowAsInsert = rowAsInsertTauri,
  onNewDatabase,
  onEditDatabase,
  onRenameProject,
  onDelete,
  passerellePreview,
  passerelleApply,
  passerelleExecution,
  edition = false,
}: WorkbenchProps) {
  const { deplies, charge, etatDeBase, basculer, rafraichir } = useArbre(projects, passerelle)
  const [selection, setSelection] = useState<Noeud | null>(null)
  const [etatOnglets, setEtatOnglets] = useState(AUCUN_ONGLET)
  const [type, setType] = useState<TypeObjet>('tables')
  const [filtre, setFiltre] = useState('')
  const [objetChoisi, setObjetChoisi] = useState<string | null>(null)
  // Les filtres et le tri de la table ouverte, publiés par `TableView` (`10d`) : la sidebar les
  // annote, sans en tenir de copie.
  const [etatRequete, setEtatRequete] = useState<{
    filters: readonly Filter[]
    sort: readonly SortKey[]
  }>({ filters: [], sort: [] })
  // La lecture en cours, remontée par la vue de table : la barre d'état et le panneau de ligne
  // vivent **ici**, parce que le mockup les place hors du centre — le panneau longe tout le corps,
  // la barre court sur toute la largeur.
  const [lecture, setLecture] = useState<{
    fenetre: RowWindow | null
    loading: boolean
    error: string | null
    ligne: readonly Value[] | null
    rang: number | null
    total: number
  }>({ fenetre: null, loading: false, error: null, ligne: null, rang: null, total: 0 })
  const [rangChoisi, setRangChoisi] = useState<number | null>(null)
  /**
   * Le mode édition, **par onglet** (`11b`).
   *
   * Deux tables ouvertes n'ont aucune raison de basculer ensemble : l'état d'édition appartient à ce
   * qu'on édite. Un `Set` des onglets en édition, plutôt qu'un drapeau global.
   */
  const [ongletsEnEdition, setOngletsEnEdition] = useState<ReadonlySet<string>>(new Set())
  /**
   * Les modifications en attente, **par onglet**, remontées par la vue de table.
   *
   * Le compte apparaît à quatre endroits — bandeau, arbre, panneau, barre d'état — et tous lisent
   * **cette** source. Un compteur tenu à part divergerait au premier `⌘Z`.
   */
  const [attentes, setAttentes] = useState<Readonly<Record<string, EnAttente>>>({})

  const actif = ongletActif(etatOnglets)
  // **Deux vues de l'onglet actif**, depuis que `12a` en fait une union. Tout ce qui parle de
  // schéma, de table, de lignes ou de modifications concerne une *table* ; le reste — la barre de
  // titre, la sidebar — se contente de la base. Distinguer ici évite de réinterroger `sorte` à
  // vingt endroits, et laisse le compilateur refuser un accès à `.table` sur une console.
  const table = actif?.sorte === 'table' ? actif : null
  const consoleActive = actif?.sorte === 'console' ? actif : null

  // Le contexte du **centre** : le schéma de l'onglet actif, sinon celui que la sidebar désigne.
  // Distinct de la barre de titre, qui suit la base ouverte — `09e` a posé la distinction, et
  // elle ne devient visible qu'ici, avec plusieurs onglets.
  const contexte = table
    ? { project: table.key.project, database: table.key.database, schema: table.schema }
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
  const cible = table?.table ?? objetChoisi
  const { detail, loading, error } = useDetailTable(
    cle,
    contexte?.schema ?? null,
    cible,
    passerelleDetail,
  )

  const idActif = actif ? idOnglet(actif) : null
  const enEdition = edition || (idActif !== null && ongletsEnEdition.has(idActif))
  const attente = idActif === null ? [] : (attentes[idActif] ?? [])

  /** Pose l'attente de l'onglet actif. Un seul propriétaire de cet état, décidé en `11b`. */
  const onAttenteChange = useCallback(
    (suivante: EnAttente) => {
      if (idActif === null) return
      setAttentes((precedent) => ({ ...precedent, [idActif]: suivante }))
    },
    [idActif],
  )

  // Le SQL de `11c` vient du **moteur**, jamais de l'écran : composer un équivalent ici produirait
  // un texte *ressemblant* à celui qui partira, sous un titre qui promet l'exactitude.
  const [rafraichissement, setRafraichissement] = useState(0)
  // L'exécution des requêtes de console (`12c`). Elle vit ici parce que la confirmation est une
  // sous-modale de l'écran, comme celle de `11d`.
  const execution = useExecution(cle, passerelleExecution ?? PASSERELLE_EXECUTION)
  // Le texte de chaque console, indexé par l'identité de l'onglet — comme les modifications en
  // attente de `11b`. Fermer une console perd son texte, et c'est `12f` qui donnera le moyen de le
  // garder pour les requêtes qu'on choisit d'enregistrer.
  const [textes, setTextes] = useState<Readonly<Record<string, string>>>({})
  const application = useApplication(cle, table, attente, detail?.columns ?? [], {
    passerelle: passerelleApply ?? PASSERELLE_APPLY,
    // **Après le succès, la grille est relue et le modèle vidé.** Les valeurs écrites peuvent
    // différer de celles saisies — un `trigger`, une valeur par défaut, une troncature — et
    // afficher la saisie donnerait un écran qui ne reflète plus la base. Vider le modèle fait
    // disparaître d'un coup toutes les marques de `11b`, sans en effacer aucune à la main.
    surSucces: () => {
      onAttenteChange([])
      // Un compteur qui descend jusqu'à la grille, plutôt qu'une fonction de relecture remontée
      // depuis elle : l'écriture part du panneau droit, la lecture vit dans le centre.
      setRafraichissement((tour) => tour + 1)
    },
  })

  const sqlPrevu = useSqlPrevu(
    cle,
    table,
    attente,
    detail?.columns ?? [],
    passerellePreview ?? PASSERELLE_PREVIEW,
  )

  /**
   * `⌘E` bascule le mode édition de l'onglet actif.
   *
   * `10c` avait retiré « ⌘E pour éditer » de la barre d'état faute d'écran qui l'honore — un
   * raccourci affiché qui ne répond pas est pire qu'un raccourci absent (`09e`). Il répond
   * maintenant, et le rappel revient.
   */
  useEffect(() => {
    if (idActif === null) return
    function auClavier(evenement: KeyboardEvent) {
      if (!evenement.metaKey || evenement.key !== 'e') return
      evenement.preventDefault()
      setOngletsEnEdition((precedent) => {
        const suivant = new Set(precedent)
        // **Quitter le mode garde les modifications en attente** : les perdre sur une frappe serait
        // le défaut qu'`esc` fermant une modale pleine a déjà produit.
        if (suivant.has(idActif as string)) suivant.delete(idActif as string)
        else suivant.add(idActif as string)
        return suivant
      })
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [idActif])

  function ouvrirTable(objet: TableSummary) {
    if (!contexte) return
    setEtatOnglets((etat) =>
      ouvrir(etat, {
        sorte: 'table',
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
            {/* La pastille ouvre le menu des projets et bases (`08g`) : son chevron l'annonçait
                depuis `09c`, et son `onOpenProjects` n'était appelé par personne. */}
            <ProjectMenu
              projects={projects}
              actif={projetActif}
              onEdit={(projet, base) => onEditDatabase?.(projet, base)}
              onAddDatabase={onNewDatabase}
            >
              <ProjectPill
                pendingChanges={attente.length}
                projectName={projetActif?.name ?? '—'}
                breadcrumb={contexte ? `${contexte.database} · ${contexte.schema}` : undefined}
                connection={
                  contexte
                    ? etatDeBase(contexte.project, contexte.database, environnement)
                    : undefined
                }
              />
            </ProjectMenu>
            <EnvironmentPicker value={environnement} onValueChange={() => {}} />
          </>
        }
      />
      {/* Le bandeau du mode édition, **sous la barre de titre** et au-dessus du corps : c'est là que
          le mockup le place, et il court sur toute la largeur. */}
      {execution.aConfirmer && (
        <RunConfirm
          nature={execution.aConfirmer.nature}
          sansRestriction={execution.aConfirmer.sansWhere}
          cible={contexte ? `${contexte.database} · ${contexte.schema}` : '—'}
          production={environnement === 'prod'}
          enCours={execution.enCours}
          onClose={execution.annulerLaConfirmation}
          onConfirmer={execution.executer}
        />
      )}
      {application.confirmation && table && (
        <ApplyConfirm
          attente={attente}
          table={`${table.schema}.${table.table}`}
          enCours={application.enCours}
          onClose={application.annulerLaConfirmation}
          onConfirmer={application.appliquer}
        />
      )}
      {table && (
        <EditBanner
          compte={attente.length}
          table={`${table.schema}.${table.table}`}
          onToutAnnuler={() =>
            setAttentes((precedent) => ({ ...precedent, [idActif as string]: [] }))
          }
        />
      )}
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
              // La pastille de compte sur la table ouverte (`11b`) : le même modèle que le bandeau.
              modifications={
                table && attente.length > 0
                  ? { table: table.table, schema: table.schema, compte: attente.length }
                  : undefined
              }
              // Le « … » d'une ligne de base mène à la même modale que le menu de la pastille
              // (`08g`) : deux chemins vers un seul écran, et c'est voulu — l'arbre est là où
              // l'utilisateur regarde ses bases, la pastille là où il regarde son projet.
              // La sidebar nomme la base ; le projet, lui, connaît son objet `Database`.
              onEditDatabase={(nomProjet, nomBase) => {
                const base = projects
                  .find((projet) => projet.name === nomProjet)
                  ?.databases.find((declaration) => declaration.name === nomBase)
                if (base) onEditDatabase?.(nomProjet, base)
              }}
              onRenameProject={onRenameProject}
              // **Une console s'ouvre sur la base du contexte.** Sans base, pas de console : elle
              // n'aurait rien à interroger, et le bouton disparaît plutôt que d'ouvrir un onglet
              // inerte.
              onNewConsole={
                cle === null ? undefined : () => setEtatOnglets((etat) => ouvrirConsole(etat, cle))
              }
              // **Retirer une base ferme ses onglets**, et l'écran de travail est le seul à pouvoir
              // le faire : un onglet survivant lirait une base dont la déclaration est partie.
              onDelete={
                onDelete === undefined
                  ? undefined
                  : async (cible) => {
                      const issue = await onDelete(cible)
                      setEtatOnglets((etat) => sansLesOngletsDe(etat, cible))
                      setAttentes((precedent) =>
                        Object.fromEntries(
                          Object.entries(precedent).filter(([id]) => !viseeParLId(cible, id)),
                        ),
                      )
                      return issue
                    }
              }
              // Ce qui serait perdu, compté **avant** de le perdre : la confirmation le dit.
              modificationsEnAttenteDe={(cible) =>
                Object.entries(attentes)
                  .filter(([id]) => viseeParLId(cible, id))
                  .reduce((total, [, enAttente]) => total + enAttente.length, 0)
              }
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
                      sorte: 'table',
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
                table
                  ? {
                      table: table.table,
                      columns: detail?.columns ?? [],
                      loading,
                      annotations: annotationsDe(etatRequete, attente),
                    }
                  : undefined
              }
            />
          }
          end={
            // **Une console occupe toute la largeur du centre.** Le mockup d'`A7` ne montre pas de
            // panneau droit, et celui de `A5` proposerait ici de sélectionner une ligne d'un
            // résultat qui n'existe pas encore. Le centre est donc rendu seul ou dans le partage
            // selon ce que l'onglet ouvre. Vu à l'écran en assemblant `12a`.
            consoleActive ? (
              <div className={styles.centre}>
                <WorkbenchTabs
                  etat={etatOnglets}
                  onSelect={(id) => setEtatOnglets((etat) => ({ ...etat, actif: id }))}
                  onClose={(id) => setEtatOnglets((etat) => fermer(etat, id))}
                  onReorder={(ids) => setEtatOnglets((etat) => reordonner(etat, ids))}
                />
                {consoleActive && cle ? (
                  // La console SQL (`12a`). Elle occupe la largeur du centre ; le panneau droit
                  // reste celui de l'écran, et `12c` lui donnera un contenu utile.
                  <ConsoleView
                    // **Une instance par console, et `12b` lui donne sa raison** : CodeMirror tient
                    // son propre document, donc sans remontage la seconde console afficherait le
                    // texte de la première. `12a` avait retiré cette `key` faute de garantie
                    // mesurable — elle en a une maintenant.
                    key={idOnglet(consoleActive)}
                    texte={textes[idOnglet(consoleActive)] ?? ''}
                    onTexteChange={(texte) =>
                      setTextes((precedent) => ({
                        ...precedent,
                        [idOnglet(consoleActive)]: texte,
                      }))
                    }
                    contexte={contexte ? `${contexte.database} · ${contexte.schema}` : undefined}
                    onExecuter={cle === null ? undefined : execution.demander}
                    onExecuterLaSelection={cle === null ? undefined : execution.demander}
                    enCours={execution.enCours}
                    resultat={execution.resultat}
                    erreur={execution.erreur}
                  />
                ) : table && cle ? (
                  // Les lignes de la table ouverte (`10c`). La toolbar (`10e`) et le panneau
                  // de ligne (`10f`) viendront l'entourer.
                  <TableView
                    // Une instance par onglet : changer de table remonte la vue, donc remet
                    // filtres et tri à zéro sans effet de nettoyage.
                    key={`${table.key.project}/${table.key.database}/${table.schema}.${table.table}`}
                    cle={cle}
                    schema={table.schema}
                    table={table.table}
                    columns={detail?.columns ?? []}
                    passerelle={passerelleLignes}
                    onEtatChange={setEtatRequete}
                    onLectureChange={setLecture}
                    rang={rangChoisi}
                    onRangChange={setRangChoisi}
                    edition={enEdition}
                    rafraichissement={rafraichissement}
                    attente={attente}
                    onAttenteChange={onAttenteChange}
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
            ) : (
              <SplitPane
                storageKey="workbench:detail"
                defaultSize={296}
                min={240}
                max={420}
                handleShadow="end"
                // **Le panneau dimensionné est celui de droite.** Sans cela, c'est le centre qui
                // recevait 296 px et la grille tombait à zéro pixel de large — défaut de `10b`,
                // constaté en mesurant `A5` le 10 août 2026.
                sized="end"
                start={
                  <div className={styles.centre}>
                    <WorkbenchTabs
                      etat={etatOnglets}
                      onSelect={(id) => setEtatOnglets((etat) => ({ ...etat, actif: id }))}
                      onClose={(id) => setEtatOnglets((etat) => fermer(etat, id))}
                      onReorder={(ids) => setEtatOnglets((etat) => reordonner(etat, ids))}
                    />
                    {consoleActive && cle ? (
                      // La console SQL (`12a`). Elle occupe la largeur du centre ; le panneau droit
                      // reste celui de l'écran, et `12c` lui donnera un contenu utile.
                      <ConsoleView
                        texte={textes[idOnglet(consoleActive)] ?? ''}
                        onTexteChange={(texte) =>
                          setTextes((precedent) => ({
                            ...precedent,
                            [idOnglet(consoleActive)]: texte,
                          }))
                        }
                        contexte={
                          contexte ? `${contexte.database} · ${contexte.schema}` : undefined
                        }
                      />
                    ) : table && cle ? (
                      // Les lignes de la table ouverte (`10c`). La toolbar (`10e`) et le panneau
                      // de ligne (`10f`) viendront l'entourer.
                      <TableView
                        // Une instance par onglet : changer de table remonte la vue, donc remet
                        // filtres et tri à zéro sans effet de nettoyage.
                        key={`${table.key.project}/${table.key.database}/${table.schema}.${table.table}`}
                        cle={cle}
                        schema={table.schema}
                        table={table.table}
                        columns={detail?.columns ?? []}
                        passerelle={passerelleLignes}
                        onEtatChange={setEtatRequete}
                        onLectureChange={setLecture}
                        rang={rangChoisi}
                        onRangChange={setRangChoisi}
                        edition={enEdition}
                        rafraichissement={rafraichissement}
                        attente={attente}
                        onAttenteChange={onAttenteChange}
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
                  // **Un seul panneau droit, dont le contenu suit l'écran** : le détail de l'objet
                  // en `A4`, la ligne sélectionnée en `A5`, les modifications en attente en `A6`.
                  // Les empiler donnerait deux panneaux là où le mockup n'en montre qu'un.
                  //
                  // **En édition avec des modifications, ce panneau prend la place du détail** —
                  // conséquence assumée de `11c` : en éditant, ce qu'on veut voir est ce qu'on a
                  // changé, pas la ligne sélectionnée.
                  // Le panneau reste après une écriture réussie, pour montrer de quoi la défaire : le
                  // démonter avec la dernière carte emporterait le patch inverse.
                  table && cle && (attente.length > 0 || application.patchInverse !== null) ? (
                    <PendingPanel
                      attente={attente}
                      table={`${table.schema}.${table.table}`}
                      // `DatabaseKey.environment` est une chaîne côté IPC ; l'encart de production
                      // veut l'environnement **déclaré** du projet, qui est typé.
                      environment={environnement}
                      sql={sqlPrevu.sql}
                      erreurSql={sqlPrevu.erreur}
                      onRetirer={(cleLigne, column) =>
                        onAttenteChange(retirer(attente, cleLigne, column))
                      }
                      onToutAnnuler={() => onAttenteChange([])}
                      enCours={application.enCours}
                      refus={application.refus}
                      patchInverse={application.patchInverse}
                      onCopierLePatch={
                        application.patchInverse === null
                          ? undefined
                          : () => {
                              const texte = application.patchInverse
                              if (texte) void navigator.clipboard?.writeText(texte)
                            }
                      }
                      onAppliquer={application.demander}
                      onEcarterLePatch={application.ecarterLePatch}
                      onCopierLeSQL={
                        sqlPrevu.sql === null
                          ? undefined
                          : () => {
                              const texte = sqlPrevu.sql
                              if (texte) void navigator.clipboard?.writeText(texte)
                            }
                      }
                    />
                  ) : actif && cle ? (
                    <RowPanel
                      cle={cle}
                      columns={detail?.columns ?? []}
                      relations={detail?.relations ?? []}
                      ligne={lecture.ligne}
                      rang={lecture.rang}
                      total={lecture.total}
                      onNavigate={setRangChoisi}
                      onCopyInsert={
                        lecture.ligne
                          ? () => {
                              const valeurs = lecture.ligne
                              if (!valeurs) return
                              // La constante fige le rétrécissement de type : dans une closure,
                              // TypeScript ne peut pas savoir que `table` est encore non nul.
                              const ouverte = table
                              if (!ouverte) return
                              void rowAsInsert(cle, ouverte.schema, ouverte.table, valeurs).then(
                                (sql) => navigator.clipboard?.writeText(sql),
                              )
                            }
                          : undefined
                      }
                      passerelleDetail={passerelleDetail}
                      passerelleLignes={passerelleLignes ?? PASSERELLE_LIGNES}
                    />
                  ) : (
                    <DetailPanel
                      detail={detail}
                      schema={contexte?.schema ?? ''}
                      loading={loading}
                      error={error}
                      onOpenData={() => {
                        const objet = objets.find((o) => o.name === objetChoisi)
                        if (objet) ouvrirTable(objet)
                      }}
                    />
                  )
                }
              />
            )
          }
        />
      </div>
      {/* La barre d'état court sur toute la largeur, **sous les trois colonnes** — le mockup la
          place au niveau de la fenêtre, pas du centre. */}
      {/* **Sur `table`, pas sur `actif`** : ses chiffres sont ceux d'une lecture de table, et les
          afficher sous une console annoncerait « 500 lignes · limit 500 » pour une requête qui n'a
          pas tourné. Vu à l'écran en assemblant `12a`. La console porte son propre pied. */}
      {table && (
        <TableStatusBar
          fenetre={lecture.fenetre}
          loading={lecture.loading}
          error={lecture.error}
          pendingChanges={attente.length}
          editing={enEdition}
        />
      )}
    </div>
  )
}

/**
 * Ce que la sidebar écrit à droite d'une colonne : « filtré », « tri ↓ », « tri ↑ ».
 *
 * Les mots viennent du mockup, la flèche du sens. Une colonne à la fois filtrée et triée porte
 * les deux — le mockup n'en montre pas d'exemple, et taire l'un des deux états serait pire que
 * les écrire ensemble.
 */
function annotationsDe(
  etat: { filters: readonly Filter[]; sort: readonly SortKey[] },
  attente: EnAttente,
): Record<string, string> {
  const annotations: Record<string, string> = {}
  for (const filtre of etat.filters) annotations[filtre.column] = 'filtré'
  for (const critere of etat.sort) {
    const fleche = critere.direction === 'ascending' ? '↑' : '↓'
    annotations[critere.column] = annotations[critere.column]
      ? `filtré · tri ${fleche}`
      : `tri ${fleche}`
  }
  // **« modifié » prime** : c'est l'état le plus récent et le seul qui attend une action. Le mockup
  // de `A6` remplace bien « bpchar » et « tri ↓ » par « modifié » sur les colonnes touchées.
  for (const modification of attente) annotations[modification.column] = 'modifié'
  return annotations
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

/** L'état des onglets débarrassé de ceux qui lisaient la cible du retrait. */
function sansLesOngletsDe(etat: EtatOnglets, cible: CibleDeSuppression): EtatOnglets {
  return etat.onglets
    .map(idOnglet)
    .filter((id) => viseeParLId(cible, id))
    .reduce(fermer, etat)
}
