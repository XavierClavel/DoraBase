import { useEffect, useState } from 'react'
import { describeTable } from '../../data/commandes'
import type { DatabaseKey, TableDetail } from '../../domain/engine'

export type PasserelleDetail = { describeTable: typeof describeTable }

export const PASSERELLE_DETAIL: PasserelleDetail = { describeTable }

export type EtatDetail = {
  detail: TableDetail | null
  loading: boolean
  error: string | null
}

/**
 * Le détail d'une table — colonnes, index, relations, DDL.
 *
 * `describe_table` existe depuis `06c` et n'était appelée par personne : `09f` a livré le
 * panneau de détail, la galerie le nourrit de données figées, et aucun écran ne lui en donnait
 * de vraies. C'est le même motif que `load_config` avant `09b`.
 *
 * **Rien n'est demandé sans cible.** Sans table désignée, l'état est vide et aucune commande ne
 * part : sélectionner d'office la première ligne déclencherait une requête que l'utilisateur n'a
 * pas demandée — l'argument que `09f` avait déjà retenu pour son état vide.
 */
export function useDetailTable(
  key: DatabaseKey | null,
  schema: string | null,
  table: string | null,
  passerelle: PasserelleDetail = PASSERELLE_DETAIL,
): EtatDetail {
  const [etat, setEtat] = useState<EtatDetail>({ detail: null, loading: false, error: null })

  // Les trois chaînes de la clé plutôt que l'objet : une `DatabaseKey` reconstruite à chaque
  // rendu relancerait la lecture indéfiniment.
  const project = key?.project ?? null
  const database = key?.database ?? null
  const environment = key?.environment ?? null

  useEffect(() => {
    if (!project || !database || !environment || !schema || !table) {
      setEtat({ detail: null, loading: false, error: null })
      return
    }
    let vivant = true
    setEtat({ detail: null, loading: true, error: null })
    passerelle
      .describeTable({ project, database, environment }, schema, table)
      .then((detail) => {
        if (vivant) setEtat({ detail, loading: false, error: null })
      })
      .catch((cause) => {
        if (vivant) setEtat({ detail: null, loading: false, error: message(cause) })
      })
    return () => {
      vivant = false
    }
  }, [project, database, environment, schema, table, passerelle])

  return etat
}

function message(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return String(cause)
}
