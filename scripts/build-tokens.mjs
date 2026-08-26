// Entrées/sorties du générateur de tokens : lit `src/design/tokens.json`, la source
// unique des valeurs de design, et écrit les deux sorties générées `tokens.css` et
// `tokens.ts`. Toute la logique vit dans `tokens.mjs` — ici, rien que du fichier.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitCss, emitTs, flatten, separerThemes } from './tokens.mjs'

const designDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'design')

const tree = JSON.parse(await readFile(join(designDir, 'tokens.json'), 'utf8'))
const { clair, nuit } = separerThemes(tree)
const flat = flatten(clair)
const flatNuit = flatten(nuit)

// `tokens.ts` ne connaît que les **noms**, et ils sont les mêmes dans les deux thèmes : un jeton
// sombre sans équivalent clair est refusé par `emitCss`.
await writeFile(join(designDir, 'tokens.css'), emitCss(flat, flatNuit))
await writeFile(join(designDir, 'tokens.ts'), emitTs(flat))

console.log(
  `${Object.keys(flat).length} tokens écrits dans tokens.css et tokens.ts, ` +
    `dont ${Object.keys(flatNuit).length} redéfinis par « Nuit »`,
)
