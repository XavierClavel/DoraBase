import { useCallback, useState } from 'react'
import { explainSql, runSql } from '../../data/commandes'
import type { DatabaseKey, QueryPlan, QueryResult, RowLimit } from '../../domain/engine'
import type { VueResultat } from './ConsoleResult'
import { demandeConfirmation, natureDe, sansRestriction } from './nature'

/** Ce qui appelle la commande. Injectable : le pont ne répond pas hors de la webview. */
export type PasserelleExecution = {
  runSql: (key: DatabaseKey, sql: string, limit: RowLimit) => Promise<QueryResult>
  explainSql: (key: DatabaseKey, sql: string) => Promise<QueryPlan>
}

export const PASSERELLE_EXECUTION: PasserelleExecution = { runSql, explainSql }

/** La limite par défaut de la console, celle du mockup. */
export const LIMITE_CONSOLE: RowLimit = 'oneThousand'

export type Execution = {
  /** Demande l'exécution — passe par la confirmation si la requête écrit. */
  demander: (sql: string) => void
  /** Exécute pour de bon. Appelé par la confirmation, ou directement pour une lecture. */
  executer: () => void
  annulerLaConfirmation: () => void
  /** La requête en attente de confirmation, s'il y en a une. */
  aConfirmer: { sql: string; nature: ReturnType<typeof natureDe>; sansWhere: boolean } | null
  enCours: boolean
  resultat: QueryResult | null
  erreur: string | null
  /** Demande le plan de la requête (`12e`) — sans l'exécuter. */
  expliquer: (sql: string) => void
  plan: QueryPlan | null
  planEnCours: boolean
  vue: VueResultat
  setVue: (vue: VueResultat) => void
}

/**
 * L'exécution d'une requête de console (`12c`).
 *
 * **La confirmation dépend de ce que la requête fait, pas de l'environnement.** `11d` confirme sur la
 * production parce qu'il écrit toujours la même chose ; ici, c'est l'inverse — un `drop` sur une base
 * de développement mérite d'être confirmé, et un `select` en production non.
 */
export function useExecution(cle: DatabaseKey | null, passerelle: PasserelleExecution): Execution {
  const [aConfirmer, setAConfirmer] = useState<Execution['aConfirmer']>(null)
  const [enCours, setEnCours] = useState(false)
  const [resultat, setResultat] = useState<QueryResult | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [plan, setPlan] = useState<QueryPlan | null>(null)
  const [planEnCours, setPlanEnCours] = useState(false)
  const [vue, setVue] = useState<VueResultat>('resultat')

  const lancer = useCallback(
    (sql: string) => {
      if (cle === null || sql.trim() === '') return
      setEnCours(true)
      setErreur(null)
      passerelle
        .runSql(cle, sql, LIMITE_CONSOLE)
        .then((issue) => {
          setEnCours(false)
          setAConfirmer(null)
          setResultat(issue)
        })
        .catch((raison: unknown) => {
          setEnCours(false)
          setAConfirmer(null)
          // Le résultat précédent n'est **pas** effacé ici : `ConsoleResult` donne la priorité à
          // l'erreur, donc la grille disparaît de toute façon. Un `setResultat(null)` avait été
          // ajouté par prudence ; le retirer ne changeait aucune mesure, et la garantie — ne pas
          // laisser un ancien résultat à côté d'une erreur, qu'on lirait comme le sien — est portée
          // par l'ordre d'affichage.
          setErreur(messageDe(raison))
        })
    },
    [cle, passerelle],
  )

  const demander = useCallback(
    (sql: string) => {
      const nature = natureDe(sql)
      if (demandeConfirmation(nature)) {
        setAConfirmer({ sql, nature, sansWhere: sansRestriction(sql) })
        return
      }
      lancer(sql)
    },
    [lancer],
  )

  /**
   * Demande le plan, et bascule sur sa vue.
   *
   * **Basculer fait partie de l'action** : « Expliquer » sans changer de vue laisserait croire que
   * rien ne s'est passé, et il faudrait deviner qu'un onglet s'est rempli.
   */
  const expliquer = useCallback(
    (sql: string) => {
      if (cle === null || sql.trim() === '') return
      setPlanEnCours(true)
      setErreur(null)
      setVue('plan')
      passerelle
        .explainSql(cle, sql)
        .then((issue) => {
          setPlanEnCours(false)
          setPlan(issue)
        })
        .catch((raison: unknown) => {
          setPlanEnCours(false)
          setPlan(null)
          // Le refus va au même endroit que celui d'une exécution : une requête invalide échoue à
          // l'explication comme à l'exécution, et deux affichages différents pour la même faute
          // obligeraient à chercher deux fois.
          setVue('resultat')
          setErreur(messageDe(raison))
        })
    },
    [cle, passerelle],
  )

  return {
    demander,
    expliquer,
    plan,
    planEnCours,
    vue,
    setVue,
    executer: () => {
      if (aConfirmer) lancer(aConfirmer.sql)
    },
    annulerLaConfirmation: () => setAConfirmer(null),
    aConfirmer,
    enCours,
    resultat,
    erreur,
  }
}

function messageDe(erreur: unknown): string {
  if (typeof erreur === 'string') return erreur
  if (erreur instanceof Error) return erreur.message
  if (erreur !== null && typeof erreur === 'object' && 'message' in erreur) {
    return String((erreur as { message: unknown }).message)
  }
  return 'la requête a échoué'
}
