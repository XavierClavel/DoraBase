import { useEffect, useState } from 'react'
import { readRows } from '../../data/commandes'
import type { DatabaseKey, RowLimit, RowQuery, RowWindow } from '../../domain/engine'

export type PasserelleLignes = { readRows: typeof readRows }

export const PASSERELLE_LIGNES: PasserelleLignes = { readRows }

/** Le palier de départ du stepper de `A5`. `10e` le rendra réglable. */
export const LIMITE_PAR_DEFAUT: RowLimit = 'fiveHundred'

export type EtatLignes = {
  fenetre: RowWindow | null
  loading: boolean
  error: string | null
}

// Pas de `relire()` ici : le bouton « Rafraîchir » appartient à la toolbar, donc à `10e`. Une
// API livrée en avance de son appelant est du code que rien n'exerce.

/**
 * La fenêtre de lignes d'une table.
 *
 * **Jamais un jeu complet.** `RowWindow` porte au plus `RowLimit` lignes, et `RowLimit` est une
 * énumération fermée depuis `06a` : « tout » n'est pas exprimable. C'est ici que la contrainte
 * IPC transverse est exercée pour la première fois par un écran.
 *
 * L'`offset` reste à 0 : `A5` montre au plus une fenêtre, et sa barre d'état le dit. La
 * pagination au-delà n'est pas dans `10c`, et le mockup ne la montre pas.
 */
export function useLignes(
  key: DatabaseKey | null,
  schema: string | null,
  table: string | null,
  limite: RowLimit = LIMITE_PAR_DEFAUT,
  passerelle: PasserelleLignes = PASSERELLE_LIGNES,
): EtatLignes {
  const [fenetre, setFenetre] = useState<RowWindow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Les trois chaînes plutôt que l'objet : une `DatabaseKey` reconstruite à chaque rendu
  // relancerait la lecture indéfiniment — le même piège qu'en `useDetailTable`.
  const project = key?.project ?? null
  const database = key?.database ?? null
  const environment = key?.environment ?? null

  useEffect(() => {
    if (!project || !database || !environment || !schema || !table) {
      setFenetre(null)
      setLoading(false)
      setError(null)
      return
    }
    let vivant = true
    const requete: RowQuery = {
      schema,
      table,
      filters: [],
      sort: [],
      offset: 0,
      limit: limite,
    }
    setLoading(true)
    setError(null)
    passerelle
      .readRows({ project, database, environment }, requete)
      .then((resultat) => {
        if (vivant) {
          setFenetre(resultat)
          setLoading(false)
        }
      })
      .catch((cause) => {
        if (vivant) {
          setFenetre(null)
          setLoading(false)
          setError(message(cause))
        }
      })
    return () => {
      vivant = false
    }
  }, [project, database, environment, schema, table, limite, passerelle])

  return { fenetre, loading, error }
}

function message(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause && typeof cause === 'object' && 'message' in cause) {
    return String((cause as { message: unknown }).message)
  }
  return String(cause)
}
