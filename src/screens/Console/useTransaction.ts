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
 * Une console, et la connexion sur laquelle elle porte.
 *
 * **Les deux, parce que les deux états ne sont pas au même endroit** : le régime et ce qu'on
 * regarde appartiennent à la **console** — l'onglet —, la transaction elle-même appartient à la
 * **session**, donc à la connexion. Une seule clef aurait forcé l'un des deux à mentir.
 */
export type Console = {
  cle: DatabaseKey
  /** L'identité de l'onglet, celle d'`idOnglet` — le même index que le texte et le résultat. */
  id: string
}

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
  /** La console qui a demandé la validation : c'est elle qui la reçoit, et son onglet la porte. */
  console: Console
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
  /** Le régime de **cette console** — `auto` tant que personne n'a rien réglé sur elle. */
  mode: (console: Console | null) => TransactionMode
  poserLeMode: (console: Console, mode: TransactionMode) => void
  /** Ce que la transaction de sa **connexion** contient, tel que le Rust l'a dit. */
  etat: (console: Console | null) => TransactionState
  /**
   * Vrai quand une transaction est ouverte sur la connexion de cette console alors qu'elle est,
   * elle, en mode `auto`.
   *
   * **Le seul écart que le régime par console laisse ouvert, et il se dit.** Les consoles d'une même
   * connexion partagent une session : les requêtes de celle-ci entrent donc dans une transaction
   * qu'une voisine a ouverte, et qu'un « Valider » ou un « Annuler » d'ailleurs décidera. Le taire
   * serait laisser croire à une écriture validée.
   */
  transactionEtrangere: (console: Console | null) => boolean
  /** Le refus d'une validation, d'une annulation ou d'une lecture de réponse, s'il y en a un. */
  erreur: (console: Console | null) => string | null
  /**
   * Le rang de l'instruction dont la réponse est dans la grille de cette console, ou `null`.
   *
   * **`null` après chaque exécution**, et le panneau ne marque alors rien : la grille montre la
   * réponse de la dernière exécution *de cette console*, et rien ne dit quelle entrée du journal
   * l'a produite — deux consoles y écrivent. Marquer la dernière entrée serait juste presque
   * toujours, et faux dès qu'une voisine a exécuté après nous.
   */
  affichee: (console: Console | null) => number | null
  /**
   * Demande la réponse d'une instruction, et retient laquelle est affichée.
   *
   * Rend `null` quand le cœur a refusé — l'appelant laisse alors sa grille telle quelle, et le
   * refus paraît dans le panneau.
   */
  afficher: (console: Console, index: number) => Promise<QueryResult | null>
  /** Relit le journal. Appelé après chaque exécution, et par l'effet de cette fonction. */
  apresExecution: (console: Console) => void
  /**
   * Demande la validation — passe par la confirmation quand la transaction contient des écritures.
   *
   * **C'est ici que la confirmation a lieu, et non à l'exécution** (`API-38`) : en transaction
   * manuelle, le moment où l'on s'engage est la validation. Une transaction qui n'a fait que lire
   * n'a rien à confirmer, comme un `select` n'en demande pas.
   */
  demanderLaValidation: (console: Console) => void
  /** Ce qu'une validation met en jeu, quand elle attend une confirmation. */
  aValider: ValidationADemander | null
  annulerLaValidation: () => void
  /** Valide pour de bon. Appelé par la confirmation. */
  valider: (console: Console) => void
  annuler: (console: Console) => void
  /** Vrai pendant une validation ou une annulation : les deux boutons attendent. */
  enCours: boolean
}

/**
 * La transaction manuelle d'une console (`API-38`).
 *
 * # Le régime appartient à la console, la transaction à la session
 *
 * **Deux états, et ils ne sont pas au même endroit.** Le régime — manuel ou automatique — et ce
 * qu'on regarde sont des propriétés de l'**onglet** : c'est sur cette console-là qu'on a allumé
 * l'interrupteur, et passer à une autre ne doit pas en montrer le panneau. Ils sont donc indexés par
 * identité d'onglet, comme le texte (`12a`), le résultat (`12c`) et les modifications en attente
 * (`11b`).
 *
 * La **transaction**, elle, appartient à la session, donc à la connexion : le registre ne tient
 * qu'un adaptateur par base, et un `begin` posé depuis une console englobe ce que ses voisines
 * exécutent. C'est un fait du serveur, pas un choix d'écran, et le journal est indexé par connexion
 * pour cette raison — deux consoles réglées en manuel sur la même base regardent **la même**
 * transaction, et un `commit` de l'une emporte ce que l'autre a écrit.
 *
 * # L'écart que cela laisse, et comment il se dit
 *
 * Une console en `auto` sur une connexion dont une voisine a ouvert une transaction y écrit sans
 * l'avoir demandé. Rien ne peut l'empêcher — c'est une seule session —, mais le taire serait laisser
 * croire à une écriture validée : `transactionEtrangere` le rend, et le pied de la console le dit.
 * Une première version faisait du régime une propriété de la connexion pour supprimer le cas ; ce
 * qu'elle supprimait vraiment était le **choix** — le panneau d'une console apparaissait sur toutes
 * celles de la même base.
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
 * Tant qu'aucune console de la connexion n'est en manuel et qu'aucune transaction n'est connue
 * ouverte, aucune commande n'est appelée : la galerie, `?demo` et toute la suite Playwright n'y
 * touchent pas. C'est l'arbitrage de la recherche de mise à jour, pour la même raison.
 *
 * @param revision le témoin de configuration, `projects` en pratique : **les six commandes qui
 * ferment une connexion le réécrivent**, et une transaction fermée avec sa connexion doit
 * disparaître du panneau plutôt que d'y offrir un « Valider » qui n'a plus rien à valider. C'est la
 * règle de l'arbre — ce que le registre ne tient plus ne doit plus être affiché — appliquée ici.
 */
export function useTransaction(
  passerelle: PasserelleTransaction,
  consoleActive: Console | null,
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

  const connexionActive = consoleActive === null ? null : index(consoleActive.cle)
  const modeActif = consoleActive === null ? 'auto' : (modes[consoleActive.id] ?? 'auto')
  /**
   * Vrai quand le journal de cette connexion est **connu** ouvert.
   *
   * C'est ce qui fait relire une console en `auto` : sans transaction connue, rien ne part — et dès
   * qu'une voisine en a ouvert une, la lecture reprend, pour que le pied puisse le dire. Une
   * transaction qu'aucune console n'a jamais lue reste invisible, ce qui est le prix de « rien ne
   * part avant qu'on le demande ».
   */
  const journalConnu = connexionActive !== null && (etats[connexionActive]?.open ?? false)

  // Trois dépendances que le corps ne nomme pas, et il en faut trois :
  //
  // - `connexionActive` **remplace** la clef, que l'appelant reconstruit à chaque rendu — c'est
  //   l'index qui dit qu'on a changé de connexion, pas l'identité de l'objet. Le piège de `10d`, où
  //   une passerelle littérale relisait les lignes à chaque frappe ;
  // - `modeActif` et `journalConnu` sont les deux raisons de relire, chacune lue par la garde ;
  // - `revision` est un **témoin** : on ne le lit pas, on constate qu'il a bougé. C'est le signal
  //   commun aux six commandes qui ferment une connexion (voir la doc de tête).
  // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus
  useEffect(() => {
    // **En manuel, ou sur une transaction déjà connue** : hors de ces deux cas il n'y a rien à
    // lire, et aucune commande ne part — la galerie et `?demo` n'y touchent pas.
    if (consoleActive === null || (modeActif !== 'manual' && !journalConnu)) return
    relire(consoleActive.cle)
  }, [connexionActive, modeActif, journalConnu, revision, relire])

  const achever = useCallback(
    (console: Console, ordre: 'valider' | 'annuler') => {
      const { cle, id } = console
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
    mode: (console) => (console === null ? 'auto' : (modes[console.id] ?? 'auto')),
    poserLeMode: (console, mode) => setModes((precedent) => ({ ...precedent, [console.id]: mode })),
    etat: (console) =>
      console === null ? AUCUNE_TRANSACTION : (etats[index(console.cle)] ?? AUCUNE_TRANSACTION),
    transactionEtrangere: (console) => {
      if (console === null) return false
      // **Ouverte sur la connexion, alors que cette console-ci ne l'a pas demandé.** C'est le seul
      // écart que le régime par console laisse ouvert : une seule session, plusieurs onglets.
      const ouverte = etats[index(console.cle)]?.open ?? false
      return ouverte && (modes[console.id] ?? 'auto') === 'auto'
    },
    erreur: (console) => (console === null ? null : (erreurs[console.id] ?? null)),
    affichee: (console) => (console === null ? null : (affichees[console.id] ?? null)),
    afficher: async (console, rang) => {
      try {
        const resultat = await passerelle.transactionResult(console.cle, rang)
        setErreurs((precedent) => ({ ...precedent, [console.id]: null }))
        setAffichees((precedent) => ({ ...precedent, [console.id]: rang }))
        return resultat
      } catch (raison: unknown) {
        // **Le refus se dit** : c'est un geste demandé, et un clic qui ne change rien se lirait
        // comme une panne (défaut n° 36). La marque ne bouge pas — la grille non plus.
        setErreurs((precedent) => ({ ...precedent, [console.id]: messageDe(raison) }))
        return null
      }
    },
    apresExecution: (console) => {
      // **Rien ne part en mode automatique sur une connexion sans transaction connue.** La
      // condition porte sur les deux faits, et le second est ce qui fait suivre une console `auto`
      // dont la voisine a ouvert une transaction : ses requêtes y entrent, et le pied doit le dire.
      if (
        (modes[console.id] ?? 'auto') !== 'manual' &&
        !(etats[index(console.cle)]?.open ?? false)
      ) {
        return
      }
      // **L'erreur part avec la transaction qu'elle décrivait.** Une validation refusée a terminé la
      // sienne ; la garder afficherait son refus au-dessus des instructions d'une transaction neuve.
      setErreurs((precedent) => ({ ...precedent, [console.id]: null }))
      // **La marque part avec l'exécution** : la grille montre désormais la réponse toute neuve, et
      // non celle de l'instruction qu'on avait désignée.
      setAffichees((precedent) => ({ ...precedent, [console.id]: null }))
      relire(console.cle)
    },
    demanderLaValidation: (console) => {
      const enjeu = enJeu(console, etats[index(console.cle)]?.statements ?? [])
      // Rien d'écrit dans la transaction : il n'y a rien à confirmer, et un clic de plus ne
      // protégerait de rien. C'est la règle de `demandeConfirmation`, appliquée à un lot.
      if (enjeu.ecritures.length === 0) {
        achever(console, 'valider')
        return
      }
      setAValider(enjeu)
    },
    aValider,
    annulerLaValidation: () => setAValider(null),
    valider: (console) => {
      setAValider(null)
      achever(console, 'valider')
    },
    // **L'annulation ne se confirme pas.** Elle rend la base à son état : c'est le geste de repli,
    // et le confronter à une question ferait hésiter là où il n'y a rien à perdre. Ce qui se perd —
    // les instructions qu'on avait écrites — est dans l'éditeur, que rien n'efface.
    annuler: (console) => achever(console, 'annuler'),
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
  console: Console,
  instructions: readonly TransactionStatement[],
): ValidationADemander {
  const ecrivantes = instructions.filter((instruction) => {
    if (instruction.error !== null) return false
    return demandeConfirmation(natureDe(instruction.sql))
  })
  return {
    console,
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
