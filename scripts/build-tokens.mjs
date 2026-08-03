// Entrées/sorties du générateur de tokens : lit `src/design/tokens.json`, la source
// unique des valeurs de design, et écrit les deux sorties générées `tokens.css` et
// `tokens.ts`. Toute la logique vit dans `tokens.mjs` — ici, rien que du fichier.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitCss, emitTs, flatten } from './tokens.mjs'

const designDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'design')

const tree = JSON.parse(await readFile(join(designDir, 'tokens.json'), 'utf8'))
const flat = flatten(tree)

await writeFile(join(designDir, 'tokens.css'), emitCss(flat))
await writeFile(join(designDir, 'tokens.ts'), emitTs(flat))

console.log(`${Object.keys(flat).length} tokens écrits dans tokens.css et tokens.ts`)
