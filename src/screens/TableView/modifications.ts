import type { ColumnInfo, Value } from '../../domain/engine'
import type { useT } from '../../i18n/LanguageContext'

type Traduire = ReturnType<typeof useT>

/**
 * Le repli de `raisonDuRefus`, en français — même arbitrage que `arbre.ts` : `t` est optionnel
 * pour que `modifications.test.ts` n'ait pas à en passer un à chaque appel, et seul l'appelant
 * réel (`TableView`) a besoin de la vraie traduction.
 */
const traduireEnFrancais: Traduire = (cle, parametres = {}) => {
  switch (cle) {
    case 'tableView.grid.primaryKeyColumnReason':
      return `${parametres.column} identifie la ligne : la modifier déplacerait la ligne à mettre à jour.`
    case 'tableView.grid.binaryReason':
      return `${parametres.column} est binaire : sa valeur ne se saisit pas au clavier.`
    default:
      return cle
  }
}

/**
 * Les modifications en attente de `A6`, en fonctions **pures**.
 *
 * **Rien n'est envoyé ici.** C'est le sens de « en attente » : le modèle retient ce qui a changé,
 * `11d` l'écrira. Isolé du rendu comme `arbre.ts` (`09d`), `onglets.ts` (`10b`) et `tri.ts` (`10d`) :
 * ce sont des règles, elles se testent sans DOM, et c'est là que se logent les erreurs de cas
 * limites.
 */

/** La nouvelle valeur d'une cellule : du texte saisi, ou `NULL` demandé explicitement. */
export type Saisie = { kind: 'texte'; texte: string } | { kind: 'null' }

/** La modification d'une cellule d'une ligne **qui existe** — un `UPDATE`. */
export type ModificationDeCellule = {
  sorte: 'cellule'
  /**
   * La valeur de la **clé primaire** de la ligne, en texte.
   *
   * **Pas son rang.** Le rang change au moindre tri, et une modification qui le suivrait
   * s'appliquerait à une autre ligne. C'est aussi ce que `11d` mettra dans son `WHERE`.
   */
  cle: string
  /** Le rang au moment de la saisie, pour l'affichage seul — « ligne 3 · id 184217 ». */
  rang: number
  column: string
  /** La valeur d'origine, telle que la base l'a rendue. */
  avant: Value
  apres: Saisie
}

/**
 * Une ligne **à ajouter**, retenue comme les autres modifications — un `INSERT`.
 *
 * **Une seule entrée pour toute la ligne, et non une par cellule.** Le compte affiché est celui des
 * *écritures* qui partiront : trois cellules remplies dans une ligne neuve font un seul `INSERT`, et
 * les compter trois annoncerait trois écritures qui n'existent pas. C'est aussi ce qui donne au
 * panneau une carte par ligne, où le diff n'aurait aucun « avant » à montrer.
 *
 * **Sa `cle` est locale**, jamais envoyée : la vraie clé est décidée par la base — une séquence, un
 * `uuid` par défaut, un `_id`. Elle sert à identifier la ligne à l'écran, rien d'autre.
 */
export type LigneAjoutee = {
  sorte: 'ligne'
  cle: string
  /** Le numéro d'ordre parmi les lignes ajoutées — « nouvelle ligne 2 ». */
  rang: number
  /**
   * Les valeurs saisies, par colonne.
   *
   * **Une colonne absente n'est pas une colonne nulle** : elle est laissée au défaut de la base. La
   * distinction traverse tout le chemin jusqu'au SQL, et c'est elle qui permet d'ajouter une ligne
   * sans connaître la moitié de ses colonnes.
   */
  valeurs: Readonly<Record<string, Saisie>>
}

/**
 * Une ligne **existante** marquée pour suppression — un `DELETE`, écrit seulement à « Appliquer ».
 *
 * **Un geste qui bascule** : marquer une ligne déjà marquée annule la marque, comme la retirer du
 * panneau. Marquer efface au passage les modifications de cellule en attente de cette ligne — elles
 * n'ont plus d'objet, la ligne allant disparaître — voir `marquerPourSuppression`.
 */
export type LigneSupprimee = {
  sorte: 'suppression'
  cle: string
  /** Le rang au moment de la marque, pour l'affichage seul — comme `ModificationDeCellule.rang`. */
  rang: number
}

export type Modification = ModificationDeCellule | LigneAjoutee | LigneSupprimee

export type EnAttente = readonly Modification[]

/** Vrai pour une ligne ajoutée — le garde de typage des trois sortes. */
export function estUneLigneAjoutee(modification: Modification): modification is LigneAjoutee {
  return modification.sorte === 'ligne'
}

/** Vrai pour une ligne marquée pour suppression — le garde de typage des trois sortes. */
export function estUneLigneSupprimee(modification: Modification): modification is LigneSupprimee {
  return modification.sorte === 'suppression'
}

/** Identifie une cellule : une ligne et une colonne. */
function memeCellule(m: Modification, cle: string, column: string): boolean {
  return m.sorte === 'cellule' && m.cle === cle && m.column === column
}

/**
 * Retient une saisie, ou **retire** la modification quand elle ramène la valeur d'origine.
 *
 * Trois règles en une fonction, parce qu'elles portent sur le même état :
 *
 * 1. **Retaper la valeur d'origine retire la modification.** En créer une qui ne change rien
 *    ferait compter « 1 modification en attente » pour une cellule intacte, et produirait un
 *    `UPDATE` inutile en `11d`.
 * 2. **Deux saisies sur la même cellule n'en font qu'une**, dont `avant` reste l'originale — sinon
 *    le diff comparerait la valeur à elle-même après le second passage.
 * 3. L'ordre des autres est conservé : le panneau de `11c` les liste dans l'ordre de saisie.
 */
export function retenir(
  attente: EnAttente,
  modification: Omit<ModificationDeCellule, 'sorte'>,
): Modification[] {
  const autres = attente.filter((m) => !memeCellule(m, modification.cle, modification.column))
  const existante = attente.find((m) => memeCellule(m, modification.cle, modification.column))

  // `avant` vient de la **première** saisie : la valeur d'origine, pas la précédente.
  const avant =
    existante !== undefined && existante.sorte === 'cellule' ? existante.avant : modification.avant
  if (estIdentique(avant, modification.apres)) return autres

  return [...autres, { ...modification, sorte: 'cellule', avant }]
}

/**
 * Retire la modification d'une cellule — ou **la ligne entière** si la clé est celle d'un ajout.
 *
 * Une ligne ajoutée n'a pas de colonne à retirer isolément : sa carte porte une seule croix, et
 * c'est toute la ligne qu'elle enlève. Passer une colonne quelconque pour un ajout retire donc la
 * ligne, ce qui est le seul geste que le panneau puisse offrir.
 */
export function retirer(attente: EnAttente, cle: string, column: string): Modification[] {
  return attente.filter(
    (m) =>
      !memeCellule(m, cle, column) &&
      !(m.sorte === 'ligne' && m.cle === cle) &&
      !(m.sorte === 'suppression' && m.cle === cle),
  )
}

/** Une ligne existante est-elle marquée pour suppression ? */
export function estMarqueePourSuppression(attente: EnAttente, cle: string): boolean {
  return attente.some((m) => estUneLigneSupprimee(m) && m.cle === cle)
}

/**
 * Marque une ligne existante pour suppression, ou annule la marque si elle y est déjà — le geste
 * bascule, que ce soit `Suppr` ou la croix révélée au survol du numéro de ligne.
 *
 * **Une ligne ajoutée, pas encore écrite, se retire entière** : il n'y a rien à marquer, rien à
 * écrire pour annuler — le même geste que la croix d'une carte « nouvelle ligne » du panneau.
 *
 * **Marquer efface les modifications de cellule de cette ligne.** Une cellule modifiée sur une
 * ligne qui va disparaître n'a plus d'objet, et les deux écritures — `UPDATE` puis `DELETE` —
 * seraient redondantes. Démarquer ne les restaure pas : le même compromis, simple et prévisible,
 * déjà assumé pour le patch inverse des insertions.
 */
export function marquerPourSuppression(
  attente: EnAttente,
  cle: string,
  rang: number,
): Modification[] {
  if (attente.some((m) => estUneLigneAjoutee(m) && m.cle === cle)) {
    return attente.filter((m) => !(m.sorte === 'ligne' && m.cle === cle))
  }
  if (estMarqueePourSuppression(attente, cle)) {
    return attente.filter((m) => !(m.sorte === 'suppression' && m.cle === cle))
  }
  const sansSesCellules = attente.filter((m) => !(m.sorte === 'cellule' && m.cle === cle))
  return [...sansSesCellules, { sorte: 'suppression', cle, rang }]
}

/**
 * Ajoute une ligne vide au modèle — le bouton « + » de la barre d'outils.
 *
 * **Chaque clic en ajoute une**, sans rien demander : nommer ou remplir avant d'avoir la ligne
 * sous les yeux revient à demander un titre pour une page blanche, ce que le projet refuse déjà
 * pour les consoles. La ligne s'emplit ensuite cellule par cellule, comme n'importe quelle autre.
 *
 * L'identité locale prend le **plus petit numéro libre**, comme les consoles : deux ajouts suivis
 * d'un retrait ne doivent pas laisser un trou dans les numéros affichés.
 */
export function ajouterUneLigne(attente: EnAttente): Modification[] {
  const prises = new Set(attente.filter(estUneLigneAjoutee).map((ligne) => ligne.rang))
  let rang = 1
  while (prises.has(rang)) rang += 1
  return [...attente, { sorte: 'ligne', cle: `nouvelle-${rang}`, rang, valeurs: {} }]
}

/**
 * Pose une valeur dans une ligne ajoutée.
 *
 * **Vider une cellule la retire de la ligne** plutôt que d'y poser la chaîne vide : c'est ce qui
 * rend la colonne à son défaut. Demander `NULL` explicitement (`⌥⌫`) reste une valeur, et s'écrit.
 */
export function saisirDansLaLigne(
  attente: EnAttente,
  cle: string,
  column: string,
  apres: Saisie | null,
): Modification[] {
  return attente.map((modification) => {
    if (!estUneLigneAjoutee(modification) || modification.cle !== cle) return modification
    const valeurs = { ...modification.valeurs }
    if (apres === null) delete valeurs[column]
    else valeurs[column] = apres
    return { ...modification, valeurs }
  })
}

/** La saisie retenue pour une cellule d'une ligne ajoutée, s'il y en a une. */
export function valeurDeLaLigne(
  attente: EnAttente,
  cle: string,
  column: string,
): Saisie | undefined {
  const ligne = attente.find((m) => estUneLigneAjoutee(m) && m.cle === cle)
  return ligne !== undefined && estUneLigneAjoutee(ligne) ? ligne.valeurs[column] : undefined
}

/** Les lignes ajoutées, dans l'ordre où elles ont été demandées. */
export function lignesAjoutees(attente: EnAttente): LigneAjoutee[] {
  return attente.filter(estUneLigneAjoutee)
}

/** Retire la **dernière** modification retenue — `⌘Z`. */
export function annulerLaDerniere(attente: EnAttente): Modification[] {
  return attente.slice(0, -1)
}

/** La modification en attente d'une cellule, s'il y en a une. */
export function modificationDe(
  attente: EnAttente,
  cle: string,
  column: string,
): ModificationDeCellule | undefined {
  const trouvee = attente.find((m) => memeCellule(m, cle, column))
  return trouvee !== undefined && trouvee.sorte === 'cellule' ? trouvee : undefined
}

/** Les lignes qui portent au moins une modification — la teinte de ligne de `11b`. */
export function lignesModifiees(attente: EnAttente): ReadonlySet<string> {
  return new Set(attente.map((m) => m.cle))
}

/**
 * Une colonne est-elle éditable **dans une ligne qu'on ajoute** ?
 *
 * **La clé primaire l'est ici**, alors qu'elle ne l'est pas dans une ligne existante : il n'y a
 * aucun `WHERE` à déplacer, et une table dont la clé n'est pas engendrée — un code, une référence —
 * ne pourrait recevoir aucune ligne si on la refusait. Le binaire reste refusé, pour la raison qui
 * ne change pas : il ne se saisit pas au clavier.
 */
export function estEditableALAjout(colonne: ColumnInfo): boolean {
  return colonne.category !== 'binary'
}

/**
 * Vrai quand la saisie ramène exactement la valeur d'origine.
 *
 * **La comparaison se fait sur le texte rendu**, pas sur les genres : l'utilisateur tape des
 * caractères, et `12900` tapé dans une cellule qui vaut `12900` est un retour à l'origine même si
 * l'un est un `int` et l'autre une chaîne. Comparer les genres ferait de toute saisie une
 * modification.
 *
 * `NULL` est le seul cas où les genres décident : une cellule `NULL` où l'on demande `NULL` est
 * inchangée, une cellule vide (`''`) où l'on demande `NULL` **change**.
 */
export function estIdentique(avant: Value, apres: Saisie): boolean {
  if (apres.kind === 'null') return avant.kind === 'null'
  if (avant.kind === 'null') return false
  return texteBrutDe(avant) === apres.texte
}

/**
 * La valeur d'origine en texte, telle qu'on la compare et qu'on la propose à la saisie.
 *
 * **Distincte du rendu de `cellule.tsx`** : celui-ci formate pour l'œil — groupement des milliers,
 * `NULL` en toutes lettres, binaire abrégé. Éditer une cellule doit proposer la valeur *brute*,
 * sinon l'utilisateur corrigerait « 12 900 » et enverrait une espace insécable à la base.
 */
export function texteBrutDe(valeur: Value): string {
  switch (valeur.kind) {
    case 'null':
      return ''
    case 'bool':
      return valeur.value ? 'true' : 'false'
    case 'int':
    case 'float':
      return String(valeur.value)
    case 'decimal':
    case 'text':
    case 'timestamp':
    case 'json':
      return valeur.value
    case 'binary':
      // Un binaire ne s'édite pas au clavier : la saisie est refusée en amont (`estEditable`), et
      // ce texte ne sert qu'à la comparaison.
      return valeur.base64
  }
}

/**
 * Une colonne est-elle éditable ?
 *
 * **La clé primaire ne l'est pas** : elle identifie la ligne, et la changer déplacerait la cible du
 * `WHERE` de `11d` — on modifierait une ligne tout en changeant ce qui permet de la retrouver.
 *
 * **Le binaire non plus** : il ne se saisit pas au clavier, et proposer un champ texte sur du
 * `bytea` inviterait à écrire du charabia dans la base.
 */
export function estEditable(colonne: ColumnInfo): boolean {
  return colonne.key !== 'primary' && colonne.category !== 'binary'
}

/** Pourquoi une colonne ne l'est pas — dit, jamais deviné. */
export function raisonDuRefus(
  colonne: ColumnInfo,
  t: Traduire = traduireEnFrancais,
): string | null {
  if (colonne.key === 'primary') {
    return t('tableView.grid.primaryKeyColumnReason', { column: colonne.name })
  }
  if (colonne.category === 'binary') {
    return t('tableView.grid.binaryReason', { column: colonne.name })
  }
  return null
}
