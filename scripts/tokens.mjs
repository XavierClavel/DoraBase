// Fonctions pures de transcription des tokens de design : aplatissement de l'arbre
// puis émission des sorties CSS (`:root`) et TypeScript (`TokenName` + `tokens`).
// Aucune lecture ni écriture de fichier ici — l'entrée/sortie viendra avec le
// script de build (tâche 3), qui appellera ces fonctions sur `src/design/tokens.json`.

// La seconde ligne désarme le formateur de Biome sur les deux sorties : il
// abaisserait la casse des hexadécimaux et retirerait les guillemets des clés,
// alors que la mise en forme est décidée ici et vérifiée par `pnpm tokens:check`.
const GENERATED_HEADER = [
  '/* Généré par pnpm tokens:build — ne pas éditer */',
  '/* biome-ignore-all format: fichier généré, mise en forme produite par le générateur */',
].join('\n')

/**
 * Aplatit un arbre de tokens imbriqué en un objet à un seul niveau.
 * Les clés sont jointes par `-` ; la clé `base` disparaît (`ink.base` -> `ink`).
 */
export function flatten(tree, prefix = []) {
  const result = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = key === 'base' ? prefix : [...prefix, key]
    if (value !== null && typeof value === 'object') {
      Object.assign(result, flatten(value, path))
    } else {
      result[path.join('-')] = value
    }
  }
  return result
}

/** Le nom de la clé de premier niveau qui porte les valeurs sombres. */
export const CLE_NUIT = 'nuit'

/**
 * Sépare l'arbre en deux : les valeurs claires, et les redéfinitions de « Nuit ».
 *
 * **Une seule source, `tokens.json`** — la prohibition du projet porte sur le fichier, pas sur le
 * nombre de thèmes. Un second fichier aurait mis des couleurs littérales hors de celui que
 * `tokens:check` garde.
 */
export function separerThemes(tree) {
  const { [CLE_NUIT]: nuit, ...clair } = tree
  return { clair, nuit: nuit ?? {} }
}

/**
 * Émet les blocs `:root` du thème clair, puis les redéfinitions de « Nuit ».
 *
 * **Trois blocs, et il en faut trois** : le clair sur `:root` nu, le sombre sur
 * `[data-theme="nuit"]` — le thème choisi explicitement —, et le même sombre sous
 * `prefers-color-scheme: dark` pour `:root:not([data-theme="cahier"])`, c'est-à-dire « Système ».
 * `themeApplique` ne pose **aucun** attribut pour « Système » (voir `preferences.ts`) : c'est cette
 * absence que la requête média rattrape, et le `:not` est ce qui empêche « Cahier » choisi
 * explicitement de virer au sombre sur un macOS en sombre.
 *
 * Un jeton sombre dont le nom n'existe pas en clair **arrête le générateur** : il ne casserait
 * rien de visible — ni TypeScript, ni Vitest, ni l'œil — et c'est exactement ce qui en fait un
 * piège (voir la prohibition « un `var()` vers un jeton inexistant »).
 */
export function emitCss(flatTokens, flatNuit = {}) {
  const inconnus = Object.keys(flatNuit).filter((name) => !(name in flatTokens))
  if (inconnus.length > 0) {
    throw new Error(`jetons de nuit sans équivalent clair : ${inconnus.sort().join(', ')}`)
  }
  const bloc = (tokens, indentation) =>
    Object.keys(tokens)
      .sort()
      .map((name) => `${indentation}--${name}: ${tokens[name]};`)
      .join('\n')

  let css = `${GENERATED_HEADER}\n:root {\n${bloc(flatTokens, '  ')}\n}\n`
  if (Object.keys(flatNuit).length === 0) return css
  css += `\n:root[data-theme="nuit"] {\n${bloc(flatNuit, '  ')}\n}\n`
  css += `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="cahier"]) {\n${bloc(flatNuit, '    ')}\n  }\n}\n`
  return css
}

/** Émet un module TypeScript exposant `TokenName` et `tokens` (références `var()`). */
export function emitTs(flatTokens) {
  const names = Object.keys(flatTokens).sort()
  const type = `export type TokenName =\n${names.map((name) => `  | '${name}'`).join('\n')}\n`
  const entries = names.map((name) => `  '${name}': 'var(--${name})',`).join('\n')
  const record = `export const tokens: Record<TokenName, string> = {\n${entries}\n}\n`
  return `${GENERATED_HEADER}\n${type}\n${record}`
}
