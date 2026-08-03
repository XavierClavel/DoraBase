// Fonctions pures de transcription des tokens de design : aplatissement de l'arbre
// puis émission des sorties CSS (`:root`) et TypeScript (`TokenName` + `tokens`).
// Aucune lecture ni écriture de fichier ici — l'entrée/sortie viendra avec le
// script de build (tâche 3), qui appellera ces fonctions sur `src/design/tokens.json`.

const GENERATED_HEADER = '/* Généré par pnpm tokens:build — ne pas éditer */'

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

/** Émet un bloc `:root { --token: valeur; }` trié par nom de token. */
export function emitCss(flatTokens) {
  const lines = Object.keys(flatTokens)
    .sort()
    .map((name) => `  --${name}: ${flatTokens[name]};`)
  return `${GENERATED_HEADER}\n:root {\n${lines.join('\n')}\n}\n`
}

/** Émet un module TypeScript exposant `TokenName` et `tokens` (références `var()`). */
export function emitTs(flatTokens) {
  const names = Object.keys(flatTokens).sort()
  const type = `export type TokenName =\n${names.map((name) => `  | '${name}'`).join('\n')}\n`
  const entries = names.map((name) => `  '${name}': 'var(--${name})',`).join('\n')
  const record = `export const tokens: Record<TokenName, string> = {\n${entries}\n}\n`
  return `${GENERATED_HEADER}\n${type}\n${record}`
}
