import type { ColumnInfo, ConstraintInfo, Relation } from '../../domain/engine'

/**
 * Ce que le tableau des colonnes de `A9` (`14a`) écrit dans ses cellules, en fonctions **pures**.
 *
 * Tout vient de `TableDetail` — aucune lecture supplémentaire n'est envoyée au moteur : `06c` rend
 * déjà colonnes, contraintes et relations, et `A9` en est un troisième lecteur.
 */

/**
 * La cellule « défaut ».
 *
 * **Une identité n'a pas de `default`** : PostgreSQL ne range pas `GENERATED ... AS IDENTITY` dans
 * `pg_attrdef`, si bien qu'une clé primaire auto-incrémentée afficherait « — » — et se lirait comme
 * une colonne à remplir soi-même. Le champ `identity` de `06c` existe pour ce cas.
 */
export function defautLisible(colonne: ColumnInfo): string | null {
  if (colonne.identity !== null) {
    // Les deux formes ne se comportent pas pareil à l'écriture : `always` refuse une valeur
    // fournie. Les fondre en « identity » cacherait la raison d'un refus d'insertion.
    return colonne.identity === 'always' ? 'identity (always)' : 'identity'
  }
  return colonne.default
}

/** Ce qu'une cellule « commentaire » porte, et **d'où elle le tient**. */
export type Annotation = {
  texte: string
  /**
   * Vrai quand le texte est **déduit** du catalogue, faux quand c'est le commentaire écrit par
   * quelqu'un.
   *
   * Le mockup mélange les deux dans la même colonne — « → users.id » et « TTC, devise ci-contre »
   * côte à côte. Les rendre à l'identique ferait passer une déduction de DoraBase pour une phrase
   * d'un collègue ; le drapeau permet de les distinguer à l'œil.
   */
  deduit: boolean
}

/**
 * La cellule « commentaire », par ordre de priorité : le commentaire, puis la cible d'une clé
 * étrangère, puis la contrainte `check` qui porte sur la colonne.
 *
 * **Le commentaire passe devant.** Il a été écrit exprès ; une déduction ne doit pas le remplacer.
 */
export function annotationDe(
  colonne: ColumnInfo,
  relations: readonly Relation[],
  contraintes: readonly ConstraintInfo[],
): Annotation | null {
  if (colonne.comment !== null && colonne.comment.trim() !== '') {
    return { texte: colonne.comment, deduit: false }
  }

  const sortante = relations.find(
    (relation) => relation.direction === 'outgoing' && relation.columns.includes(colonne.name),
  )
  if (sortante) {
    // Le rang de la colonne dans la contrainte donne la colonne visée : une clé composite
    // `(a, b) → (x, y)` fait pointer `a` vers `x`, pas vers `x, y`.
    const rang = sortante.columns.indexOf(colonne.name)
    const cible = sortante.targetColumns[rang] ?? sortante.targetColumns.join(', ')
    return { texte: `→ ${sortante.targetTable}.${cible}`, deduit: true }
  }

  const check = contraintes.find(
    (contrainte) =>
      estUnCheck(contrainte.definition) && citeLaColonne(contrainte.definition, colonne.name),
  )
  if (check) return { texte: resumeDeCheck(check.definition), deduit: true }

  return null
}

/**
 * Le résumé d'une contrainte `check` : « check ∈ 5 valeurs », ou « check » à défaut.
 *
 * **On ne montre pas l'expression.** Une définition `check` tient rarement dans une cellule, et la
 * tronquer donnerait une condition fausse à lire — pire qu'un résumé. L'expression entière est dans
 * le tableau des contraintes (`14b`) et dans le DDL (`14c`).
 */
export function resumeDeCheck(definition: string): string {
  const compte = valeursEnumerees(definition)
  return compte === null ? 'check' : `check ∈ ${compte} valeurs`
}

/** Le nombre de valeurs d'un `in (…)` ou d'un `= any (array[…])`, ou `null` si ce n'en est pas un. */
function valeursEnumerees(definition: string): number | null {
  const liste = /\b(?:in|any)\s*\(\s*(?:array\s*\[)?([^)\]]*)/i.exec(definition)
  if (!liste?.[1]) return null
  const valeurs = liste[1].split(',').filter((morceau) => morceau.trim() !== '')
  // Un seul élément n'est pas une énumération : `in ('paid')` se lit mieux « check » que
  // « check ∈ 1 valeurs », et c'est de toute façon une égalité déguisée.
  return valeurs.length > 1 ? valeurs.length : null
}

function estUnCheck(definition: string): boolean {
  return /^\s*check\b/i.test(definition)
}

/**
 * Vrai quand la définition cite la colonne **comme identifiant**, pas comme fragment.
 *
 * Les bornes de mot importent : sans elles, `status` serait trouvé dans `status_extra`, et une
 * colonne recevrait la contrainte d'une autre. L'inverse reste possible — une colonne citée dans
 * une expression qui ne la contraint pas vraiment — et c'est une approximation assumée : la
 * déduction est marquée comme telle, et le tableau des contraintes dit la vérité entière.
 */
function citeLaColonne(definition: string, nom: string): boolean {
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w"])"?${echappe}"?($|[^\\w"])`).test(definition)
}
