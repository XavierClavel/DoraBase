import type { ColumnInfo, Relation, Value } from '../../domain/engine'

/**
 * La règle « ligne liée » du handoff, appliquée telle qu'elle est écrite.
 *
 * Le `README.md` du handoff la donne mot pour mot : n'afficher l'aperçu de la ligne cible d'une
 * clé étrangère **que si** celle-ci porte au moins un champ lisible par un humain, d'après une
 * liste blanche insensible à la casse. Sinon, ne rien afficher — pas de dump d'identifiants
 * techniques.
 *
 * **C'est la seule règle métier explicite du handoff, et elle est là pour une raison** : un
 * aperçu automatique qui déverse le contenu d'une ligne référencée transforme un clic distrait en
 * fuite de données. D'où une liste vivant à **un seul endroit**, et testée aux deux bords.
 */
export const CHAMPS_LISIBLES: readonly string[] = [
  'email',
  'name',
  'label',
  'title',
  'first_name',
  'firstname',
  'last_name',
  'lastname',
  'username',
  'slug',
  'code',
  'reference',
]

/**
 * Les colonnes de la table cible qui autorisent un aperçu.
 *
 * Vide, il n'y a **rien à afficher** — et c'est un résultat, pas un échec.
 */
export function champsLisibles(colonnes: readonly ColumnInfo[]): ColumnInfo[] {
  return colonnes.filter((colonne) => CHAMPS_LISIBLES.includes(colonne.name.toLowerCase()))
}

/**
 * La relation sortante qui part d'une colonne, s'il y en a une.
 *
 * Sortante seulement : une relation entrante dit qui référence cette table, ce qui ne désigne
 * aucune ligne précise à prévisualiser.
 */
export function relationDe(relations: readonly Relation[], column: string): Relation | undefined {
  return relations.find(
    (relation) => relation.direction === 'outgoing' && relation.columns.includes(column),
  )
}

/**
 * La valeur d'une clé étrangère, telle qu'un filtre l'attend — une **chaîne**.
 *
 * `Filter.value` est une chaîne depuis `06a` : « c'est ce que l'utilisateur a tapé, et c'est
 * l'adaptateur qui la lie en paramètre selon le type de la colonne ». Une clé nulle ne désigne
 * aucune ligne, donc pas d'aperçu.
 */
export function valeurDeCle(valeur: Value | undefined): string | null {
  if (!valeur) return null
  switch (valeur.kind) {
    case 'int':
    case 'float':
      return String(valeur.value)
    case 'text':
    case 'timestamp':
      return valeur.value
    default:
      return null
  }
}
