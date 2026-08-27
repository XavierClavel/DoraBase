/**
 * L'internationalisation de l'interface (26 août 2026).
 *
 * Deux langues, sans bibliothèque : le dépôt n'en avait aucune, et l'ensemble tient dans
 * une résolution de chemin par points sur un objet imbriqué. `Locale` est distinct de
 * `Language` (`../domain/config`, généré depuis Rust) — `Language` porte aussi `'systeme'`,
 * qui n'est jamais une langue **affichée** : elle se résout en `'fr'` ou `'en'` avant
 * d'atteindre un dictionnaire.
 */
export type Locale = 'fr' | 'en'

/**
 * Une entrée de dictionnaire : une chaîne fixe, ou une fonction pour ce qu'une simple
 * substitution ne suffit pas à dire (accords, pluriels, valeurs composées).
 */
export type Entree = string | ((parametres: Record<string, string | number>) => string)

export type Dictionnaire = { [cle: string]: Entree | Dictionnaire }
