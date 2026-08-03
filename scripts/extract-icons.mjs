// Extraction du sprite d'icônes depuis le mockup HTML : `design/handoff/DoraBase.dc.html`
// contient déjà 48 symboles SVG écrits à la spec du handoff (viewBox, épaisseurs de
// trait, extrémités arrondies...). Redessiner ces icônes serait une perte pure — on les
// extrait donc telles quelles, sans toucher à leurs tracés.
//
// `extractSymbols` reste pure : une chaîne HTML en entrée, un tableau en sortie. Les
// entrées-sorties (lecture du mockup, écriture du sprite et des noms) vivent plus bas,
// dans la partie script.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SYMBOL_RE = /<symbol\s+id="([^"]+)"\s+viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g

/**
 * Extrait du HTML du mockup les symboles `i-*` (les icônes) et `logo` (le repère de
 * marque) ; ignore tout autre symbole. Retourne un tableau de `{ id, viewBox, inner }`
 * dans l'ordre d'apparition, contenu interne conservé sans modification.
 */
export function extractSymbols(html) {
  const symbols = []
  for (const match of html.matchAll(SYMBOL_RE)) {
    const [, id, viewBox, inner] = match
    if (id === 'logo' || id.startsWith('i-')) {
      symbols.push({ id, viewBox, inner })
    }
  }
  return symbols
}

/** Émet le fichier sprite : les symboles enveloppés dans un `<svg><defs>`. */
export function emitSprite(symbols) {
  const body = symbols
    .map((s) => `  <symbol id="${s.id}" viewBox="${s.viewBox}">${s.inner}</symbol>`)
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">\n<defs>\n${body}\n</defs>\n</svg>\n`
}

// La suppression de format désarme Biome sur cette sortie générée : voir tokens.mjs pour
// le même besoin sur tokens.css/tokens.ts.
const GENERATED_HEADER = [
  '/* Généré par pnpm icons:build — ne pas éditer */',
  '/* biome-ignore-all format: fichier généré, mise en forme produite par le générateur */',
].join('\n')

/**
 * Émet le module TypeScript exposant `IconName`, l'union des noms d'icônes (préfixe
 * `i-` retiré). Le logo n'en fait pas partie : il a un `viewBox` et un usage différents
 * (voir Icon.tsx) et se référence directement via `<use href="#logo">`.
 */
export function emitNames(symbols) {
  const names = symbols
    .filter((s) => s.id.startsWith('i-'))
    .map((s) => s.id.slice(2))
    .sort()
  const type = `export type IconName =\n${names.map((name) => `  | '${name}'`).join('\n')}\n`
  return `${GENERATED_HEADER}\n${type}`
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const mockupPath = join(projectRoot, 'design', 'handoff', 'DoraBase.dc.html')
  const iconsDir = join(projectRoot, 'src', 'design', 'icons')

  const html = await readFile(mockupPath, 'utf8')
  const symbols = extractSymbols(html)

  await mkdir(iconsDir, { recursive: true })
  await writeFile(join(iconsDir, 'sprite.svg'), emitSprite(symbols))
  await writeFile(join(iconsDir, 'names.ts'), emitNames(symbols))

  console.log(`${symbols.length} symboles écrits dans sprite.svg et names.ts`)
}
