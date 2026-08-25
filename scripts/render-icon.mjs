// Rasterise src-tauri/icons/icon-dorabase.svg en PNG 1024×1024 pour `pnpm tauri icon`.
//
// On utilise Chromium (déjà installé via Playwright pour les tests e2e) plutôt
// qu'une dépendance système (librsvg, imagemagick...) : la régénération de
// l'icône reste ainsi reproductible sans installation supplémentaire.
//
// Le PNG produit n'est pas versionné : il est régénérable à volonté par ce
// script, donc l'ajouter à l'historique git serait du poids binaire inutile.
// Le défaut de sortie pointe donc vers node_modules/.tmp/ (déjà ignoré par
// git, cf. node_modules/ dans .gitignore) plutôt que dans le dépôt, pour
// qu'un lancement sans argument ne puisse pas y déposer de fichier.
//
// Ensuite, `pnpm tauri icon <png>` régénère le jeu d'icônes dans
// src-tauri/icons/. Attention : la CLI Tauri 2 (testée en 2.11.4) n'expose
// aucune option pour limiter les plateformes ciblées — elle produit
// systématiquement macOS/Windows *et* les jeux iOS/Android (android/, ios/),
// même si aucune cible mobile n'est configurée dans tauri.conf.json. DoraBase
// est desktop uniquement (macOS, Windows/Linux gardés ouverts) : après chaque
// régénération, supprimer manuellement src-tauri/icons/android/ et
// src-tauri/icons/ios/ avant de commiter.
//
// Usage : node scripts/render-icon.mjs [chemin-svg] [chemin-png-sortie]

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const SIZE = 1024
const svgPath = resolve(projectRoot, process.argv[2] ?? 'src-tauri/icons/icon-dorabase.svg')
const outPath = resolve(projectRoot, process.argv[3] ?? 'node_modules/.tmp/icon-dorabase-1024.png')

await mkdir(dirname(outPath), { recursive: true })

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
