/**
 * Le formatage abrégé des comptes et des tailles, tel que le handoff l'écrit.
 *
 * **Ici plutôt que dans chaque écran** : « 1.9 M », « 2.1 GB », « 128 k » apparaissent dans la
 * sidebar (`A4`), le panneau de détail (`A4`), la barre d'état (`A5`) et la structure (`A9`).
 * Quatre implémentations divergeraient.
 *
 * Fonctions **pures**, donc exhaustivement testables — ce qui compte, parce que les cas limites
 * sont précisément là où un formatage se trompe.
 */

/**
 * Un compte de lignes, abrégé au-delà du millier.
 *
 * **Puissances de 1000**, pas de 1024 : un compte de lignes n'a rien de binaire. `formatBytes`
 * fait l'inverse, et les confondre afficherait « 1.0 k » pour 1024 lignes.
 *
 * Sous mille, le nombre est rendu tel quel : « 999 » et non « 1.0 k », qui serait faux, ni
 * « 0.9 k », qui perdrait de la précision sans rien gagner en lisibilité.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value < 0) return '—'
  if (value < 1000) return String(Math.trunc(value))

  const paliers: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
  ]
  for (const [seuil, suffixe] of paliers) {
    if (value >= seuil) {
      const abrege = value / seuil
      // Une décimale sous dix, aucune au-delà : « 1.9 M » mais « 128 k », comme le mockup.
      // Trois chiffres significatifs suffisent à un ordre de grandeur, et « 128.4 k » encombre.
      return `${abrege < 10 ? abrege.toFixed(1) : Math.round(abrege)} ${suffixe}`
    }
  }
  return String(value)
}

/**
 * Une taille en octets, abrégée.
 *
 * **Puissances de 1024**, parce que `pg_total_relation_size` rend des octets et que les
 * conventions de taille de disque sont binaires. Les unités gardent la forme du handoff —
 * « 2.1 GB », pas « 2.1 GiB », qui serait plus exact et que le mockup n'emploie pas.
 */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${Math.trunc(value)} B`

  const unites = ['KB', 'MB', 'GB', 'TB', 'PB']
  let reste = value / 1024
  let rang = 0
  while (reste >= 1024 && rang < unites.length - 1) {
    reste /= 1024
    rang += 1
  }
  return `${reste < 10 ? reste.toFixed(1) : Math.round(reste)} ${unites[rang]}`
}

/**
 * Le tiret cadratin des colonnes sans objet.
 *
 * **Un tiret, pas zéro ni du vide.** « 0 ligne » sur un index serait un mensonge ; du vide
 * ressemblerait à une donnée manquante. Le cas se présente pour les index et les fonctions
 * (`09e`), et pour une table jamais analysée — `reltuples = -1`, que `06c` traduit en `0` côté
 * Rust mais que l'écran doit distinguer d'un vrai zéro.
 */
export const ABSENT = '—'
