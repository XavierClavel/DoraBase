import type { Project } from '../../domain/config'
import type { ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { REGLAGES, TRIO_DE_TEST } from '../NewConnection/pourLesTests'
import { aplatir, type Charge, idBase, idProjet, idSchema } from './arbre'

const RIEN: Charge = { schemas: {}, objets: {}, enCours: new Set(), echecs: {} }
const JAMAIS = (): ConnectionState => ({ kind: 'never' })

function projet(overrides: Partial<Project> = {}): Project {
  return {
    name: 'Atelier Nord',
    activeEnvironment: 'prod',
    environments: TRIO_DE_TEST,
    queries: [],
    databases: [
      // **Dans l'environnement actif du projet** (`23g`) : l'arbre ne liste que celles-là.
      {
        name: 'analytics',
        engine: 'postgresql',
        environment: 'prod',
        connection: REGLAGES,
        consoles: [],
      },
      { name: 'shop', engine: 'mysql', environment: 'prod', connection: REGLAGES, consoles: [] },
    ],
    ...overrides,
  }
}

const schema = (name: string): SchemaInfo => ({
  name,
  counts: { tables: 4, views: 1, functions: 2, indexes: 6 },
})

const table = (name: string, kind: TableSummary['kind'] = 'table'): TableSummary => ({
  name,
  kind,
  rows: { kind: 'estimated', value: 1_900_000 },
  sizeBytes: 2048,
  columnCount: 18,
  primaryKey: 'id',
  lastAnalyze: null,
  comment: null,
})

// --- Le dépliage paresseux ---

// **La contrainte transverse appliquée à l'arbre.** Un schéma replié ne produit aucun nœud
// enfant, donc l'écran n'a rien à demander : demander tous les objets de tous les schémas de
// toutes les bases au chargement serait ce que `06c` a découpé pour éviter.
test('un projet replié ne produit que sa propre ligne', () => {
  const noeuds = aplatir([projet()], new Set(), RIEN, JAMAIS)
  expect(noeuds).toHaveLength(1)
  expect(noeuds[0]?.kind).toBe('project')
})

test('un projet déplié produit ses bases, pas leurs schémas', () => {
  const noeuds = aplatir([projet()], new Set([idProjet('Atelier Nord')]), RIEN, JAMAIS)
  expect(noeuds.map((n) => n.kind)).toEqual(['project', 'database', 'database'])
})

test('une base dépliée sans schémas chargés annonce un chargement', () => {
  const deplies = new Set([idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics')])
  const charge: Charge = { ...RIEN, enCours: new Set([idBase('Atelier Nord', 'analytics')]) }
  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  expect(noeuds.find((n) => n.message)?.label).toBe('Chargement…')
})

test('un schéma replié ne produit aucun objet', () => {
  const deplies = new Set([idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics')])
  const charge: Charge = {
    ...RIEN,
    schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
    objets: { [idSchema('Atelier Nord', 'analytics', 'public')]: [table('orders')] },
  }
  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  // Les objets sont **chargés** mais le schéma est replié : rien ne doit apparaître.
  expect(noeuds.some((n) => n.kind === 'object')).toBe(false)
})

test('un schéma déplié produit ses objets', () => {
  const idS = idSchema('Atelier Nord', 'analytics', 'public')
  const deplies = new Set([idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics'), idS])
  const charge: Charge = {
    ...RIEN,
    schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
    objets: { [idS]: [table('orders'), table('orders_by_day', 'view')] },
  }
  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  const objets = noeuds.filter((n) => n.kind === 'object')
  expect(objets.map((o) => o.label)).toEqual(['orders', 'orders_by_day'])
  // Les vues portent l'icône et la teinte violette du handoff, les tables la verte.
  expect(objets[0]?.iconColor).toContain('success')
  expect(objets[1]?.iconColor).toContain('violet')
})

// --- Les échecs ---

// Un dépliage qui échoue le dit **sur sa ligne** et ne vide pas l'arbre : une erreur de réseau
// sur un schéma ne doit pas faire disparaître les autres.
test('un dépliage qui échoue le dit sans vider l’arbre', () => {
  const idB = idBase('Atelier Nord', 'analytics')
  const deplies = new Set([idProjet('Atelier Nord'), idB])
  const charge: Charge = { ...RIEN, echecs: { [idB]: 'hôte injoignable' } }

  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  expect(noeuds.find((n) => n.message)?.label).toBe('hôte injoignable')
  // L'autre base est toujours là.
  expect(noeuds.some((n) => n.label === 'shop')).toBe(true)
})

// Vide **chargé** n'est pas vide **non chargé** : un schéma sans table est un état normal, et ne
// rien afficher laisserait croire que le dépliage n'a pas abouti.
test('un schéma chargé mais vide le dit', () => {
  const idS = idSchema('Atelier Nord', 'analytics', 'public')
  const deplies = new Set([idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics'), idS])
  const charge: Charge = {
    ...RIEN,
    schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
    objets: { [idS]: [] },
  }
  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  expect(noeuds.find((n) => n.message)?.label).toBe('Aucun objet')
})

test('une ligne de message n’est pas sélectionnable', () => {
  const idB = idBase('Atelier Nord', 'analytics')
  const charge: Charge = { ...RIEN, echecs: { [idB]: 'échec' } }
  const noeuds = aplatir([projet()], new Set([idProjet('Atelier Nord'), idB]), charge, JAMAIS)
  expect(noeuds.find((n) => n.message)?.message).toBe(true)
})

// --- Les états de connexion ---

// `never` n'a **aucun badge** : une base qu'on n'a pas ouverte n'est pas dans un état
// remarquable, et lui coller une marque la ferait paraître en défaut.
test('une base jamais ouverte ne porte aucun badge d’état', () => {
  const noeuds = aplatir([projet()], new Set([idProjet('Atelier Nord')]), RIEN, JAMAIS)
  expect(noeuds.find((n) => n.kind === 'database')?.badge).toBeUndefined()
})

test('les quatre états produisent des annonces distinctes', () => {
  const etats: ConnectionState[] = [
    { kind: 'never' },
    { kind: 'connecting' },
    { kind: 'connected', serverVersion: 'PG', tunnelLocalPort: null },
    { kind: 'offline', reason: 'hôte injoignable' },
  ]
  const annonces = etats.map(
    (etat) =>
      aplatir([projet()], new Set([idProjet('Atelier Nord')]), RIEN, () => etat).find(
        (n) => n.kind === 'database',
      )?.announce,
  )
  expect(new Set(annonces).size).toBe(4)
})

// L'état est dans le **nom accessible**, pas seulement dans une couleur : un point vert et un
// point rouge sont indiscernables pour une part des utilisateurs.
test('l’état d’une base est dans son nom accessible', () => {
  const hors: ConnectionState = { kind: 'offline', reason: 'hôte injoignable' }
  const noeuds = aplatir([projet()], new Set([idProjet('Atelier Nord')]), RIEN, () => hors)
  expect(noeuds.find((n) => n.kind === 'database')?.announce).toContain('hôte injoignable')
})

// --- Les identités ---

// Dérivées du **chemin** : deux nœuds homonymes de branches différentes ne se confondent pas.
test('deux schémas homonymes de bases différentes ont deux identités', () => {
  expect(idSchema('P', 'a', 'public')).not.toBe(idSchema('P', 'b', 'public'))
})

test('les quatre profondeurs sont celles de la table d’indentation de TreeRow', () => {
  const idS = idSchema('Atelier Nord', 'analytics', 'public')
  const deplies = new Set([idProjet('Atelier Nord'), idBase('Atelier Nord', 'analytics'), idS])
  const charge: Charge = {
    ...RIEN,
    schemas: { [idBase('Atelier Nord', 'analytics')]: [schema('public')] },
    objets: { [idS]: [table('orders')] },
  }
  const noeuds = aplatir([projet()], deplies, charge, JAMAIS)
  const parKind = new Map(noeuds.map((n) => [n.kind, n.depth]))
  // Quatre niveaux exactement : `A4` n'en a pas cinq, et en ajouter un demanderait une valeur
  // que le handoff ne donne pas.
  expect(parKind.get('project')).toBe(0)
  expect(parKind.get('database')).toBe(1)
  expect(parKind.get('schema')).toBe(2)
  expect(parKind.get('object')).toBe(3)
})

// --- Les projets voisins ---

test('un projet replié annonce son nombre de bases', () => {
  const noeuds = aplatir([projet()], new Set(), RIEN, JAMAIS)
  expect(noeuds[0]?.meta).toBe('2 bases')
})

test('un projet à une seule base l’annonce au singulier', () => {
  const p = projet({
    databases: [
      {
        name: 'analytics',
        engine: 'postgresql',
        environment: 'dev',
        connection: REGLAGES,
        consoles: [],
      },
    ],
  })
  expect(aplatir([p], new Set(), RIEN, JAMAIS)[0]?.meta).toBe('1 base')
})

test('un projet déplié n’annonce plus son compte', () => {
  // Le compte sert à savoir ce qu'on ne voit pas ; déplié, on le voit.
  const noeuds = aplatir([projet()], new Set([idProjet('Atelier Nord')]), RIEN, JAMAIS)
  expect(noeuds[0]?.meta).toBeUndefined()
})

test('le badge d’environnement suit l’environnement actif du projet', () => {
  expect(aplatir([projet()], new Set(), RIEN, JAMAIS)[0]?.badge?.text).toBe('PROD')
  expect(
    aplatir([projet({ activeEnvironment: 'dev' })], new Set(), RIEN, JAMAIS)[0]?.badge?.text,
  ).toBe('DEV')
})
