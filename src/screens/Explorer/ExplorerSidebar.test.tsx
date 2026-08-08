import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { Project } from '../../domain/config'
import type { ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { type Charge, idBase, idProjet, idSchema, type Noeud } from './arbre'
import { ExplorerSidebar, filtrer } from './ExplorerSidebar'

const PROJETS: Project[] = [
  {
    name: 'Atelier Nord',
    activeEnvironment: 'prod',
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
}: {
  charge?: Charge
  initial?: string[]
  etat?: ConnectionState
  onToggleSpy?: (n: Noeud) => void
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
