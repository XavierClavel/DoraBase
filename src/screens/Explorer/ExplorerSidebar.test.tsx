import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { EnvironmentId, Project } from '../../domain/config'
import type { ColumnInfo, ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { REGLAGES, TRIO_DE_TEST } from '../NewConnection/pourLesTests'
import { type Charge, idBase, idEnvironnement, idProjet, idSchema, type Noeud } from './arbre'
import type { CibleDeSuppression } from './DeleteConnectionDialog'
import { ExplorerSidebar, type ExplorerSidebarProps, filtrer } from './ExplorerSidebar'

const PROJETS: Project[] = [
  {
    name: 'Atelier Nord',
    environments: TRIO_DE_TEST,
    queries: [],
    databases: [
      // **Les deux connexions sont dans le même environnement** : le décor mesure le menu « … », le
      // filtre et le renommage de console, pas le palier d'environnement — `arbre.test.ts` s'en
      // charge. Les regrouper évite de déplier deux branches dans chaque test.
      {
        name: 'analytics',
        engine: 'postgresql',
        environment: 'prod',
        connection: REGLAGES,
        consoles: [],
      },
      { name: 'shop', engine: 'mysql', environment: 'prod', connection: REGLAGES, consoles: [] },
    ],
  },
]

const schema = (name: string): SchemaInfo => ({
  name,
  counts: { tables: 1, views: 0, functions: 0, indexes: 0 },
})
const table = (name: string): TableSummary => ({
  name,
  kind: 'table',
  rows: { kind: 'estimated', value: 1000 },
  sizeBytes: 1024,
  columnCount: 3,
  primaryKey: 'id',
  lastAnalyze: null,
  comment: null,
})

const RIEN: Charge = { schemas: {}, objets: {}, enCours: new Set(), echecs: {} }

const P = 'Atelier Nord'
const ID_PROJET = idProjet(P)
const ID_PROD = idEnvironnement(P, 'prod')
const ID_ANALYTICS = idBase(P, 'prod', 'analytics')
const ID_PUBLIC = idSchema(P, 'prod', 'analytics', 'public')

/** Le projet et son environnement `prod` dépliés : la porte d'entrée des connexions (`25a`). */
const JUSQU_AUX_CONNEXIONS = [ID_PROJET, ID_PROD]

/**
 * La ligne d'arbre dont le libellé est `label`, au palier `niveau`.
 *
 * Le nom accessible d'une ligne porte aussi sa méta et son badge — « prod PROD », « dev 0
 * connexion » — donc une expression régulière ancrée sur le seul libellé ne trouve rien, et une
 * non ancrée confond « Atelier » avec « Atelier Nord ». Le palier lève l'ambiguïté.
 */
function ligne(label: string, niveau: string): HTMLElement {
  const trouvee = screen
    .getAllByRole('treeitem')
    .find(
      (e) =>
        e.getAttribute('aria-level') === niveau &&
        (e.textContent === label || e.textContent?.startsWith(`${label} `) === true),
    )
  if (trouvee === undefined) throw new Error(`aucune ligne « ${label} » au palier ${niveau}`)
  return trouvee
}

function Piloté({
  charge = RIEN,
  initial = [] as string[],
  etat = { kind: 'never' } as ConnectionState,
  onToggleSpy,
  onEditDatabase,
  onEditProject,
  onDelete,
  modificationsEnAttenteDe,
  onRefresh,
  consoles,
  projets = PROJETS,
}: {
  charge?: Charge
  initial?: string[]
  etat?: ConnectionState
  onToggleSpy?: (n: Noeud) => void
  onEditDatabase?: (project: string, database: string, environment: EnvironmentId) => void
  onEditProject?: (project: string) => void
  onDelete?: (cible: CibleDeSuppression) => Promise<{ leftoverSecrets: string[] }>
  modificationsEnAttenteDe?: (cible: CibleDeSuppression) => number
  onRefresh?: () => void
  consoles?: ExplorerSidebarProps['consoles']
  projets?: Project[]
}) {
  const [deplies, setDeplies] = useState(new Set(initial))
  const [choisi, setChoisi] = useState<string | null>(null)
  return (
    <>
      <Sprite />
      <ExplorerSidebar
        projects={projets}
        deplies={deplies}
        charge={charge}
        etatDe={() => etat}
        selectedId={choisi}
        onEditDatabase={onEditDatabase}
        onEditProject={onEditProject}
        onDelete={onDelete}
        modificationsEnAttenteDe={modificationsEnAttenteDe}
        onRefresh={onRefresh}
        consoles={consoles}
        onSelect={(n) => setChoisi(n.id)}
        onToggle={(n) => {
          onToggleSpy?.(n)
          setDeplies((precedent) => {
            const suivant = new Set(precedent)
            if (suivant.has(n.id)) suivant.delete(n.id)
            else suivant.add(n.id)
            return suivant
          })
        }}
      />
    </>
  )
}

// --- L'arbre ---

test('l’arbre s’annonce comme tel, avec ses niveaux', () => {
  render(<Piloté initial={JUSQU_AUX_CONNEXIONS} />)
  // **« environnements » est dans le nom de l'arbre** depuis `25a` : c'est un palier, et l'annoncer
  // « Projets et bases » tairait ce qu'on parcourt.
  expect(
    screen.getByRole('tree', { name: 'Projets, environnements et connexions' }),
  ).toBeInTheDocument()
  const elements = screen.getAllByRole('treeitem')
  // L'arbre est aplati dans le DOM : `aria-level` porte la profondeur qu'une imbrication aurait
  // donnée gratuitement. Sans lui, un lecteur d'écran annoncerait une liste plate.
  //
  // Projet, ses trois environnements déclarés, puis les deux connexions de `prod` : les
  // environnements sont au niveau 2, les connexions au 3.
  expect(elements.map((e) => e.getAttribute('aria-level'))).toEqual(['1', '2', '2', '2', '3', '3'])
})

// Les cinq paliers, jusqu'au bout : projet, environnement, connexion, schéma, objet.
test('les cinq paliers s’annoncent de 1 à 5', () => {
  render(
    <Piloté
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS, ID_PUBLIC]}
      charge={{
        ...RIEN,
        schemas: { [ID_ANALYTICS]: [schema('public')] },
        objets: { [ID_PUBLIC]: [table('orders')] },
      }}
    />,
  )
  // `ligne` cherche par palier ; ces appels échouent donc si l'un des cinq manque.
  expect(ligne('Atelier Nord', '1')).toBeInTheDocument()
  expect(ligne('prod', '2')).toBeInTheDocument()
  expect(ligne('analytics', '3')).toBeInTheDocument()
  expect(ligne('public', '4')).toBeInTheDocument()
  expect(ligne('orders', '5')).toBeInTheDocument()
})

test('un nœud dépliable annonce son état, une feuille non', () => {
  render(
    <Piloté
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS, ID_PUBLIC]}
      charge={{
        ...RIEN,
        schemas: { [ID_ANALYTICS]: [schema('public')] },
        objets: { [ID_PUBLIC]: [table('orders')] },
      }}
    />,
  )
  expect(screen.getByRole('treeitem', { name: /^Atelier Nord/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  // Un objet est une feuille : `aria-expanded` sur une feuille annoncerait un enfant inexistant.
  expect(screen.getByRole('treeitem', { name: /orders/ })).not.toHaveAttribute('aria-expanded')
})

// **La contrainte transverse.** Un schéma replié ne produit aucun nœud enfant, donc l'écran n'a
// rien à demander : c'est ce que le compteur vérifie.
test('déplier un projet ne demande rien pour les schémas', async () => {
  const deplies: Noeud[] = []
  render(<Piloté onToggleSpy={(n) => deplies.push(n)} />)

  await userEvent.click(screen.getByRole('treeitem', { name: /Atelier Nord/ }))

  expect(deplies).toHaveLength(1)
  expect(deplies[0]?.kind).toBe('project')
  // Aucune base dépliée, donc aucune demande de schémas.
  expect(deplies.filter((n) => n.kind === 'database')).toHaveLength(0)
})

test('un clic sélectionne et déplie à la fois', async () => {
  render(<Piloté />)
  const projet = screen.getByRole('treeitem', { name: /Atelier Nord/ })
  await userEvent.click(projet)
  // Le mockup ne montre pas de zone de clic distincte pour le chevron ; en inventer une
  // réduirait la cible à onze pixels.
  expect(screen.getByRole('treeitem', { name: /Atelier Nord/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('treeitem', { name: /Atelier Nord/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})

// --- Les échecs ---

test('un dépliage qui échoue le dit sans vider l’arbre', () => {
  render(
    <Piloté
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      charge={{ ...RIEN, echecs: { [ID_ANALYTICS]: 'hôte injoignable' } }}
    />,
  )
  expect(screen.getByText('hôte injoignable')).toBeInTheDocument()
  // L'autre base est toujours là.
  expect(screen.getByRole('treeitem', { name: /shop/ })).toBeInTheDocument()
})

// Une ligne de message n'est **pas** un `treeitem` : ce n'est pas un nœud de l'arbre mais un état
// de son chargement, et l'annoncer comme tel ferait compter un enfant qui n'existe pas.
test('une ligne de message n’est pas un nœud de l’arbre', () => {
  render(
    <Piloté
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      charge={{ ...RIEN, enCours: new Set([ID_ANALYTICS]) }}
    />,
  )
  expect(screen.getByText('Chargement…')).toBeInTheDocument()
  expect(screen.queryByRole('treeitem', { name: 'Chargement…' })).not.toBeInTheDocument()
})

/*
 * **L'indentation d'une ligne de message vient d'`INDENT`, non d'une table CSS** (`25a`).
 *
 * Trois règles `.message[data-depth=…]` recopiaient les mêmes 36 et 52 px. Un palier de retard entre
 * les deux tables se lit comme un message mal aligné, et personne n'y pense en ajoutant un palier.
 * Le style en ligne est donc ce qui est testable ici — jsdom ne calcule pas le CSS.
 */
test('une ligne de message est indentée par INDENT, en style en ligne', () => {
  render(
    <Piloté
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      charge={{ ...RIEN, enCours: new Set([ID_ANALYTICS]) }}
    />,
  )
  // Un message enfant d'une connexion (palier 2) est au palier 3 : `INDENT[3]`.
  expect(screen.getByText('Chargement…')).toHaveStyle({ paddingLeft: '52px' })
})

// **Un environnement vide le dit** (`23g`), à sa juste indentation : palier 2, donc `INDENT[2]`.
test('un environnement déplié sans connexion le dit, aligné au palier 2', () => {
  render(<Piloté initial={[ID_PROJET, idEnvironnement(P, 'staging')]} />)
  const vide = screen.getByText('Aucune connexion déclarée en staging')
  expect(vide).toHaveStyle({ paddingLeft: '36px' })
  // Ce n'est pas un nœud de l'arbre : c'est un fait sur son contenu.
  expect(screen.queryByRole('treeitem', { name: /Aucune connexion/ })).toBeNull()
})

// --- Les états de connexion ---

test('l’état d’une base est dans son nom accessible, pas seulement en couleur', () => {
  render(
    <Piloté
      initial={JUSQU_AUX_CONNEXIONS}
      etat={{ kind: 'offline', reason: 'hôte injoignable' }}
    />,
  )
  expect(
    screen.getByRole('treeitem', { name: /analytics · hors ligne : hôte injoignable/ }),
  ).toBeInTheDocument()
})

// --- Le palier d'environnement (`25a`) ---

/**
 * Un environnement de production **qui ne s'appelle pas « prod »**, et un qui s'appelle « prod »
 * sans l'être : la seule forme de décor qui distingue le drapeau du libellé.
 */
const PROJET_A_DRAPEAUX: Project[] = [
  {
    name: P,
    environments: [
      { id: 'atelier', label: 'Atelier', color: 'green', production: true },
      { id: 'prod', label: 'prod', color: 'red', production: false },
    ],
    queries: [],
    databases: [
      {
        name: 'catalogue',
        engine: 'postgresql',
        environment: 'atelier',
        connection: REGLAGES,
        consoles: [],
      },
    ],
  },
]

test('le badge PROD d’un environnement suit son drapeau, jamais son libellé', () => {
  render(<Piloté projets={PROJET_A_DRAPEAUX} initial={[ID_PROJET]} />)
  // « Atelier » n'a rien de « prod » dans son nom, et porte pourtant le badge.
  expect(ligne('Atelier', '2')).toHaveTextContent('PROD')
  // « prod » n'est pas marqué : aucun badge, sinon la garantie de `23g` serait fausse à l'écran.
  expect(ligne('prod', '2')).not.toHaveTextContent('PROD')
})

test('un environnement replié dit son compte de connexions', () => {
  render(<Piloté projets={PROJET_A_DRAPEAUX} initial={[ID_PROJET]} />)
  expect(ligne('Atelier', '2')).toHaveTextContent('1 connexion')
  expect(ligne('prod', '2')).toHaveTextContent('0 connexion')
})

// La ligne projet a perdu son badge d'environnement : il nommait un environnement actif qui
// n'existe plus, et l'agréger serait inventer un état composite (`09c`).
test('la ligne projet ne porte plus de badge d’environnement', () => {
  render(<Piloté projets={PROJET_A_DRAPEAUX} />)
  const projet = screen.getByRole('treeitem', { name: /Atelier Nord/ })
  expect(projet).not.toHaveTextContent('PROD')
  // Ce qu'elle porte à la place : le compte de connexions du projet entier.
  expect(projet).toHaveTextContent('1 connexion')
})

// --- Le filtre ---

// **Les ancêtres d'une correspondance sont conservés** : filtrer sur « orders » sans garder son
// schéma et sa base produirait une ligne orpheline, indentée sans parent visible.
test('le filtre garde les ancêtres d’une correspondance', () => {
  // Cinq paliers depuis `25a` : l'environnement est un ancêtre à conserver comme les autres.
  const noeuds: Noeud[] = [
    { id: 'p', kind: 'project', depth: 0, label: 'Halle' },
    { id: 'e', kind: 'environment', depth: 1, label: 'Atelier' },
    { id: 'd', kind: 'database', depth: 2, label: 'analytics' },
    { id: 's', kind: 'schema', depth: 3, label: 'public' },
    { id: 'o', kind: 'object', depth: 4, label: 'orders' },
    { id: 'o2', kind: 'object', depth: 4, label: 'users' },
  ]
  expect(filtrer(noeuds, 'orders').map((n) => n.id)).toEqual(['p', 'e', 'd', 's', 'o'])
})

test('un filtre vide ne retire rien', () => {
  const noeuds: Noeud[] = [{ id: 'p', kind: 'project', depth: 0, label: 'Halle' }]
  expect(filtrer(noeuds, '   ')).toHaveLength(1)
})

test('le filtre ignore la casse', () => {
  const noeuds: Noeud[] = [{ id: 'p', kind: 'project', depth: 0, label: 'Atelier' }]
  expect(filtrer(noeuds, 'ATELIER')).toHaveLength(1)
})

// Une ligne de message ne doit pas « correspondre » : filtrer sur « chargement » ferait
// apparaître des états au lieu de données.
test('le filtre ne fait pas correspondre les lignes de message', () => {
  const noeuds: Noeud[] = [
    { id: 'p', kind: 'project', depth: 0, label: 'Halle' },
    { id: 'm', kind: 'message', depth: 2, label: 'Chargement…', message: true },
  ]
  expect(filtrer(noeuds, 'chargement')).toHaveLength(0)
})

test('un filtre sans résultat le dit', async () => {
  render(<Piloté initial={JUSQU_AUX_CONNEXIONS} />)
  await userEvent.type(screen.getByLabelText(/Filtrer/), 'zzz')
  expect(screen.getByText(/Aucune ligne affichée ne correspond/)).toBeInTheDocument()
})

// Le compteur `n/m` de `04` rappelle implicitement que le filtre porte sur ce qui est affiché.
test('le filtre affiche son compteur, et seulement quand il est actif', async () => {
  render(<Piloté initial={JUSQU_AUX_CONNEXIONS} />)
  expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText(/Filtrer/), 'analytics')
  // Six lignes affichées — projet, trois environnements, deux connexions — dont trois retenues :
  // `analytics` et ses deux ancêtres, le projet et l'environnement `prod`.
  expect(screen.getByText('3/6')).toBeInTheDocument()
})

// --- Le pied ---

test('le pied porte les actions de création, et plus le rafraîchissement', () => {
  render(<Piloté />)
  // **« Ajouter une connexion », et non « une base »** (`24d`) : depuis `23b`, une base présente en dev
  // et en prod fait deux connexions. Écart au handoff assumé, qui dit « base ».
  expect(screen.getByRole('button', { name: /Ajouter une connexion/ })).toBeInTheDocument()
  // **Le pied ne porte plus que des gestes de création** (20 août 2026). « Rafraîchir » y était la
  // seule action qui ne créait rien, et la seule sans libellé ; elle vit maintenant dans le menu
  // « … » d'une ligne projet, sous son nom long — voir le test qui suit, qui vérifie qu'elle n'a pas
  // disparu du produit au passage.
  expect(screen.queryByRole('button', { name: 'Rafraîchir' })).toBeNull()
})

// **Le geste n'est pas supprimé, il est déplacé** — et ce test est ce qui l'atteste. `rafraichir`
// vide tout le cache de l'arbre, et `useArbre` justifie l'absence de rechargement au second dépliage
// par son existence : sans lui, un arbre périmé ne se récupérerait qu'en redémarrant l'application.
test('« Rafraîchir l’arborescence » vit dans le menu d’une ligne projet', async () => {
  const rafraichir = vi.fn()
  render(<Piloté onRefresh={rafraichir} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: /Rafraîchir l’arborescence/ }))
  expect(rafraichir).toHaveBeenCalledOnce()
})

test('« Nouveau projet » n’est rendu que si le geste existe', () => {
  render(<Piloté />)
  // Sans la prop, le bouton n'est **pas rendu** — et non rendu inerte : un contrôle qui ne fait rien
  // est pire qu'un contrôle absent (défaut n° 36). C'est le cas de la galerie.
  expect(screen.queryByRole('button', { name: /Nouveau projet/ })).toBeNull()
})

// --- Le menu « … » des lignes (`08h`) ---

/** Un retrait qui n'a rien laissé dans le Trousseau. */
const AUCUN_RESIDU = { leftoverSecrets: [] }

const TOUT_DEPLIE = [ID_PROJET, ID_PROD, ID_ANALYTICS, ID_PUBLIC]

test('seules les lignes projet et base portent un « … »', () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      charge={{ ...RIEN, schemas: { ...RIEN.schemas }, objets: { ...RIEN.objets } }}
    />,
  )
  // Les deux projets/bases visibles en ont un ; le second projet est absent du décor, donc on
  // compte ce qui est là : un projet et deux bases.
  expect(screen.getByRole('button', { name: 'Actions de Atelier Nord' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Actions de analytics' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Actions de shop' })).toBeInTheDocument()
})

test('un schéma et une table n’en portent pas — il n’y a rien à y configurer', () => {
  const charge: Charge = {
    schemas: { [ID_ANALYTICS]: [schema('public')] },
    objets: { [ID_PUBLIC]: [table('orders')] },
    enCours: new Set(),
    echecs: {},
  }
  render(<Piloté initial={TOUT_DEPLIE} charge={charge} />)
  // Le décor doit bien contenir ces deux lignes, sinon le test ne mesure que leur absence.
  expect(screen.getByRole('treeitem', { name: /public/ })).toBeInTheDocument()
  expect(screen.getByRole('treeitem', { name: /orders/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Actions de public' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Actions de orders' })).not.toBeInTheDocument()
})

test('« Modifier… » porte les coordonnées du nœud, pas une déduction sur son libellé', async () => {
  const vues: unknown[] = []
  render(<Piloté initial={TOUT_DEPLIE} onEditDatabase={(...args) => vues.push(args)} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de shop' }))
  await userEvent.click(screen.getByRole('button', { name: 'Modifier…' }))
  // L'environnement vient du projet, la base de son nœud : deux bases homonymes dans deux projets
  // seraient indiscernables sans ces coordonnées, et c'est la clé d'identité de `05a`.
  expect(vues).toEqual([['Atelier Nord', 'shop', 'prod']])
})

test('le retrait se désactive quand l’écran ne le relie à rien', async () => {
  render(<Piloté initial={TOUT_DEPLIE} onEditDatabase={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  // **Présente et désactivée**, pas absente : la cacher ferait croire qu'elle n'existera jamais, la
  // laisser cliquable et inerte ferait croire à une panne (défaut n° 36).
  expect(screen.getByRole('button', { name: 'Retirer de DoraBase…' })).toBeDisabled()
})

test('l’entrée du menu dit « Retirer de DoraBase », jamais « supprimer »', async () => {
  render(<Piloté initial={TOUT_DEPLIE} onDelete={async () => AUCUN_RESIDU} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))

  const menu = screen.getByRole('dialog', { name: 'Actions' })
  // **Le mot compte, et c'est toute la décision de `08j`** : ce qui part est une déclaration sur cet
  // ordinateur, pas une base de données. « Supprimer analytics » dans un client de bases se lit
  // comme un `DROP DATABASE`.
  expect(menu).toHaveTextContent('Retirer de DoraBase…')
  expect(menu.textContent?.toLowerCase()).not.toContain('supprimer')
})

test('la confirmation nomme ce qui part et ce qui n’est pas touché', async () => {
  render(<Piloté initial={TOUT_DEPLIE} onDelete={async () => AUCUN_RESIDU} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))

  const modale = screen.getByRole('dialog', { name: /Retirer analytics de DoraBase/ })
  expect(modale).toHaveTextContent('effacé de cet ordinateur')
  expect(modale).toHaveTextContent('mots de passe enregistrés dans le Trousseau')
  // **Le fait qui rassure, dit aussi clairement que celui qui inquiète.** C'est la seule chose ici
  // qui pourrait coûter des données à quelqu'un : croire qu'on efface son serveur.
  expect(modale).toHaveTextContent('n’est pas touché : le serveur et ses données')
  expect(modale).toHaveTextContent('n’envoie aucune commande à la base')
  // Pas d'annulation : la configuration est un fichier, la restaurer relève d'une sauvegarde.
  expect(modale).toHaveTextContent('pas d’annulation')
  // Le bouton porte le verbe du geste, jamais « OK ».
  expect(screen.getByRole('button', { name: 'Retirer la connexion' })).toBeInTheDocument()
})

test('retirer un projet compte ses connexions et porte son propre verbe', async () => {
  const vues: unknown[] = []
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onDelete={async (cible) => {
        vues.push(cible)
        return AUCUN_RESIDU
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))

  const modale = screen.getByRole('dialog', { name: /Retirer Atelier Nord de DoraBase/ })
  // Deux bases dans le décor : la confirmation compte ce qui part plutôt que de rester vague.
  expect(modale).toHaveTextContent('ses 2 connexions déclarées')
  await userEvent.click(screen.getByRole('button', { name: 'Retirer le projet' }))
  expect(vues).toEqual([{ kind: 'project', project: 'Atelier Nord', connexions: 2 }])
})

test('les modifications en attente perdues sont comptées dans la confirmation', async () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onDelete={async () => AUCUN_RESIDU}
      modificationsEnAttenteDe={() => 3}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))

  // **Une confirmation qui tairait cette perte serait un piège** : les onglets se ferment, et ce qui
  // attendait d'être écrit disparaît.
  expect(screen.getByRole('dialog', { name: /Retirer analytics/ })).toHaveTextContent(
    '3 modifications en attente seront perdues',
  )
})

test('un mot de passe resté dans le Trousseau est dit, et la modale attend', async () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onDelete={async () => ({ leftoverSecrets: ['Atelier Nord/analytics/prod'] })}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer la connexion' }))

  expect(await screen.findByRole('status')).toHaveTextContent('n’a pas pu être effacé')
  expect(screen.getByRole('dialog', { name: /Retirer analytics/ })).toBeInTheDocument()
})

test('un refus s’affiche dans la confirmation, qui reste ouverte', async () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onDelete={async () => {
        throw new Error('la configuration n’a pas pu être écrite')
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))
  await userEvent.click(screen.getByRole('button', { name: 'Retirer la connexion' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('pas pu être écrite')
  expect(screen.getByRole('dialog', { name: /Retirer analytics/ })).toBeInTheDocument()
})

// **Les cinq tests du dialogue de renommage sont partis avec lui** (`23e`) : `RenameProjectDialog`
// n'existe plus, son contenu a déménagé dans `ProjectEditor`, et ses tests avec — voir
// `ProjectEditor.test.tsx`. Ce qui reste ici est ce que la sidebar fait vraiment : appeler le geste.
test('« Modifier le projet… » appelle le geste d’édition, sur ce projet', async () => {
  const vus: string[] = []
  render(<Piloté initial={TOUT_DEPLIE} onEditProject={(projet) => vus.push(projet)} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Modifier le projet…' }))

  expect(vus).toEqual(['Atelier Nord'])
  // **La sidebar ne monte plus la modale** : les deux points d'entrée de `23e` vivent dans l'écran de
  // travail, et une modale montée ici serait inatteignable depuis la pastille de la barre de titre.
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('« Modifier le projet… » se désactive quand l’écran ne la relie à rien', async () => {
  render(<Piloté initial={TOUT_DEPLIE} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  expect(screen.getByRole('button', { name: 'Modifier le projet…' })).toBeDisabled()
})

test('« Modifier… » se désactive quand l’écran ne la relie à rien', async () => {
  render(<Piloté initial={TOUT_DEPLIE} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  // Une action branchée sur rien est le défaut n° 36 : mieux vaut le dire que laisser cliquer.
  expect(screen.getByRole('button', { name: 'Modifier…' })).toBeDisabled()
})

describe('la section contextuelle : colonnes déclarées ou schéma déduit (`13c`)', () => {
  const champ = (nom: string, frequence: number | null): ColumnInfo => ({
    position: 1,
    name: nom,
    typeName: 'string',
    category: 'text',
    nullable: true,
    default: null,
    identity: null,
    key: null,
    comment: null,
    frequency: frequence,
  })

  function monterAvec(colonnes: ColumnInfo[]) {
    render(
      <>
        <Sprite />
        <ExplorerSidebar
          projects={[]}
          deplies={new Set<string>()}
          charge={RIEN}
          etatDe={() => ({ kind: 'never' })}
          selectedId={null}
          onSelect={() => {}}
          onToggle={() => {}}
          columns={{ table: 'evenements', columns: colonnes }}
        />
      </>,
    )
  }

  it('dit « Colonnes de » quand les colonnes sont déclarées', () => {
    monterAvec([champ('statut', null)])
    expect(screen.getByText('Colonnes de evenements')).toBeInTheDocument()
    // Le type s'affiche : il n'y a pas de fréquence à dire.
    expect(screen.getByText('string')).toBeInTheDocument()
  })

  it('dit « Schéma déduit de » dès qu’un champ porte une fréquence', () => {
    // **Le mot le plus important de la section** : les champs viennent d'un échantillon (`18d`),
    // pas d'un catalogue. Le titre se déduit de la donnée plutôt que d'un drapeau qu'un appelant
    // pourrait oublier de poser.
    monterAvec([champ('canal', 0.98)])
    expect(screen.getByText('Schéma déduit de evenements')).toBeInTheDocument()
  })

  it('affiche la fréquence d’un champ partiel, et le type d’un champ complet', () => {
    monterAvec([champ('canal', 0.98), champ('sorte', 1)])
    // `98 %` prend la place du type — c'est ce que le mockup d'`A8` montre.
    expect(screen.getByText('98 %')).toBeInTheDocument()
    // **Un champ à 100 % garde son type** : répéter « 100 % » sur quinze lignes noierait les deux
    // qui ne le sont pas, et ce sont celles-là qui comptent.
    expect(screen.getByText('string')).toBeInTheDocument()
    expect(screen.queryByText('100 %')).toBeNull()
  })

  it('arrondit sans faire disparaître un champ presque complet', () => {
    // 0,996 s'arrondirait à « 100 % », ce qui serait un mensonge de précision : au-delà du seuil, on
    // affiche le type plutôt qu'un pourcentage faux.
    monterAvec([champ('presque', 0.996)])
    expect(screen.queryByText(/%/)).toBeNull()
  })
})

// --- Les consoles dans l'arbre, et leur renommage sur place ---

/** Le décor de `PROJETS`, avec une console sur la connexion `analytics`. */
function avecConsole(nom: string): Project[] {
  return PROJETS.map((projet) => ({
    ...projet,
    databases: projet.databases.map((base) =>
      base.name === 'analytics' ? { ...base, consoles: [{ name: nom, sql: '' }] } : base,
    ),
  }))
}

const GESTES_DE_CONSOLE = {
  onCreer: () => {},
  onRenommer: () => {},
  onRetirer: () => {},
}

test('un double-clic sur une console ouvre le champ de renommage', async () => {
  render(
    <Piloté
      projets={avecConsole('console 1')}
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      consoles={GESTES_DE_CONSOLE}
    />,
  )
  await userEvent.dblClick(screen.getByRole('treeitem', { name: /console 1/ }))
  // Le champ prend la place du libellé, et son contenu est **présélectionné** : un renommage
  // commence presque toujours par tout remplacer.
  const champ = screen.getByLabelText('Nouveau nom de console 1')
  expect(champ).toHaveValue('console 1')
})

test('« Entrée » valide le renommage, « Échap » l’abandonne', async () => {
  const renommer = vi.fn()
  const gestes = { ...GESTES_DE_CONSOLE, onRenommer: renommer }
  render(
    <Piloté
      projets={avecConsole('console 1')}
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      consoles={gestes}
    />,
  )

  await userEvent.dblClick(screen.getByRole('treeitem', { name: /console 1/ }))
  await userEvent.clear(screen.getByLabelText('Nouveau nom de console 1'))
  await userEvent.type(screen.getByLabelText('Nouveau nom de console 1'), 'Audit{Enter}')
  expect(renommer).toHaveBeenCalledWith('Atelier Nord', 'analytics', 'prod', 'console 1', 'Audit')

  renommer.mockClear()
  await userEvent.dblClick(screen.getByRole('treeitem', { name: /console 1/ }))
  await userEvent.type(screen.getByLabelText('Nouveau nom de console 1'), 'Perdu{Escape}')
  // **Un double-clic de trop doit pouvoir être abandonné sans réfléchir.**
  expect(renommer).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Nouveau nom de console 1')).toBeNull()
})

test('un nom vide ou inchangé n’envoie rien', async () => {
  const renommer = vi.fn()
  render(
    <Piloté
      projets={avecConsole('console 1')}
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      consoles={{ ...GESTES_DE_CONSOLE, onRenommer: renommer }}
    />,
  )

  await userEvent.dblClick(screen.getByRole('treeitem', { name: /console 1/ }))
  await userEvent.clear(screen.getByLabelText('Nouveau nom de console 1'))
  await userEvent.keyboard('{Enter}')
  // Les deux sont des non-gestes : les envoyer ferait refuser le premier par le cœur et écrire le
  // second pour rien.
  expect(renommer).not.toHaveBeenCalled()
})

test('les autres lignes de l’arbre ne se renomment pas au double-clic', async () => {
  render(
    <Piloté
      projets={avecConsole('console 1')}
      initial={[...JUSQU_AUX_CONNEXIONS, ID_ANALYTICS]}
      consoles={GESTES_DE_CONSOLE}
    />,
  )
  // Le nom d'une connexion se change dans sa modale de configuration, qui porte bien d'autres
  // champs ; celui d'une table ou d'un schéma vient du serveur.
  await userEvent.dblClick(screen.getByRole('treeitem', { name: /analytics/ }))
  expect(screen.queryByLabelText(/Nouveau nom de/)).toBeNull()
})
