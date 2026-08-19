import { useCallback, useMemo, useState } from 'react'
import {
  closeDatabase,
  connectionStates,
  databaseKey,
  etatDe,
  listObjects,
  listSchemas,
  openDatabase,
} from '../../data/commandes'
import type { EnvironmentId, Project } from '../../domain/config'
import type { ConnectionState, ConnectionStateEntry } from '../../domain/engine'
import type { Charge, Noeud } from '../Explorer/arbre'
import { idBase } from '../Explorer/arbre'

/**
 * Les commandes dont l'arbre a besoin, **injectables**.
 *
 * Même arbitrage qu'en `08d` et `09b` : le pont ne répond pas hors de la webview, donc ce qui
 * est testable est le câblage. Un test qui passerait par `invoke` ne testerait que son échec.
 */
export type PasserelleArbre = {
  openDatabase: typeof openDatabase
  closeDatabase: typeof closeDatabase
  connectionStates: typeof connectionStates
  listSchemas: typeof listSchemas
  listObjects: typeof listObjects
}

export const PASSERELLE_TAURI: PasserelleArbre = {
  openDatabase,
  closeDatabase,
  connectionStates,
  listSchemas,
  listObjects,
}

const CHARGE_VIDE: Charge = { schemas: {}, objets: {}, enCours: new Set(), echecs: {} }

/**
 * L'état de l'arbre : ce qui est déplié, ce qui est chargé, l'état de chaque base.
 *
 * **Le dépliage est paresseux et le chargement suit le dépliage.** Un schéma replié ne produit
 * aucun nœud, donc rien n'est demandé — c'est la contrainte transverse de `06c` appliquée à
 * l'arbre, et c'est pour cela que la commande rend les objets d'**un** schéma.
 *
 * **L'arbre se lit sans réseau** (décision du 7 août) : ouvrir la connexion n'a lieu qu'au
 * dépliage d'une base, jamais au chargement de l'écran. Un hôte muet bloquerait sinon l'écran
 * jusqu'à trente secondes.
 */
export function useArbre(
  projects: readonly Project[],
  passerelle: PasserelleArbre = PASSERELLE_TAURI,
) {
  const [deplies, setDeplies] = useState<ReadonlySet<string>>(new Set())
  const [charge, setCharge] = useState<Charge>(CHARGE_VIDE)
  const [etats, setEtats] = useState<readonly ConnectionStateEntry[]>([])

  const etatDeBase = useCallback(
    (project: string, database: string, environment: EnvironmentId): ConnectionState =>
      etatDe(etats, project, database, environment),
    [etats],
  )

  const marquer = useCallback((id: string, enCours: boolean, echec?: string) => {
    setCharge((precedent) => {
      const suivant = new Set(precedent.enCours)
      if (enCours) suivant.add(id)
      else suivant.delete(id)
      const echecs = { ...precedent.echecs }
      if (echec) echecs[id] = echec
      else delete echecs[id]
      return { ...precedent, enCours: suivant, echecs }
    })
  }, [])

  const chargerBase = useCallback(
    async (noeud: Noeud) => {
      const { project, database, environment } = noeud
      if (!project || !database || !environment) return
      const id = idBase(project, database)
      const cle = databaseKey(project, database, environment)
      // **La connexion est identifiée par son nom *et* son environnement** (`23b`) : deux connexions
      // homonymes coexistent, et n'en chercher qu'une par le nom ouvrirait la première venue — celle
      // de dev alors qu'on a cliqué celle de prod.
      const declaration = baseDeclaree(projects, project, database, environment)
      const variante = declaration?.connection
      if (!declaration || !variante) return

      marquer(id, true)
      try {
        // **Le moteur déclaré décide de l'adaptateur** (`18a`) : la variante ne le porte pas, la
        // `Database` si. Le déduire côté Rust demanderait de relire la configuration à chaque
        // ouverture.
        await passerelle.openDatabase(cle, declaration.engine, variante)
        const schemas = await passerelle.listSchemas(cle)
        setCharge((precedent) => ({
          ...precedent,
          schemas: { ...precedent.schemas, [id]: schemas },
        }))
        marquer(id, false)
      } catch (cause) {
        // L'échec vit **sur la ligne du nœud** : une base injoignable ne doit pas vider l'arbre
        // ni bloquer les autres. C'est la décision « l'arbre se lit sans réseau », appliquée à
        // son chargement.
        marquer(id, false, message(cause))
      } finally {
        setEtats(await passerelle.connectionStates().catch(() => []))
      }
    },
    [projects, passerelle, marquer],
  )

  const chargerSchema = useCallback(
    async (noeud: Noeud) => {
      const { project, database, environment, schema } = noeud
      if (!project || !database || !environment || !schema) return
      const id = noeud.id
      const cle = databaseKey(project, database, environment)

      marquer(id, true)
      try {
        const objets = await passerelle.listObjects(cle, schema)
        setCharge((precedent) => ({ ...precedent, objets: { ...precedent.objets, [id]: objets } }))
        marquer(id, false)
      } catch (cause) {
        marquer(id, false, message(cause))
      }
    },
    [passerelle, marquer],
  )

  /** Déplie ou replie un nœud, et charge ce que le dépliage rend visible. */
  const basculer = useCallback(
    (noeud: Noeud) => {
      const ouvrait = !deplies.has(noeud.id)
      setDeplies((precedent) => {
        const suivant = new Set(precedent)
        if (suivant.has(noeud.id)) suivant.delete(noeud.id)
        else suivant.add(noeud.id)
        return suivant
      })
      if (!ouvrait) return
      // Rien n'est rechargé au second dépliage : ce qui est déjà là est déjà à jour, et le
      // bouton « Rafraîchir » du pied existe pour le cas contraire.
      if (noeud.kind === 'database' && !charge.schemas[noeud.id]) void chargerBase(noeud)
      if (noeud.kind === 'schema' && !charge.objets[noeud.id]) void chargerSchema(noeud)
    },
    [deplies, charge, chargerBase, chargerSchema],
  )

  /** Oublie tout ce qui est chargé, sans replier : le prochain regard rechargera. */
  const rafraichir = useCallback(() => {
    setCharge(CHARGE_VIDE)
    setDeplies(new Set())
  }, [])

  return useMemo(
    () => ({ deplies, charge, etatDeBase, basculer, rafraichir }),
    [deplies, charge, etatDeBase, basculer, rafraichir],
  )
}

/** La variante d'environnement d'une base, celle que `open_database` réclame. */
/**
 * La base **déclarée**, et non sa seule variante d'environnement.
 *
 * Depuis `18`, l'ouverture a besoin du moteur, qui vit au niveau de la `Database` : rendre la
 * variante seule obligeait à refaire la même recherche une seconde fois pour l'obtenir.
 */
/**
 * La connexion déclarée, par projet, nom **et** environnement (`23b`).
 *
 * Le dernier paramètre n'est pas une commodité : `analytics` peut exister en dev et en prod, et deux
 * connexions homonymes ont des hôtes différents. Chercher par le seul nom ouvrirait l'une pour
 * l'autre — sans erreur, sur le mauvais serveur.
 */
function baseDeclaree(
  projects: readonly Project[],
  project: string,
  database: string,
  environment: string,
) {
  return projects
    .find((p) => p.name === project)
    ?.databases.find((d) => d.name === database && d.environment === environment)
}

function message(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return String(cause)
}
