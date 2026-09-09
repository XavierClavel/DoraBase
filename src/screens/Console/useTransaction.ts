import { useCallback, useEffect, useState } from 'react'
import {
  commitTransaction,
  rollbackTransaction,
  transactionResult,
  transactionState,
} from '../../data/commandes'
import type {
  DatabaseKey,
  QueryResult,
  TransactionMode,
  TransactionState,
  TransactionStatement,
} from '../../domain/engine'
import { demandeConfirmation, natureDe, sansRestriction } from './nature'

/** Ce qui appelle les commandes. Injectable : le pont ne répond pas hors de la webview. */
export type PasserelleTransaction = {
  transactionState: (key: DatabaseKey) => Promise<TransactionState>
  transactionResult: (key: DatabaseKey, index: number) => Promise<QueryResult>
  commitTransaction: (key: DatabaseKey) => Promise<void>
  rollbackTransaction: (key: DatabaseKey) => Promise<void>
}

export const PASSERELLE_TRANSACTION: PasserelleTransaction = {
  transactionState,
  transactionResult,
  commitTransaction,
  rollbackTransaction,
}

/** Une transaction au repos : aucune n'est ouverte, et ce n'est pas une transaction vide. */
const AUCUNE_TRANSACTION: TransactionState = { open: false, statements: [], aborted: false }

/**
 * L'index d'une connexion dans les tables de ce module.
 *
 * **Ce n'est pas la clé du registre**, que le Rust compose lui-même (`registry::cle`) et que le
 * front n'a jamais à écrire : c'est un index d'état React, du même genre que celui d'`idOnglet`.
 * Les commandes reçoivent toujours le `DatabaseKey` en trois champs.
 */
function index(cle: DatabaseKey): string {
  return `${cle.project}/${cle.database}/${cle.environment}`
}

/**
 * Ce qu'une validation met en jeu, tel que la confirmation le récapitule (`API-38`).
 *
 * **Dérivé du journal, jamais compté à part** : les instructions sont classées par `natureDe`, le
 * même classificateur que la confirmation d'une requête isolée. Deux règles pour « est-ce que ceci
 * écrit ? » finiraient par diverger, et c'est la question dont dépend l'affichage de cette modale.
 */
export type ValidationADemander = {
  cle: DatabaseKey
  /** Le nombre d'instructions de la transaction, écritures comprises. */
  instructions: number
  /** Les verbes des écritures, dans l'ordre — « DELETE », « UPDATE »… */
  ecritures: readonly string[]
  /**
   * Vrai quand l'une des écritures ne porte pas de `where`.
   *
   * Le fait le plus coûteux de tout ce qui attend, et celui que la confirmation d'une requête isolée
   * met en premier : le taire au milieu d'un récapitulatif serait le noyer.
   */
  sansRestriction: boolean
}

export type Transactions = {
  /** Le mode de cette connexion — `auto` tant que personne n'a rien réglé. */
  mode: (cle: DatabaseKey | null) => TransactionMode
  poserLeMode: (cle: DatabaseKey, mode: TransactionMode) => void
  /** Ce que la transaction de cette connexion contient, tel que le Rust l'a dit. */
  etat: (cle: DatabaseKey | null) => TransactionState
  /** Le refus d'une validation, d'une annulation ou d'une lecture de réponse, s'il y en a un. */
  erreur: (cle: DatabaseKey | null) => string | null
  /**
   * Le rang de l'instruction dont la réponse est dans la grille, ou `null`.
   *
   * **`null` après chaque exécution**, et le panneau ne marque alors rien : la grille montre la
   * réponse de la dernière exécution *de cette console*, et rien ne dit quelle entrée du journal
   * l'a produite — deux consoles y écrivent. Marquer la dernière entrée serait juste presque
   * toujours, et faux dès qu'une voisine a exécuté après nous.
   */
  affichee: (cle: DatabaseKey | null) => number | null
  /**
   * Demande la réponse d'une instruction, et retient laquelle est affichée.
   *
   * Rend `null` quand le cœur a refusé — l'appelant laisse alors sa grille telle quelle, et le
   * refus paraît dans le panneau.
   */
  afficher: (cle: DatabaseKey, index: number) => Promise<QueryResult | null>
  /** Relit le journal. Appelé après chaque exécution, et par l'effet de cette fonction. */
  apresExecution: (cle: DatabaseKey) => void
  /**
   * Demande la validation — passe par la confirmation quand la transaction contient des écritures.
   *
   * **C'est ici que la confirmation a lieu, et non à l'exécution** (`API-38`) : en transaction
   * manuelle, le moment où l'on s'engage est la validation. Une transaction qui n'a fait que lire
   * n'a rien à confirmer, comme un `select` n'en demande pas.
   */
  demanderLaValidation: (cle: DatabaseKey) => void
  /** Ce qu'une validation met en jeu, quand elle attend une confirmation. */
  aValider: ValidationADemander | null
  annulerLaValidation: () => void
  /** Valide pour de bon. Appelé par la confirmation. */
  valider: (cle: DatabaseKey) => void
  annuler: (cle: DatabaseKey) => void
  /** Vrai pendant une validation ou une annulation : les deux boutons attendent. */
  enCours: boolean
}

/**
 * La transaction manuelle d'une console (`API-38`).
 *
 * # Le mode appartient à la connexion, pas à la console
 *
 * Le registre ne tient qu'un adaptateur par connexion, donc une seule session : un `begin` posé
 * depuis une console englobe ce que ses voisines exécutent. Un mode par console aurait donc laissé
 * une console réglée « auto » participer **en silence** à la transaction d'une autre, jusqu'à ce
 * qu'un `commit` qu'elle n'a pas demandé valide ce qu'elle a écrit. Les deux tables de ce module
 * sont donc indexées par connexion, et non par identité d'onglet comme le texte (`12a`), le
 * résultat (`12c`) et les modifications en attente (`11b`).
 *
 * # Le journal n'est pas tenu ici
 *
 * Il vit dans le registre, et cette fonction le **relit**. C'est ce qui rend le panneau vrai pour
 * deux consoles ouvertes sur la même base : chacune voit ce que l'autre a mis dans la transaction,
 * c'est-à-dire ce qu'un « Valider » emporte. Une liste tenue par l'écran aurait été juste sur son
 * onglet et fausse sur la transaction.
 *
 * # Rien ne part avant qu'on le demande
 *
 * En mode `auto` — le défaut — aucune commande n'est appelée : la galerie, `?demo` et toute la suite
 * Playwright n'y touchent pas, et le panneau ne paraît pas. C'est l'arbitrage de la recherche de
 * mise à jour, pour la même raison.
 *
 * @param revision le témoin de configuration, `projects` en pratique : **les six commandes qui
 * ferment une connexion le réécrivent**, et une transaction fermée avec sa connexion doit
 * disparaître du panneau plutôt que d'y offrir un « Valider » qui n'a plus rien à valider. C'est la
 * règle de l'arbre — ce que le registre ne tient plus ne doit plus être affiché — appliquée ici.
 */
export function useTransaction(
  passerelle: PasserelleTransaction,
  cleActive: DatabaseKey | null,
  revision?: unknown,
): Transactions {
  const [modes, setModes] = useState<Readonly<Record<string, TransactionMode>>>({})
  const [etats, setEtats] = useState<Readonly<Record<string, TransactionState>>>({})
  const [erreurs, setErreurs] = useState<Readonly<Record<string, string | null>>>({})
  const [affichees, setAffichees] = useState<Readonly<Record<string, number | null>>>({})
  const [aValider, setAValider] = useState<ValidationADemander | null>(null)
  const [enCours, setEnCours] = useState(false)

  const relire = useCallback(
    (cle: DatabaseKey) => {
      const id = index(cle)
      passerelle
        .transactionState(cle)
        // **Une lecture identique ne rend pas un état neuf**, et ce n'est pas une optimisation :
        // l'effet ci-dessous dépend de l'identité de la passerelle, qu'un appelant peut reconstruire
        // à chaque rendu — une lecture qui reposerait toujours un objet neuf relancerait alors
        // l'effet indéfiniment. C'est le piège de `10d` désarmé à la source plutôt que confié à la
        // discipline des appelants.
        .then((etat) =>
          setEtats((precedent) =>
            JSON.stringify(precedent[id]) === JSON.stringify(etat)
              ? precedent
              : { ...precedent, [id]: etat },
          ),
        )
        // **Le rejet est normal et il ne se remonte pas** : hors de la webview le pont ne répond
        // pas, et personne n'a rien demandé. Le panneau garde alors sa dernière lecture, ou son
        // état au repos.
        .catch(() => {})
    },
    [passerelle],
  )

  const idActif = cleActive === null ? null : index(cleActive)
  const modeActif = idActif === null ? 'auto' : (modes[idActif] ?? 'auto')

  // Deux dépendances que le corps ne nomme pas, et il en faut deux :
  //
  // - `idActif` **remplace** `cleActive`, que l'appelant reconstruit à chaque rendu — c'est l'index
  //   qui dit qu'on a changé de connexion, pas l'identité de l'objet. Le piège de `10d`, où une
  //   passerelle littérale relisait les lignes à chaque frappe ;
  // - `revision` est un **témoin** : on ne le lit pas, on constate qu'il a bougé. C'est le signal
  //   commun aux six commandes qui ferment une connexion (voir la doc de tête).
  // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus
  useEffect(() => {
    // **Seulement en mode manuel** : c'est le seul cas où quelque chose peut être ouvert, le mode
    // étant une propriété de la connexion. En `auto`, aucune commande ne part.
    if (cleActive === null || modeActif !== 'manual') return
    relire(cleActive)
  }, [idActif, modeActif, revision, relire])

  const achever = useCallback(
    (cle: DatabaseKey, ordre: 'valider' | 'annuler') => {
      const id = index(cle)
      setEnCours(true)
      const geste =
        ordre === 'valider'
          ? passerelle.commitTransaction(cle)
          : passerelle.rollbackTransaction(cle)
      geste
        .then(() => setErreurs((precedent) => ({ ...precedent, [id]: null })))
        // **Le refus se dit, ici.** C'est un geste demandé : un bouton qui retombe en silence se
        // lit comme une panne (défaut n° 36), et c'est le seul endroit qui puisse dire qu'une
        // validation n'a pas eu lieu.
        .catch((raison: unknown) =>
          setErreurs((precedent) => ({ ...precedent, [id]: messageDe(raison) })),
        )
        .finally(() => {
          setEnCours(false)
          // Le journal est vidé : il n'y a plus d'instruction à marquer.
          setAffichees((precedent) => ({ ...precedent, [id]: null }))
          // Relu dans les deux cas : côté Rust la transaction est terminée qu'elle ait été validée
          // ou non, et le journal est vide. Le relire plutôt que de le supposer garde une seule
          // vérité.
          relire(cle)
        })
    },
    [passerelle, relire],
  )

  return {
    mode: (cle) => (cle === null ? 'auto' : (modes[index(cle)] ?? 'auto')),
    affichee: (cle) => (cle === null ? null : (affichees[index(cle)] ?? null)),
    afficher: async (cle, rang) => {
      const id = index(cle)
      try {
        const resultat = await passerelle.transactionResult(cle, rang)
        setErreurs((precedent) => ({ ...precedent, [id]: null }))
        setAffichees((precedent) => ({ ...precedent, [id]: rang }))
        return resultat
      } catch (raison: unknown) {
        // **Le refus se dit** : c'est un geste demandé, et un clic qui ne change rien se lirait
        // comme une panne (défaut n° 36). La marque ne bouge pas — la grille non plus.
        setErreurs((precedent) => ({ ...precedent, [id]: messageDe(raison) }))
        return null
      }
    },
    poserLeMode: (cle, mode) => setModes((precedent) => ({ ...precedent, [index(cle)]: mode })),
    etat: (cle) => (cle === null ? AUCUNE_TRANSACTION : (etats[index(cle)] ?? AUCUNE_TRANSACTION)),
    erreur: (cle) => (cle === null ? null : (erreurs[index(cle)] ?? null)),
    apresExecution: (cle) => {
      const id = index(cle)
      // **Rien ne part en mode automatique**, et la condition porte sur les deux faits : le mode de
      // *cette* connexion, et une transaction qu'on sait déjà ouverte — celle qu'un mode passé à
      // `auto` derrière notre dos laisserait derrière lui. Lire de toute façon aurait ajouté un
      // aller-retour d'IPC à chaque exécution d'une console qui n'a rien demandé, y compris là où le
      // pont ne répond pas.
      if ((modes[id] ?? 'auto') !== 'manual' && !(etats[id]?.open ?? false)) return
      // **L'erreur part avec la transaction qu'elle décrivait.** Une validation refusée a terminé la
      // sienne ; la garder afficherait son refus au-dessus des instructions d'une transaction neuve.
      setErreurs((precedent) => ({ ...precedent, [id]: null }))
      // **La marque part avec l'exécution** : la grille montre désormais la réponse toute neuve, et
      // non celle de l'instruction qu'on avait désignée.
      setAffichees((precedent) => ({ ...precedent, [id]: null }))
      relire(cle)
    },
    demanderLaValidation: (cle) => {
      const enjeu = enJeu(cle, etats[index(cle)]?.statements ?? [])
      // Rien d'écrit dans la transaction : il n'y a rien à confirmer, et un clic de plus ne
      // protégerait de rien. C'est la règle de `demandeConfirmation`, appliquée à un lot.
      if (enjeu.ecritures.length === 0) {
        achever(cle, 'valider')
        return
      }
      setAValider(enjeu)
    },
    aValider,
    annulerLaValidation: () => setAValider(null),
    valider: (cle) => {
      setAValider(null)
      achever(cle, 'valider')
    },
    // **L'annulation ne se confirme pas.** Elle rend la base à son état : c'est le geste de repli,
    // et le confronter à une question ferait hésiter là où il n'y a rien à perdre. Ce qui se perd —
    // les instructions qu'on avait écrites — est dans l'éditeur, que rien n'efface.
    annuler: (cle) => achever(cle, 'annuler'),
    enCours,
  }
}

/**
 * Ce qu'une validation mettrait en jeu, lu dans le journal.
 *
 * Les instructions **refusées** sont écartées : elles n'ont rien écrit, et sur PostgreSQL elles ont
 * même abandonné la transaction — la compter comme une écriture ferait annoncer un `delete` qui n'a
 * pas eu lieu.
 */
function enJeu(
  cle: DatabaseKey,
  instructions: readonly TransactionStatement[],
): ValidationADemander {
  const ecrivantes = instructions.filter((instruction) => {
    if (instruction.error !== null) return false
    return demandeConfirmation(natureDe(instruction.sql))
  })
  return {
    cle,
    instructions: instructions.length,
    ecritures: ecrivantes.map((instruction) => {
      const nature = natureDe(instruction.sql)
      return nature.kind === 'lecture' ? '' : nature.instruction
    }),
    sansRestriction: ecrivantes.some((instruction) => sansRestriction(instruction.sql)),
  }
}

/** Le même dépliage que dans `useExecution` : une erreur d'IPC n'a pas de forme garantie. */
function messageDe(erreur: unknown): string {
  if (typeof erreur === 'string') return erreur
  if (erreur instanceof Error) return erreur.message
  if (erreur !== null && typeof erreur === 'object' && 'message' in erreur) {
    return String((erreur as { message: unknown }).message)
  }
  return 'la transaction a échoué'
}
