import { expect, test } from 'vitest'
import type { Database, Project } from '../../domain/config'
import { REGLAGES, TRIO_DE_TEST } from '../NewConnection/pourLesTests'
import { cibleUnique } from './cibleUnique'

function base(name: string, environment: string, overrides: Partial<Database> = {}): Database {
  return {
    name,
    engine: 'postgresql',
    environment,
    connection: REGLAGES,
    consoles: [],
    ...overrides,
  }
}

function projet(name: string, databases: Database[]): Project {
  return { name, environments: TRIO_DE_TEST, databases, queries: [] }
}

test('une seule connexion : la cible est résolue, avec son propre environnement', () => {
  // L'environnement de la clé est celui **de la connexion** (`23b`), pas un choix d'écran :
  // `activeEnvironment` a quitté le modèle en `25c`.
  const cible = cibleUnique([projet('Atelier Nord', [base('commandes', 'staging')])])

  expect(cible?.request.key).toEqual({
    project: 'Atelier Nord',
    database: 'commandes',
    environment: 'staging',
  })
  expect(cible?.request.engine).toBe('postgresql')
})

test('deux connexions : aucune cible, la modale doit le dire', () => {
  // Se tromper de base à l'import écrirait dans la mauvaise : choisir à la place de
  // l'utilisateur est précisément ce qu'il ne faut pas faire ici.
  const cible = cibleUnique([
    projet('Atelier Nord', [base('commandes', 'dev'), base('clients', 'dev')]),
  ])
  expect(cible).toBeNull()
})

test('deux connexions homonymes dans deux environnements : aucune cible non plus', () => {
  // C'est le modèle même depuis `23b`, et c'est le cas le plus dangereux : « commandes »
  // existe en dev et en prod, et rien à ce niveau ne dit laquelle viser.
  const cible = cibleUnique([
    projet('Atelier Nord', [base('commandes', 'dev'), base('commandes', 'prod')]),
  ])
  expect(cible).toBeNull()
})

test('deux projets : aucune cible', () => {
  const cible = cibleUnique([
    projet('Atelier Nord', [base('commandes', 'dev')]),
    projet('Atelier Sud', [base('stock', 'dev')]),
  ])
  expect(cible).toBeNull()
})

test('aucun projet : aucune cible', () => {
  expect(cibleUnique([])).toBeNull()
})

test('un projet sans connexion : aucune cible', () => {
  expect(cibleUnique([projet('Atelier Nord', [])])).toBeNull()
})

test('les réglages rendus sont ceux de la connexion, pas un décor par défaut', () => {
  // Contrôle positif : sans lui, `cibleUnique` pourrait rendre n'importe quels réglages et
  // les tests précédents resteraient verts — ils ne regardent que la clé.
  const cible = cibleUnique([
    projet('Atelier Nord', [
      base('commandes', 'prod', { connection: { ...REGLAGES, host: 'db.prod' } }),
    ]),
  ])

  expect(cible?.connection.host).toBe('db.prod')
  expect(cible?.request.variant.host).toBe('db.prod')
})
