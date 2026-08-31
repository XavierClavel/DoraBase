import { act, render, waitFor } from '@testing-library/react'
import type { Database, Project } from '../../domain/config'
import type { ConnectionStateEntry, SchemaInfo } from '../../domain/engine'
import type { Noeud } from '../Explorer/arbre'
import { idBase, idSchema } from '../Explorer/arbre'
import { type PasserelleArbre, useArbre } from './useArbre'

/**
 * Le défaut que ce fichier garde, et pourquoi il valait un fichier à lui (31 août 2026).
 *
 * Six commandes de configuration **ferment** des connexions côté Rust — `update_variant` en tête, qui
 * le documente explicitement. L'arbre ne relisait les états du registre qu'au `finally` de
 * `chargerBase` : après une modification, il affichait donc « OK » sur une base fermée, et toute
 * requête répondait « aucune connexion ouverte ». Et le cache rendait le mensonge **irréparable** :
 * `charger` n'appelle `chargerBase` que si les schémas ne sont pas en cache, donc replier puis
 * déplier ne rouvrait rien et l'arbre montrait les schémas de la base précédente — mot pour mot ce
 * que le commentaire d'`update_variant` disait vouloir éviter.
 *
 * Rapporté à l'usage, contre un vrai cluster : « it shows OK on UI, but i cannot run queries ».
 */

const PROJET = 'Comptoir Sud'
const BASE = 'Prod'
const ENV = 'prod'

const ID_BASE = idBase(PROJET, ENV, BASE)

const noeudDeBase: Noeud = {
  id: ID_BASE,
  kind: 'database',
  depth: 2,
  label: BASE,
  chevron: 'closed',
  project: PROJET,
  database: BASE,
  environment: ENV,
}

const schema = (name: string): SchemaInfo => ({
  name,
  counts: { tables: 1, views: 0, functions: 0, indexes: 0 },
})

function connexion(defaultDatabase: string): Database {
  return {
    name: BASE,
    engine: 'postgresql',
    environment: ENV,
    consoles: [],
    connection: {
      host: '',
      port: 5432,
      defaultDatabase,
      username: 'lecture',
      password: null,
      sslMode: 'prefer',
      caCertificate: null,
      authDatabase: null,
      readOnly: true,
      reconnectOnStartup: false,
      tunnel: null,
    },
  }
}

function projets(defaultDatabase: string): readonly Project[] {
  return [
    {
      name: PROJET,
      environments: [{ id: ENV, label: 'prod', color: 'red', production: true }],
      databases: [connexion(defaultDatabase)],
      queries: [],
    },
  ]
}

const OUVERTE: readonly ConnectionStateEntry[] = [
  {
    key: { project: PROJET, database: BASE, environment: ENV },
    state: { kind: 'connected', serverVersion: 'PostgreSQL 17.6', tunnelLocalPort: null },
  },
]

/** Une passerelle qui compte ses ouvertures et dont les états sont pilotables. */
function passerelleDe(etats: { courant: readonly ConnectionStateEntry[] }) {
  const compte = { ouvertures: 0 }
  const passerelle: PasserelleArbre = {
    openDatabase: async () => {
      compte.ouvertures += 1
      return { kind: 'connected', serverVersion: 'PostgreSQL 17.6', tunnelLocalPort: null }
    },
    closeDatabase: async () => {},
    connectionStates: async () => [...etats.courant],
    listSchemas: async () => [schema('public')],
    listObjects: async () => [],
  }
  return { passerelle, compte }
}

/** Le hook monté dans un composant jetable, comme `useStructures.test.tsx`. */
function monter(passerelle: PasserelleArbre, initiaux: readonly Project[]) {
  const vu: { courant: ReturnType<typeof useArbre> | null } = { courant: null }
  function Sonde({ projects }: { projects: readonly Project[] }) {
    vu.courant = useArbre(projects, passerelle)
    return null
  }
  const rendu = render(<Sonde projects={initiaux} />)
  return {
    vu: vu as { courant: ReturnType<typeof useArbre> },
    reprojeter: (suivants: readonly Project[]) => rendu.rerender(<Sonde projects={suivants} />),
  }
}

test('une base fermée par une modification cesse d’être annoncée ouverte', async () => {
  const etats = { courant: OUVERTE }
  const { passerelle } = passerelleDe(etats)
  const { vu, reprojeter } = monter(passerelle, projets('cooknco'))

  await act(async () => {
    vu.courant.basculer(noeudDeBase)
  })
  expect(vu.courant.etatDeBase(PROJET, BASE, ENV)).toMatchObject({ kind: 'connected' })

  // La modification : le registre se vide côté Rust, et `App` repose les projets rendus par la
  // commande. C'est ce changement, et lui seul, qui doit relancer la lecture des états.
  etats.courant = []
  await act(async () => {
    reprojeter(projets('postgres'))
  })

  await waitFor(() =>
    // **Le cœur du défaut** : l'arbre annonçait « connected » sur une base que le registre avait
    // fermée, donc « OK » à l'écran et « aucune connexion ouverte » à la première requête.
    expect(vu.courant.etatDeBase(PROJET, BASE, ENV)).toEqual({ kind: 'never' }),
  )
})

test('une base fermée est rouvrable : son cache de schémas est oublié', async () => {
  const etats = { courant: OUVERTE }
  const { passerelle, compte } = passerelleDe(etats)
  const { vu, reprojeter } = monter(passerelle, projets('cooknco'))

  await act(async () => {
    vu.courant.basculer(noeudDeBase)
  })
  expect(compte.ouvertures).toBe(1)
  expect(vu.courant.charge.schemas[ID_BASE]).toHaveLength(1)

  etats.courant = []
  await act(async () => {
    reprojeter(projets('postgres'))
  })
  // **La moitié qui rendait le défaut irréparable.** `charger` n'appelle `chargerBase` que si les
  // schémas ne sont pas en cache : sans cette purge, replier puis déplier ne rouvrait rien, et
  // l'arbre continuait d'afficher les schémas de la base précédente.
  await waitFor(() => expect(vu.courant.charge.schemas[ID_BASE]).toBeUndefined())
  // Et le nœud est **replié** : resté déplié avec des schémas oubliés, il montrerait un vide que
  // rien ne viendrait remplir, `charger` n'étant appelé que par `basculer`.
  expect(vu.courant.deplies.has(ID_BASE)).toBe(false)

  // Le geste rend enfin ce qu'il promet : une seconde ouverture, sur les nouveaux réglages.
  await act(async () => {
    vu.courant.basculer(noeudDeBase)
  })
  expect(compte.ouvertures).toBe(2)
})

test('les objets d’un schéma de la base fermée sont oubliés aussi', async () => {
  const etats = { courant: OUVERTE }
  const { passerelle } = passerelleDe(etats)
  const { vu, reprojeter } = monter(passerelle, projets('cooknco'))

  await act(async () => {
    vu.courant.basculer(noeudDeBase)
  })
  const noeudSchema: Noeud = {
    id: idSchema(PROJET, ENV, BASE, 'public'),
    kind: 'schema',
    depth: 3,
    label: 'public',
    chevron: 'closed',
    project: PROJET,
    database: BASE,
    environment: ENV,
    schema: 'public',
  }
  await act(async () => {
    vu.courant.basculer(noeudSchema)
  })
  expect(vu.courant.charge.objets[noeudSchema.id]).toBeDefined()

  etats.courant = []
  await act(async () => {
    reprojeter(projets('postgres'))
  })
  // Purger les schémas sans purger leurs objets laisserait un cache d'objets de l'ancienne base
  // ressortir au prochain dépliage du même nom de schéma.
  await waitFor(() => expect(vu.courant.charge.objets[noeudSchema.id]).toBeUndefined())
})

test('un changement de projets qui ne ferme rien ne jette aucun cache', async () => {
  // **Le contrôle négatif, et il porte la règle.** Cinq des six commandes ferment, mais d'autres
  // écritures rendent aussi `Vec<Project>` sans rien fermer — enregistrer le SQL d'une console, par
  // exemple. Sans ce test, une purge trop large passerait : l'arbre se viderait à chaque frappe
  // enregistrée, et le défaut serait pire que celui qu'on corrige.
  const etats = { courant: OUVERTE }
  const { passerelle, compte } = passerelleDe(etats)
  const { vu, reprojeter } = monter(passerelle, projets('cooknco'))

  await act(async () => {
    vu.courant.basculer(noeudDeBase)
  })
  expect(vu.courant.charge.schemas[ID_BASE]).toHaveLength(1)

  // Les projets changent, mais le registre tient toujours la connexion.
  await act(async () => {
    reprojeter(projets('cooknco'))
  })

  await waitFor(() =>
    expect(vu.courant.etatDeBase(PROJET, BASE, ENV)).toMatchObject({
      kind: 'connected',
    }),
  )
  expect(vu.courant.charge.schemas[ID_BASE]).toHaveLength(1)
  expect(vu.courant.deplies.has(ID_BASE)).toBe(true)
  // Et rien n'a été réouvert : le cache a servi, ce qui est son rôle.
  expect(compte.ouvertures).toBe(1)
})
