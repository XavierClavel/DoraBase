import { type ReactNode, useMemo, useState } from 'react'
import type { EnvironmentId, Project } from '../../domain/config'
import type { ColumnInfo, ConnectionState } from '../../domain/engine'
import { Badge } from '../../ui/Badge/Badge'
import { ColumnRow } from '../../ui/ColumnRow/ColumnRow'
import { Sidebar } from '../../ui/Sidebar/Sidebar'
import { SidebarFilterBar } from '../../ui/SidebarFilterBar/SidebarFilterBar'
import {
  SidebarFooter,
  SidebarFooterButton,
  SidebarFooterRow,
} from '../../ui/SidebarFooter/SidebarFooter'
import { SidebarSectionTitle } from '../../ui/SidebarSectionTitle/SidebarSectionTitle'
import { TreeRow } from '../../ui/TreeRow/TreeRow'
import { aplatir, type Charge, type Deplies, type Noeud } from './arbre'
import { type CibleDeSuppression, DeleteConnectionDialog } from './DeleteConnectionDialog'
import styles from './ExplorerSidebar.module.css'
import { RowMenu } from './RowMenu'

export type ExplorerSidebarProps = {
  projects: readonly Project[]
  deplies: Deplies
  charge: Charge
  etatDe: (
    project: string,
    database: string,
    environment: Project['activeEnvironment'],
  ) => ConnectionState
  selectedId?: string | null
  onToggle: (noeud: Noeud) => void
  onSelect: (noeud: Noeud) => void
  onAddDatabase?: () => void
  /**
   * Ouvre l'étape 1 du parcours de création (`24d`).
   *
   * Absent, le bouton n'est pas rendu — et non rendu inerte : un contrôle qui ne fait rien est pire
   * qu'un contrôle absent (défaut n° 36). C'est le cas de la galerie, où aucune commande ne répond.
   */
  onNewProject?: () => void
  onRefresh?: () => void
  /**
   * Ce qu'on peut faire d'une console depuis l'arbre — créer, renommer, retirer.
   *
   * **La création part du menu d'une connexion**, et de là seulement : une console appartient à une
   * connexion, et l'endroit où on la crée doit dire laquelle. Créer l'ouvre — personne ne crée une
   * console pour ne pas l'ouvrir.
   */
  consoles?: {
    onCreer: (project: string, database: string, environment: EnvironmentId) => void
    /** Le nouveau nom est **fourni** : le renommage se fait sur place, il n'ouvre pas de modale. */
    onRenommer: (
      project: string,
      database: string,
      environment: EnvironmentId,
      nom: string,
      nouveau: string,
    ) => void
    onRetirer: (project: string, database: string, environment: EnvironmentId, nom: string) => void
  }
  /**
   * Modifier la configuration d'une base depuis son « … » (`08h`) — ouvre la modale de `08g`.
   *
   * Absent, l'entrée « Modifier… » est désactivée avec sa raison plutôt que cliquable et inerte.
   */
  onEditDatabase?: (project: string, database: string, environment: EnvironmentId) => void
  /**
   * Ouvre la modale d'édition d'un projet depuis son « … » (`23e`).
   *
   * **Elle remplace « Renommer… »** : le renommage de `08i` est devenu le premier champ de cet écran,
   * et l'ancienne modale n'existe plus. La sidebar ne monte donc plus rien elle-même pour ce geste —
   * la modale vit dans l'écran de travail, qui porte aussi l'autre point d'entrée (la pastille de la
   * barre de titre). Absent, l'entrée est désactivée avec sa raison.
   */
  onEditProject?: (project: string) => void
  /**
   * Retirer la déclaration d'une base, ou un projet entier (`08j`).
   *
   * Une seule prop pour les deux : la cible dit lequel, et deux props jumelles se seraient
   * désynchronisées.
   */
  onDelete?: (cible: CibleDeSuppression) => Promise<{ leftoverSecrets: string[] }>
  /**
   * Les modifications en attente (`11b`) que la fermeture des onglets ferait perdre.
   *
   * L'arbre ne connaît pas les onglets : seul l'écran de travail sait ce qui attend d'être écrit, et
   * une confirmation qui tairait cette perte serait un piège.
   */
  modificationsEnAttenteDe?: (cible: CibleDeSuppression) => number
  /**
   * La section contextuelle « Colonnes de *table* » des écrans de travail (`A5` → `A9`).
   *
   * Absente dans `A4`, où aucune table n'est ouverte : le handoff ne la montre que sous un
   * onglet actif. Les annotations « filtré » et « tri ↓ » du mockup viendront avec `10d`, qui
   * crée l'état qu'elles reflètent — les inventer ici afficherait un état que rien ne produit.
   */
  columns?: {
    table: string
    columns: readonly ColumnInfo[]
    loading?: boolean
    /**
     * Ce que `A5` annote sur une colonne : « filtré », « tri ↓ ». Rendu en accent, à la place du
     * type. **L'état vient de la vue de table** (`10d`) : une copie ici divergerait au premier
     * filtre modifié.
     */
    annotations?: Readonly<Record<string, string>>
  }
  /** Voir `Sidebar` : `fill` dans l'écran de travail, où un `SplitPane` porte la largeur. */
  width?: 'standard' | 'wide' | 'fill'
  /**
   * Le compte de modifications en attente sur une table (`11b`), en pastille d'accent sur sa ligne.
   *
   * Le mockup de `A6` remplace le compte de lignes (« 1.9 M ») par ce compte : ce qui attend d'être
   * écrit importe plus que la taille de la table, et les deux au même endroit se liraient mal.
   */
  modifications?: { schema: string; table: string; compte: number }
}

/** Au-delà, la liste se résume — le mockup montre sept colonnes puis « + 11 autres ». */
const APERCU_COLONNES = 7

/**
 * La sidebar de `A4` : filtre, arbre à quatre niveaux, pied.
 *
 * L'arbre est **aplati par `arbre.ts`**, fonction pure et testée sans DOM. Ce composant ne fait
 * que rendre la liste de nœuds et router les clics — `TreeRow` de `04` étant purement
 * présentationnelle, « elle ne connaît ni ses enfants, ni son état d'ouverture, ni le modèle de
 * données ».
 */
export function ExplorerSidebar({
  projects,
  deplies,
  charge,
  etatDe,
  selectedId = null,
  onToggle,
  onSelect,
  onAddDatabase,
  onNewProject,
  onRefresh,
  consoles,
  onEditDatabase,
  onEditProject,
  onDelete,
  modificationsEnAttenteDe,
  columns,
  width = 'wide',
  modifications,
}: ExplorerSidebarProps) {
  const [filtre, setFiltre] = useState('')
  /**
   * La console en cours de renommage, par identité de nœud.
   *
   * **Ici et non chez l'appelant** : c'est un état d'interface, qui meurt avec la ligne et n'intéresse
   * ni l'écran de travail ni le disque. Le remonter aurait fait voyager un identifiant de nœud à
   * travers deux composants pour revenir se poser sur la même ligne.
   */
  const [enRenommage, setEnRenommage] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<CibleDeSuppression | null>(null)
  const demanderLeRetrait = onDelete === undefined ? undefined : setARetirer

  const noeuds = useMemo(
    () => aplatir(projects, deplies, charge, etatDe),
    [projects, deplies, charge, etatDe],
  )

  const visibles = useMemo(() => filtrer(noeuds, filtre), [noeuds, filtre])

  return (
    <>
      {aRetirer !== null && onDelete !== undefined && (
        <DeleteConnectionDialog
          cible={aRetirer}
          modificationsEnAttente={modificationsEnAttenteDe?.(aRetirer) ?? 0}
          onClose={() => setARetirer(null)}
          onDelete={() => onDelete(aRetirer)}
        />
      )}
      <Sidebar
        width={width}
        filter={
          // Le compteur `n/m` de `04` sert ici : il dit combien de lignes **affichées** le filtre
          // retient, ce qui rappelle implicitement qu'il ne cherche pas au-delà.
          <SidebarFilterBar
            value={filtre}
            onChange={setFiltre}
            matchCount={filtre === '' ? undefined : visibles.length}
            totalCount={filtre === '' ? undefined : noeuds.length}
          />
        }
        footer={
          /* **Deux actions de création, une seule facture** — refondu le 20 août 2026, en trois
             passes le même jour. Le pied empilait d'abord deux registres : « Nouvelle console » en
             bouton bordé pleine largeur, puis deux pastilles nues partageant une barre de 28 px avec
             l'icône « Rafraîchir ». Trois gestes de même nature s'annonçaient de trois façons.

             Il ne reste que les deux gestes de **structure**, côte à côte et de même facture.
             « Nouvelle console » est parti à son tour : une console appartient à une connexion, et le
             pied ne sait pas laquelle — il fallait deviner le contexte, et se tromper dès que deux
             connexions étaient dépliées. Le menu « … » de la connexion, lui, ne devine rien.

             Les libellés visibles restent **courts** (« Connexion », « Projet ») : c'est le défaut
             n° 102, et à 180 px — largeur minimale de la sidebar — « Ajouter une connexion » ne
             tient pas. Le nom accessible reste entier par `aria-label`, et le raccourci vit dans
             l'infobulle, comme `⌘E` et `⌘↩` ailleurs dans ce produit.

             **« Rafraîchir » a quitté le pied** et vit dans le menu « … » de la ligne projet, sous
             son nom long. Il n'est pas supprimé : il vide tout le cache de l'arbre, et
             `useArbre.ts` justifie l'absence de rechargement au second dépliage par son existence
             même — sans lui, un arbre périmé ne se récupérerait qu'en redémarrant. */
          <SidebarFooter>
            <SidebarFooterRow>
              <SidebarFooterButton
                icon="plus"
                onClick={onAddDatabase}
                aria-label="Ajouter une connexion"
                title="Ajouter une connexion (⇧⌘N)"
              >
                Connexion
              </SidebarFooterButton>
              {/* **Le second geste de création, ici même** (`24d`). La sidebar est l'endroit où l'on
                  regarde ses projets, donc l'endroit où l'on en ajoute un. Le sac est le glyphe du
                  projet dans tout le produit — pastille de la barre de titre, arbre, modales — donc il
                  se lit sans son libellé. */}
              {onNewProject && (
                <SidebarFooterButton
                  icon="bag"
                  onClick={onNewProject}
                  aria-label="Nouveau projet"
                  title="Nouveau projet (⌘N)"
                >
                  Projet
                </SidebarFooterButton>
              )}
            </SidebarFooterRow>
          </SidebarFooter>
        }
      >
        {/* `role="tree"` et `treeitem` : l'arbre est aplati dans le DOM, donc `aria-level` porte la
          profondeur qu'une imbrication aurait donnée gratuitement. Sans lui, un lecteur d'écran
          annoncerait une liste plate de vingt éléments sans hiérarchie. */}
        <div role="tree" aria-label="Projets et bases" className={styles.tree}>
          {visibles.length === 0 && filtre !== '' && (
            <p className={styles.vide}>Aucune ligne affichée ne correspond à « {filtre} ».</p>
          )}
          {visibles.map((noeud) =>
            noeud.message ? (
              // Une ligne de message n'est pas un `treeitem` : ce n'est pas un nœud de l'arbre
              // mais un état de son chargement, et l'annoncer comme tel ferait compter un
              // enfant qui n'existe pas.
              <p key={noeud.id} className={styles.message} data-depth={noeud.depth}>
                {noeud.label}
              </p>
            ) : (
              <TreeRow
                key={noeud.id}
                // Le rôle est **sur la ligne elle-même**, qui est un `<button>` : une enveloppe le
                // portant mettrait l'élément interactif à l'intérieur du nœud d'arbre, où ni le
                // clic ni le focus ne le désignent.
                role="treeitem"
                aria-level={noeud.depth + 1}
                aria-expanded={noeud.chevron ? noeud.chevron === 'open' : undefined}
                aria-selected={noeud.id === selectedId}
                aria-label={noeud.announce}
                depth={noeud.depth}
                label={noeud.label}
                /* **Le double-clic renomme**, comme dans un explorateur de fichiers — et seulement
                   une console : c'est le seul nœud de l'arbre dont le nom nous appartienne. Celui
                   d'une table ou d'un schéma vient du serveur, celui d'une connexion se change dans
                   sa modale de configuration, qui porte bien d'autres champs. */
                onDoubleClick={
                  noeud.kind === 'console' && consoles !== undefined
                    ? () => setEnRenommage(noeud.id)
                    : undefined
                }
                edition={
                  enRenommage === noeud.id && consoles !== undefined
                    ? {
                        onValider: (nouveau) => {
                          setEnRenommage(null)
                          if (
                            noeud.project === undefined ||
                            noeud.database === undefined ||
                            noeud.environment === undefined ||
                            noeud.console === undefined
                          ) {
                            return
                          }
                          consoles.onRenommer(
                            noeud.project,
                            noeud.database,
                            noeud.environment,
                            noeud.console,
                            nouveau,
                          )
                        },
                        onAnnuler: () => setEnRenommage(null),
                      }
                    : undefined
                }
                icon={noeud.icon as never}
                iconColor={noeud.iconColor}
                chevron={noeud.chevron}
                meta={compteDe(noeud, modifications) ?? noeud.meta}
                metaVariant={compteDe(noeud, modifications) ? 'caps' : noeud.metaVariant}
                metaBadge={compteDe(noeud, modifications) !== undefined}
                selected={noeud.id === selectedId}
                strong={noeud.kind === 'project'}
                trailing={
                  noeud.badge ? (
                    <Badge tone={noeud.badge.tone} size="xs">
                      {noeud.badge.text}
                    </Badge>
                  ) : undefined
                }
                actions={menuDe(
                  noeud,
                  onEditDatabase,
                  onEditProject,
                  demanderLeRetrait,
                  onRefresh,
                  consoles,
                  setEnRenommage,
                )}
                onClick={() => {
                  // Un clic sur une ligne dépliable fait les deux : il sélectionne *et* déplie. Le
                  // mockup ne montre pas de zone de clic distincte pour le chevron, et en inventer
                  // une réduirait la cible à onze pixels.
                  onSelect(noeud)
                  if (noeud.chevron) onToggle(noeud)
                }}
              />
            ),
          )}
        </div>
        {columns && (
          <section className={styles.colonnes}>
            {/* **« Schéma déduit » quand il l'est** (`13c`). Le mot est le plus important de cette
                section : les champs viennent d'un **échantillon** (`18d`), pas d'un catalogue. Le
                titre se déduit de la donnée — une colonne qui porte une fréquence est une colonne
                déduite — plutôt que d'un drapeau que l'appelant pourrait oublier de poser. */}
            <SidebarSectionTitle>
              {estDeduit(columns.columns)
                ? `Schéma déduit de ${columns.table}`
                : `Colonnes de ${columns.table}`}
            </SidebarSectionTitle>
            {columns.loading ? (
              <p className={styles.message}>Chargement des colonnes…</p>
            ) : (
              <>
                {columns.columns.slice(0, APERCU_COLONNES).map((colonne) => (
                  <ColumnRow
                    key={colonne.name}
                    label={colonne.name}
                    // La clé prime sur la catégorie : le mockup montre une icône de clé pour `id`
                    // et de clé étrangère pour `user_id`, et un glyphe de type pour les autres.
                    typeIcon={colonne.key === 'primary' ? 'key' : colonne.key ? 'fk' : undefined}
                    typeIconColor={colonne.key === 'primary' ? 'var(--gold)' : 'var(--info)'}
                    typeGlyph={colonne.key ? undefined : glypheDe(colonne.category)}
                    meta={
                      columns.annotations?.[colonne.name] ??
                      // **La fréquence prend la place du type quand elle est partielle** — c'est
                      // ce que le mockup d'`A8` montre : `channel 98 %`. Un champ à 100 % affiche
                      // son type : répéter « 100 % » sur quinze lignes noierait les deux qui ne
                      // le sont pas, et ce sont celles-là qui comptent.
                      frequenceLisible(colonne) ??
                      colonne.typeName
                    }
                    metaActive={
                      columns.annotations?.[colonne.name] !== undefined ||
                      frequenceLisible(colonne) !== null
                    }
                  />
                ))}
                {columns.columns.length > APERCU_COLONNES && (
                  <ColumnRow
                    label={`+ ${columns.columns.length - APERCU_COLONNES} autres`}
                    summary
                  />
                )}
              </>
            )}
          </section>
        )}
      </Sidebar>
    </>
  )
}

/**
 * Le compte de modifications d'une ligne d'arbre, s'il la concerne.
 *
 * Comparé sur le **triplet** schéma / table, pas sur le seul nom : deux schémas peuvent avoir une
 * table homonyme, et la pastille se poserait sur les deux.
 */
function compteDe(
  noeud: Noeud,
  modifications?: { schema: string; table: string; compte: number },
): string | undefined {
  if (!modifications || noeud.kind !== 'object') return undefined
  if (noeud.label !== modifications.table || noeud.schema !== modifications.schema) return undefined
  return String(modifications.compte)
}

/**
 * Le glyphe de catégorie du mockup : `T` pour du texte, `#` pour un nombre, `⏱` pour une date.
 *
 * La catégorie vient de l'adaptateur (`06a`) et non d'une analyse du nom de type : dériver
 * « int8 » ou « bpchar » dans l'écran l'obligerait à connaître les types de sept moteurs.
 */
function glypheDe(category: ColumnInfo['category']): string {
  switch (category) {
    case 'number':
      return '#'
    case 'timestamp':
      return '⏱'
    case 'json':
      return '{}'
    case 'uuid':
      return 'ID'
    default:
      return 'T'
  }
}

/**
 * Le filtre, sur ce qui est **affiché**.
 *
 * Il ne peut pas trouver une table d'un schéma jamais déplié : elle n'a jamais traversé l'IPC.
 * Le placeholder de `SidebarFilterBar` — « Filtrer l'arborescence… », posé en `04` et confirmé
 * sur le mockup — le dit implicitement. La vraie réponse au besoin de chercher partout est la
 * recherche globale `⌘P`, hors périmètre de `09d`.
 *
 * **Les ancêtres d'une correspondance sont conservés** : filtrer sur « orders » sans garder son
 * schéma et sa base produirait une ligne orpheline, indentée sans parent visible.
 */
export function filtrer(noeuds: readonly Noeud[], filtre: string): Noeud[] {
  const terme = filtre.trim().toLowerCase()
  if (terme === '') return [...noeuds]

  const garde = new Set<string>()
  // Les ancêtres se retrouvent par la pile de profondeur : l'arbre étant aplati dans l'ordre du
  // parcours, le dernier nœud de profondeur n-1 est le parent.
  const pile: Noeud[] = []
  for (const noeud of noeuds) {
    pile.length = noeud.depth
    pile[noeud.depth] = noeud
    if (!noeud.message && noeud.label.toLowerCase().includes(terme)) {
      for (const ancetre of pile) if (ancetre) garde.add(ancetre.id)
    }
  }

  return noeuds.filter((noeud) => garde.has(noeud.id))
}

/**
 * Le menu « … » d'une ligne, ou rien (`08h`).
 *
 * **Seuls le projet et la base en ont un** : ce sont les deux lignes qui portent une configuration.
 * Un schéma et une table viennent de la base, il n'y a rien à y modifier — et ce qu'un menu y
 * offrirait (copier le nom, ouvrir dans un onglet) n'est pas de la configuration.
 */
function menuDe(
  noeud: Noeud,
  onEditDatabase: ExplorerSidebarProps['onEditDatabase'],
  onEditProject: ExplorerSidebarProps['onEditProject'],
  demanderLeRetrait: ((cible: CibleDeSuppression) => void) | undefined,
  onRefresh: ExplorerSidebarProps['onRefresh'],
  consoles: ExplorerSidebarProps['consoles'],
  demanderLeRenommage: (id: string) => void,
): ReactNode | undefined {
  if (noeud.kind === 'project') {
    return (
      <RowMenu
        cible={noeud.label}
        entrees={[
          {
            /* **« Rafraîchir l'arborescence », et non « Rafraîchir »** — l'action a quitté le pied
               de la sidebar le 20 août 2026, où son icône seule faisait nombre avec trois boutons
               de création qu'elle ne rejoignait pas.

               Le nom long lève une ambiguïté qui existait déjà : la toolbar d'une table porte un
               « Rafraîchir » qui relit **les lignes**, quand celui-ci vide le cache de **l'arbre**.
               Deux boutons de même nom pour deux portées différentes — `e2e/10e-toolbar.spec.ts` le
               contournait par un commentaire.

               Sa portée est celle de l'arbre entier, pas du seul projet cliqué ; le menu d'une ligne
               projet est néanmoins le seul déjà monté, et la racine est l'endroit le moins mensonger
               pour l'accrocher. */
            libelle: 'Rafraîchir l’arborescence',
            icone: 'refresh',
            onClick: onRefresh,
            raison: onRefresh ? undefined : RAISONS.rafraichirIndisponible,
          },
          {
            // **« Modifier le projet… » et non « Renommer… »** (`23e`) : l'écran fait les deux, et
            // un libellé qui n'annonce que le renommage cacherait les environnements.
            libelle: 'Modifier le projet…',
            icone: 'pencil',
            onClick: onEditProject ? () => onEditProject(noeud.label) : undefined,
            raison: onEditProject ? undefined : RAISONS.editionIndisponible,
          },
          {
            // **« Retirer… » et non « Supprimer… »** : le mot compte, et c'est toute la décision de
            // `08j`. Ce qui part est une déclaration sur cet ordinateur, pas une base de données.
            libelle: 'Retirer de DoraBase…',
            icone: 'trash',
            onClick: demanderLeRetrait
              ? () =>
                  demanderLeRetrait({
                    kind: 'project',
                    project: noeud.label,
                    connexions: noeud.connexions ?? 0,
                  })
              : undefined,
            raison: demanderLeRetrait ? undefined : RAISONS.retirerIndisponible,
          },
        ]}
      />
    )
  }

  /* **Le menu d'une console** : renommer, retirer. Pas de « Modifier… » — une console se modifie en
     l'ouvrant et en y écrivant, ce que le clic sur la ligne fait déjà. */
  if (noeud.kind === 'console') {
    const { project, database, environment, console: nom } = noeud
    if (
      consoles === undefined ||
      project === undefined ||
      database === undefined ||
      environment === undefined ||
      nom === undefined
    ) {
      return undefined
    }
    return (
      <RowMenu
        cible={nom}
        entrees={[
          {
            /* **Le même mécanisme que le double-clic**, pas une modale. L'entrée reste malgré tout :
               un geste qui n'existe qu'au double-clic est invisible pour qui ne l'essaie pas, et
               inatteignable au clavier. Elle passe la ligne en édition, le champ prend le focus. */
            libelle: 'Renommer…',
            icone: 'pencil',
            onClick: () => demanderLeRenommage(noeud.id),
          },
          {
            // **« Retirer… » et non « Supprimer… »**, comme partout : le mot est celui de `08j`.
            libelle: 'Retirer…',
            icone: 'trash',
            onClick: () => consoles.onRetirer(project, database, environment, nom),
          },
        ]}
      />
    )
  }

  if (noeud.kind !== 'database') return undefined

  // Les coordonnées viennent du **nœud**, jamais d'une déduction sur son libellé : deux bases
  // peuvent porter le même nom dans deux projets, et c'est la clé d'identité de `05a`.
  const { project, label, environment } = noeud
  const modifiable =
    onEditDatabase !== undefined && project !== undefined && environment !== undefined

  return (
    <RowMenu
      cible={label}
      entrees={[
        {
          /* **La création d'une console part d'ici**, et non du pied de la sidebar. Une console
             appartient à une connexion : l'endroit d'où on la crée doit dire laquelle, sans quoi il
             faudrait deviner le contexte — et se tromper dès que deux connexions sont dépliées. */
          libelle: 'Nouvelle console…',
          icone: 'term',
          onClick:
            consoles && project !== undefined && environment !== undefined
              ? () => consoles.onCreer(project, label, environment)
              : undefined,
          raison: consoles ? undefined : RAISONS.consoleIndisponible,
        },
        {
          libelle: 'Modifier…',
          icone: 'pencil',
          onClick: modifiable
            ? () => onEditDatabase(project as string, label, environment as EnvironmentId)
            : undefined,
          raison: modifiable ? undefined : RAISONS.modifierIndisponible,
        },
        {
          libelle: 'Retirer de DoraBase…',
          icone: 'trash',
          onClick:
            demanderLeRetrait && project !== undefined
              ? () =>
                  demanderLeRetrait({
                    kind: 'database',
                    project,
                    database: label,
                    // L'environnement fait partie de l'identité de la connexion (`23b`) : sans lui, le
                    // retrait viserait la première connexion de ce nom, quel que soit l'environnement.
                    environment: environment as EnvironmentId,
                    connexions: noeud.connexions ?? 1,
                  })
              : undefined,
          raison: demanderLeRetrait ? undefined : RAISONS.retirerIndisponible,
        },
      ]}
    />
  )
}

/**
 * Pourquoi une entrée n'est pas encore là — **dite, jamais devinée**. La règle de `09f`, et la
 * leçon du défaut n° 36 : un bouton cliquable et inerte se lit comme une panne.
 */
const RAISONS = {
  renommerIndisponible: 'Cet écran n’est pas relié à la commande de renommage.',
  retirerIndisponible: 'Cet écran n’est pas relié à la commande de retrait.',
  modifierIndisponible: 'Cet écran n’est pas relié à la modale de modification.',
  editionIndisponible: 'Cet écran n’est pas relié à la modale d’édition de projet.',
  rafraichirIndisponible: 'Cet écran ne charge pas l’arborescence.',
  consoleIndisponible: 'Cet écran n’est pas relié à la création de consoles.',
}

/**
 * Vrai quand ces colonnes sont **déduites** et non déclarées (`13c`).
 *
 * La fréquence est `None` pour un moteur relationnel — une colonne y existe pour toutes les lignes,
 * la question ne se pose pas (`18d`). Sa présence est donc le signal, et il vient de la donnée : un
 * drapeau passé par l'appelant serait un drapeau qu'on peut oublier de poser.
 */
function estDeduit(colonnes: readonly ColumnInfo[]): boolean {
  return colonnes.some((colonne) => colonne.frequency !== null)
}

/**
 * `98 %` pour un champ partiel, `null` pour un champ complet ou déclaré.
 *
 * **Un champ à 100 % n'est pas garanti pour autant** : l'échantillon n'est pas la collection. C'est
 * la limite de l'exercice, et elle est dite dans le titre de la section — « déduit » — plutôt que
 * répétée sur chaque ligne.
 */
function frequenceLisible(colonne: ColumnInfo): string | null {
  if (colonne.frequency === null || colonne.frequency >= 0.995) return null
  return `${Math.round(colonne.frequency * 100)} %`
}
