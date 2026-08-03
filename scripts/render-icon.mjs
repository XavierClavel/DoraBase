// Rasterise design/handoff/icon-dorabase.svg en PNG 1024×1024 pour `pnpm tauri icon`.
//
// On utilise Chromium (déjà installé via Playwright pour les tests e2e) plutôt
// qu'une dépendance système (librsvg, imagemagick...) : la régénération de
// l'icône reste ainsi reproductible sans installation supplémentaire.
//
// Usage : node scripts/render-icon.mjs [chemin-svg] [chemin-png-sortie]

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const SIZE = 1024
const svgPath = resolve(projectRoot, process.argv[2] ?? 'design/handoff/icon-dorabase.svg')
const outPath = resolve(projectRoot, process.argv[3] ?? 'design/handoff/icon-dorabase-1024.png')

const svg = await readFile(svgPath, 'utf8')

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: ${SIZE}px; height: ${SIZE}px; }
    </style>
  </head>
  <body>${svg}</body>
</html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  })
  await page.setContent(html, { waitUntil: 'networkidle' })
  const svgHandle = await page.$('svg')
  await svgHandle.screenshot({ path: outPath, omitBackground: true })
  console.log(`Icône rendue : ${outPath}`)
} finally {
  await browser.close()
}
