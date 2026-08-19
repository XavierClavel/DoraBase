/** Les bornes du zoom. En dessous, les 11 px du handoff deviennent illisibles ; au-delà, une grille
 * de dix-huit colonnes n'en montre plus trois. */
export const ZOOM_MIN = 0.7
export const ZOOM_MAX = 1.6

/**
 * La finesse du pas. Un cran de molette vaut `deltaY = 100` ; `exp(-0.0004 × 100) ≈ 0,961`, soit
 * **4 % par cran**. Le zoom natif de la webview en fait dix à vingt-cinq — d'où la demande.
 */
const FINESSE = 0.0004

/**
 * Le facteur de zoom suivant, pour un geste de molette donné.
 *
 * # Pourquoi un produit et non une somme
 *
 * `facteur × exp(-k·delta)` plutôt que `facteur - k·delta`. Un pas additif est **asymétrique** :
 * retirer 0,04 à 1,6 fait −2,5 %, en retirer autant à 0,7 fait −5,7 %, donc le même geste agit deux
 * fois plus fort en bas de course qu'en haut. Un pas multiplicatif rend le même geste au même effet
 * perçu partout, et garantit qu'un zoom avant suivi d'un zoom arrière identique revienne exactement
 * au point de départ.
 *
 * `deltaY` négatif — le geste d'écartement — agrandit : c'est la convention de la molette, où le
 * défilement vers le haut est négatif.
 */
export function facteurSuivant(courant: number, deltaY: number): number {
  const suivant = courant * Math.exp(-deltaY * FINESSE)
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, suivant))
}

/** Le zoom rendu à sa valeur d'origine — `⌘0` dans toutes les applications. */
export const ZOOM_NEUTRE = 1
