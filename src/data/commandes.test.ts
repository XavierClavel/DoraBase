import type { ConfigLoad } from '../domain/config'
import { databaseKey, etatDe, interpreter } from './commandes'

// --- Les quatre issues de `load_config` ---

test('un fichier absent donne un état neuf sans projet', () => {
  expect(interpreter({ kind: 'fresh' })).toEqual({ kind: 'fresh', projects: [] })
})

test('un fichier lu rend ses projets', () => {
  const projets = [{ name: 'Print', activeEnvironment: 'dev' as const, databases: [] }]
  expect(interpreter({ kind: 'loaded', projects: projets })).toEqual({
    kind: 'loaded',
    projects: projets,
  })
})

// **Le piège que `05b` a posé et que `09b` doit respecter.** Un fichier illisible n'a pas zéro
// projet : il a des projets qu'on ne sait pas lire, et l'écriture est bloquée. Le présenter
// comme « aucun projet » inviterait à en créer un, ce qui écraserait le fichier qu'on vient de
// refuser d'ouvrir.
test('un fichier illisible est bloqué, pas vide', () => {
  const issue: ConfigLoad = {
    kind: 'unreadable',
    reason: 'JSON invalide ligne 3',
    quarantinedTo: '/tmp/config.json.corrompu',
  }
  const etat = interpreter(issue)
  expect(etat.kind).toBe('blocked')
  expect(etat.kind === 'blocked' && etat.reason).toContain('JSON invalide')
  // Le chemin de quarantaine est montré : c'est ce qui rend le fichier récupérable.
  expect(etat.kind === 'blocked' && etat.quarantinedTo).toBe('/tmp/config.json.corrompu')
})

test('un fichier trop récent est bloqué, avec les deux versions', () => {
  const etat = interpreter({ kind: 'tooNew', found: 9, supported: 1 })
  expect(etat.kind).toBe('blocked')
  expect(etat.kind === 'blocked' && etat.reason).toContain('version 9')
  expect(etat.kind === 'blocked' && etat.reason).toContain('version 1')
})

test('les deux issues bloquantes ne rendent aucun projet', () => {
  // Rendre des projets partiels laisserait croire que la lecture a marché à moitié.
  for (const issue of [
    { kind: 'unreadable', reason: 'x', quarantinedTo: 'y' },
    { kind: 'tooNew', found: 9, supported: 1 },
  ] as ConfigLoad[]) {
    expect(interpreter(issue).projects).toEqual([])
  }
})

// --- Les clés ---

test('la clé envoyée à Rust reste en trois chaînes', () => {
  // Composer côté front dupliquerait la convention. Le front envoie les trois morceaux ;
  // `registry::cle` les assemble.
  expect(databaseKey('Print', 'analytics', 'dev')).toEqual({
    project: 'Print',
    database: 'analytics',
    environment: 'dev',
  })
})

// --- Les états ---

// Une base absente de la table est `never`, pas `offline` : afficher en rouge une base qu'on n'a
// pas ouverte serait faux. C'est la décision du 7 août sur l'arbre lisible sans réseau.
test('une base inconnue est « jamais tentée », pas « hors ligne »', () => {
  expect(etatDe([], 'Print', 'analytics', 'dev')).toEqual({ kind: 'never' })
})

test('un état connu est rendu tel quel', () => {
  const etat = {
    kind: 'connected' as const,
    serverVersion: 'PostgreSQL 17.6',
    tunnelLocalPort: null,
  }
  const entrees = [
    { key: { project: 'Print', database: 'analytics', environment: 'dev' }, state: etat },
  ]
  expect(etatDe(entrees, 'Print', 'analytics', 'dev')).toEqual(etat)
})

// Deux environnements de la même base sont deux connexions distinctes — c'est ce que le triplet
// exprime, et ce qu'une clé indexée par le seul nom de base aurait confondu.
test('deux environnements de la même base ont deux états distincts', () => {
  const entrees = [
    {
      key: { project: 'Print', database: 'analytics', environment: 'dev' },
      state: { kind: 'connected' as const, serverVersion: 'PG', tunnelLocalPort: null },
    },
    {
      key: { project: 'Print', database: 'analytics', environment: 'prod' },
      state: { kind: 'offline' as const, reason: 'hôte injoignable' },
    },
  ]
  expect(etatDe(entrees, 'Print', 'analytics', 'dev').kind).toBe('connected')
  expect(etatDe(entrees, 'Print', 'analytics', 'prod').kind).toBe('offline')
})
