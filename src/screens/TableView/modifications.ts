import type { ColumnInfo, Value } from '../../domain/engine'

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

export type Modification = {
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

export type EnAttente = readonly Modification[]

/** Identifie une cellule : une ligne et une colonne. */
function memeCellule(m: Modification, cle: string, column: string): boolean {
  return m.cle === cle && m.column === column
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
  modification: Omit<Modification, 'avant'> & { avant: Value },
): Modification[] {
  const autres = attente.filter((m) => !memeCellule(m, modification.cle, modification.column))
  const existante = attente.find((m) => memeCellule(m, modification.cle, modification.column))

  // `avant` vient de la **première** saisie : la valeur d'origine, pas la précédente.
  const avant = existante?.avant ?? modification.avant
  if (estIdentique(avant, modification.apres)) return autres

  return [...autres, { ...modification, avant }]
}

/** Retire la modification d'une cellule. */
export function retirer(attente: EnAttente, cle: string, column: string): Modification[] {
  return attente.filter((m) => !memeCellule(m, cle, column))
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
): Modification | undefined {
  return attente.find((m) => memeCellule(m, cle, column))
}

/** Les lignes qui portent au moins une modification — la teinte de ligne de `11b`. */
export function lignesModifiees(attente: EnAttente): ReadonlySet<string> {
  return new Set(attente.map((m) => m.cle))
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
export function raisonDuRefus(colonne: ColumnInfo): string | null {
  if (colonne.key === 'primary') {
    return `${colonne.name} identifie la ligne : la modifier déplacerait la ligne à mettre à jour.`
  }
  if (colonne.category === 'binary') {
    return `${colonne.name} est binaire : sa valeur ne se saisit pas au clavier.`
  }
  return null
}
