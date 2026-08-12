import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { Environment, Project } from '../../domain/config'
import type { ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { type Charge, idBase, idProjet, idSchema, type Noeud } from './arbre'
import type { CibleDeSuppression } from './DeleteConnectionDialog'
import { ExplorerSidebar, filtrer } from './ExplorerSidebar'

const PROJETS: Project[] = [
  {
    name: 'Atelier Nord',
    activeEnvironment: 'prod',
    queries: [],
    databases: [
      { name: 'analytics', engine: 'postgresql', variants: [] },
      { name: 'shop', engine: 'mysql', variants: [] },
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

function Piloté({
  charge = RIEN,
  initial = [] as string[],
  etat = { kind: 'never' } as ConnectionState,
  onToggleSpy,
  onEditDatabase,
  onRenameProject,
  onDelete,
  modificationsEnAttenteDe,
}: {
  charge?: Charge
  initial?: string[]
  etat?: ConnectionState
  onToggleSpy?: (n: Noeud) => void
  onEditDatabase?: (project: string, database: string, environment: Environment) => void
  onRenameProject?: (
    project: string,
    nom: string,
  ) => Promise<{ missingSecrets: string[]; leftoverSecrets: string[] }>
  onDelete?: (cible: CibleDeSuppression) => Promise<{ leftoverSecrets: string[] }>
  modificationsEnAttenteDe?: (cible: CibleDeSuppression) => number
}) {
  const [deplies, setDeplies] = useState(new Set(initial))
  const [choisi, setChoisi] = useState<string | null>(null)
  return (
    <>
      <Sprite />
      <ExplorerSidebar
        projects={PROJETS}
        deplies={deplies}
        charge={charge}
        etatDe={() => etat}
        selectedId={choisi}
        onEditDatabase={onEditDatabase}
        onRenameProject={onRenameProject}
        onDelete={onDelete}
        modificationsEnAttenteDe={modificationsEnAttenteDe}
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
  render(<Piloté initial={[idProjet('Atelier Nord')]} />)
  expect(screen.getByRole('tree', { name: 'Projets et bases' })).toBeInTheDocument()
  const elements = screen.getAllByRole('treeitem')
  // L'arbre est aplati dans le DOM : `aria-level` porte la profondeur qu'une imbrication aurait
  // donnée gratuitement. Sans lui, un lecteur d'écran annoncerait une liste plate.
  expect(elements.map((e) => e.getAttribute('aria-level'))).toEqual(['1', '2', '2'])
})

test('un nœud dépliable annonce son état, une feuille non', () => {
  const idS = idSchema('Atelier Nord', 'analytics', 'public')
  render(
    <Piloté
      initial={[idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics'), idS]}
      charge={{
        ...RIEN,
        schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
        objets: { [idS]: [table('orders')] },
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
  const idB = idBase('Atelier Nord', 'analytics')
  render(
    <Piloté
      initial={[idProjet('Atelier Nord'), idB]}
      charge={{ ...RIEN, echecs: { [idB]: 'hôte injoignable' } }}
    />,
  )
  expect(screen.getByText('hôte injoignable')).toBeInTheDocument()
  // L'autre base est toujours là.
  expect(screen.getByRole('treeitem', { name: /shop/ })).toBeInTheDocument()
})

// Une ligne de message n'est **pas** un `treeitem` : ce n'est pas un nœud de l'arbre mais un état
// de son chargement, et l'annoncer comme tel ferait compter un enfant qui n'existe pas.
test('une ligne de message n’est pas un nœud de l’arbre', () => {
  const idB = idBase('Atelier Nord', 'analytics')
  render(
    <Piloté
      initial={[idProjet('Atelier Nord'), idB]}
      charge={{ ...RIEN, enCours: new Set([idB]) }}
    />,
  )
  expect(screen.getByText('Chargement…')).toBeInTheDocument()
  expect(screen.queryByRole('treeitem', { name: 'Chargement…' })).not.toBeInTheDocument()
})

// --- Les états de connexion ---

test('l’état d’une base est dans son nom accessible, pas seulement en couleur', () => {
  render(
    <Piloté
      initial={[idProjet('Atelier Nord')]}
      etat={{ kind: 'offline', reason: 'hôte injoignable' }}
    />,
  )
  expect(
    screen.getByRole('treeitem', { name: /analytics · hors ligne : hôte injoignable/ }),
  ).toBeInTheDocument()
})

// --- Le filtre ---

// **Les ancêtres d'une correspondance sont conservés** : filtrer sur « orders » sans garder son
// schéma et sa base produirait une ligne orpheline, indentée sans parent visible.
test('le filtre garde les ancêtres d’une correspondance', () => {
  const noeuds: Noeud[] = [
    { id: 'p', kind: 'project', depth: 0, label: 'Print' },
    { id: 'd', kind: 'database', depth: 1, label: 'analytics' },
    { id: 's', kind: 'schema', depth: 2, label: 'public' },
    { id: 'o', kind: 'object', depth: 3, label: 'orders' },
    { id: 'o2', kind: 'object', depth: 3, label: 'users' },
  ]
  expect(filtrer(noeuds, 'orders').map((n) => n.id)).toEqual(['p', 'd', 's', 'o'])
})

test('un filtre vide ne retire rien', () => {
  const noeuds: Noeud[] = [{ id: 'p', kind: 'project', depth: 0, label: 'Print' }]
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
    { id: 'p', kind: 'project', depth: 0, label: 'Print' },
    { id: 'm', kind: 'message', depth: 2, label: 'Chargement…', message: true },
  ]
  expect(filtrer(noeuds, 'chargement')).toHaveLength(0)
})

test('un filtre sans résultat le dit', async () => {
  render(<Piloté initial={[idProjet('Atelier Nord')]} />)
  await userEvent.type(screen.getByLabelText(/Filtrer/), 'zzz')
  expect(screen.getByText(/Aucune ligne affichée ne correspond/)).toBeInTheDocument()
})

// Le compteur `n/m` de `04` rappelle implicitement que le filtre porte sur ce qui est affiché.
test('le filtre affiche son compteur, et seulement quand il est actif', async () => {
  render(<Piloté initial={[idProjet('Atelier Nord')]} />)
  expect(screen.queryByText('3/3')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText(/Filtrer/), 'analytics')
  expect(screen.getByText('2/3')).toBeInTheDocument()
})

// --- Le pied ---

test('le pied porte les deux actions du handoff', () => {
  render(<Piloté />)
  expect(screen.getByRole('button', { name: /Ajouter une base/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Rafraîchir' })).toBeInTheDocument()
})

// --- Le menu « … » des lignes (`08h`) ---

/** Un renommage sans rien à signaler — le cas courant. */
const VIDE = { missingSecrets: [], leftoverSecrets: [] }

/** Un retrait qui n'a rien laissé dans le Trousseau. */
const AUCUN_RESIDU = { leftoverSecrets: [] }

const TOUT_DEPLIE = [
  idProjet('Atelier Nord'),
  idBase('Atelier Nord', 'analytics'),
  idSchema('Atelier Nord', 'analytics', 'public'),
]

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
    schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
    objets: { [idSchema('Atelier Nord', 'analytics', 'public')]: [table('orders')] },
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

test('« Renommer… » ouvre la modale de renommage, sur ce projet', async () => {
  render(<Piloté initial={TOUT_DEPLIE} onRenameProject={async () => VIDE} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Renommer…' }))

  const modale = screen.getByRole('dialog', { name: /Renommer Atelier Nord/ })
  // Le champ part du nom actuel : le vider obligerait à retaper un nom qu'on veut seulement corriger.
  expect(screen.getByLabelText('Nom du projet')).toHaveValue('Atelier Nord')
  // **Ce que le renommage entraîne est dit avant de le faire** : déplacer des mots de passe et
  // fermer des connexions n'est pas ce qu'on attend d'un changement de nom.
  expect(modale).toHaveTextContent('mots de passe enregistrés suivent')
  expect(modale).toHaveTextContent('connexions ouvertes de ce projet seront fermées')
})

test('le renommage passe le projet et le nouveau nom, débarrassé de ses espaces', async () => {
  const vus: unknown[] = []
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onRenameProject={async (...args) => {
        vus.push(args)
        return VIDE
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Renommer…' }))
  const champ = screen.getByLabelText('Nom du projet')
  await userEvent.clear(champ)
  await userEvent.type(champ, '  Atelier  ')
  await userEvent.click(screen.getByRole('button', { name: 'Renommer' }))

  expect(vus).toEqual([['Atelier Nord', 'Atelier']])
  // Une modale qui reste ouverte après un succès sans rien à dire ferait croire à un échec.
  expect(screen.queryByRole('dialog', { name: /Renommer/ })).not.toBeInTheDocument()
})

test('un refus s’affiche dans la modale, qui reste ouverte', async () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onRenameProject={async () => {
        throw new Error('un projet nommé « Outils » existe déjà')
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Renommer…' }))
  await userEvent.clear(screen.getByLabelText('Nom du projet'))
  await userEvent.type(screen.getByLabelText('Nom du projet'), 'Outils')
  await userEvent.click(screen.getByRole('button', { name: 'Renommer' }))

  // À côté du champ qu'il faut corriger, comme le refus de connexion de `08d` — pas dans une alerte
  // système, qui obligerait à la fermer avant de pouvoir relire ce qu'on avait tapé.
  expect(await screen.findByRole('alert')).toHaveTextContent('existe déjà')
  expect(screen.getByRole('dialog', { name: /Renommer/ })).toBeInTheDocument()
})

test('un mot de passe introuvable est dit, et la modale ne se referme pas dessus', async () => {
  render(
    <Piloté
      initial={TOUT_DEPLIE}
      onRenameProject={async () => ({
        missingSecrets: ['Atelier Nord/analytics/prod'],
        leftoverSecrets: [],
      })}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  await userEvent.click(screen.getByRole('button', { name: 'Renommer…' }))
  await userEvent.click(screen.getByRole('button', { name: 'Renommer' }))

  // **Refermer sur un succès muet cacherait le fait.** Une base qui redemande son mot de passe sans
  // raison apparente se découvrirait des semaines plus tard, sur un échec de connexion.
  const rapport = await screen.findByRole('status')
  expect(rapport).toHaveTextContent('introuvables dans le Trousseau')
  expect(screen.getByRole('dialog', { name: /Renommer/ })).toBeInTheDocument()
})

test('« Renommer… » se désactive quand l’écran ne la relie à rien', async () => {
  render(<Piloté initial={TOUT_DEPLIE} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de Atelier Nord' }))
  expect(screen.getByRole('button', { name: 'Renommer…' })).toBeDisabled()
})

test('« Modifier… » se désactive quand l’écran ne la relie à rien', async () => {
  render(<Piloté initial={TOUT_DEPLIE} />)
  await userEvent.click(screen.getByRole('button', { name: 'Actions de analytics' }))
  // Une action branchée sur rien est le défaut n° 36 : mieux vaut le dire que laisser cliquer.
  expect(screen.getByRole('button', { name: 'Modifier…' })).toBeDisabled()
})
