// Rend `src-tauri/dmg/fond-dmg.html` en l'image de fond de la fenêtre du volume `.dmg`.
//
// Trois fichiers en sortie, un seul consommé par le bundle :
//
//   fond-dmg.png     660 × 440   — l'export 1×, lisible dans un diff d'aperçu
//   fond-dmg@2x.png  1320 × 880  — l'export Retina
//   fond-dmg.tiff                — les deux fondus, et **c'est celui-là** que
//                                  `tauri.conf.json` référence
//
// Pourquoi un TIFF : macOS ne lit pas la convention `@2x` depuis un `.DS_Store`. Le Finder
// affiche l'image à sa taille en points, donc un PNG 1320 × 880 déborderait d'un facteur
// deux et un PNG 660 × 440 serait flou sur Retina. Un TIFF multi-résolution
// (`tiffutil -cathidpicheck`) porte les deux représentations et laisse le système choisir.
//
// Rien de tout cela ne tourne en CI : les trois fichiers sont committés, et
// `scripts/verifier-fond-dmg.sh` vérifie qu'ils s'accordent. Régénérer demande un
// Chromium ; le workflow de publication n'a pas à en dépendre pour poser un tag.

import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
const dossier = join(racine, 'src-tauri', 'dmg')
const source = join(dossier, 'fond-dmg.html')

// La zone de contenu de la fenêtre du volume, en points. Ces deux nombres sont aussi ceux
// de `bundle.macOS.dmg.windowSize` — la barre de titre, elle, est ajoutée par le bundler.
const LARGEUR = 660
const HAUTEUR = 440

async function capturer(navigateur, echelle, sortie) {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    deviceScaleFactor: echelle,
  })
  const page = await contexte.newPage()
  await page.goto(`file://${source}`)
  // Les trois polices sont en `font-display: block` : sans cette attente, un rendu rapide
  // capture des blancs à la place des textes.
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#fond-dmg').screenshot({ path: sortie })
  await contexte.close()
}

await mkdir(dossier, { recursive: true })

const navigateur = await chromium.launch()
try {
  await capturer(navigateur, 1, join(dossier, 'fond-dmg.png'))
  await capturer(navigateur, 2, join(dossier, 'fond-dmg@2x.png'))
} finally {
  await navigateur.close()
}

execFileSync(
  'tiffutil',
  [
    '-cathidpicheck',
    join(dossier, 'fond-dmg.png'),
    join(dossier, 'fond-dmg@2x.png'),
    '-out',
    join(dossier, 'fond-dmg.tiff'),
  ],
  { stdio: 'inherit' },
)

console.log(`fond-dmg.png, fond-dmg@2x.png et fond-dmg.tiff écrits (${LARGEUR} × ${HAUTEUR} pt)`)
