import { expect, type Page, test } from '@playwright/test'

// Ce que Vitest ne peut pas voir : la hauteur réelle des lignes, la course de la barre de
// défilement, la persistance de l'en-tête, et le rattrapage du popover au bord droit. `10a` les
// nomme — jsdom ne calcule aucune mise en page.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=virtual-grid]')
  await page.evaluate(() => document.fonts.ready)
})

const grille_ = (page: Page) => page.locator('[data-testid=virtual-grid] [role=grid]')
const viewport = (page: Page) =>
  page.locator('[data-testid=virtual-grid] [role=grid] > div').first()

test('les lignes font 26 px et l’en-tête aussi', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const racine = document.querySelector('[data-testid=virtual-grid]')
    const entete = racine?.querySelector('[role=columnheader]')
    const ligne = racine?.querySelector('[role=row][aria-rowindex="3"]')
    if (!entete || !ligne) return null
    return {
      // La hauteur **calculée**, pas le rectangle : celui-ci inclut le filet et masquerait un
      // écart d'un pixel derrière un arrondi.
      entete: getComputedStyle(entete).height,
      ligne: Math.round(ligne.getBoundingClientRect().height),
    }
  })
  expect(mesures?.entete).toBe('26px')
  expect(mesures?.ligne).toBe(26)
})

test('la barre de défilement a la course des cent mille lignes', async ({ page }) => {
  const hauteurs = await page.evaluate(() => {
    // La zone défilante, et la toile qui porte la hauteur totale. Depuis que l'en-tête vit dans
    // la zone défilante, la toile est son **second** `rowgroup`.
    const conteneur = document.querySelector('[data-testid=virtual-grid] [class*=viewport]')
    const toile = conteneur?.querySelectorAll('[role=rowgroup]')[1]
    if (!conteneur || !toile) return null
    return { visible: conteneur.clientHeight, total: toile.getBoundingClientRect().height }
  })
  // 100 000 × 26 px : c'est la toile qui porte la hauteur totale, pas les lignes montées.
  expect(hauteurs?.total).toBe(2_600_000)
  expect(hauteurs?.visible).toBe(208)
})

test('l’en-tête reste en place quand la grille défile', async ({ page }) => {
  const avant = await grille_(page).locator('[role=columnheader]').first().boundingBox()
  await viewport(page).evaluate((element) => element.scrollTo({ top: 12_000 }))
  const apres = await grille_(page).locator('[role=columnheader]').first().boundingBox()

  expect(apres?.y).toBe(avant?.y)
  // Et le défilement a bien changé les lignes montées — sans quoi le test ci-dessus passerait
  // sur une grille immobile.
  const premiere = await grille_(page).locator('[role=row]').nth(2).getAttribute('aria-rowindex')
  expect(Number(premiere)).toBeGreaterThan(400)
})

test('le fond d’une ligne sélectionnée court sur toutes les colonnes, même hors écran', async ({
  page,
}) => {
  const grille = grille_(page)
  await grille.getByRole('row').nth(2).click()

  const mesures = await page.evaluate(() => {
    const g = document.querySelector('[data-testid=virtual-grid] [role=grid]')
    const ligne = g?.querySelector('[role=row][aria-selected="true"]')
    const toile = ligne?.parentElement
    const entete = g?.querySelector('[role=rowgroup]')
    if (!ligne || !toile || !entete) return null
    return {
      ligne: Math.round(ligne.getBoundingClientRect().width),
      toile: Math.round(toile.getBoundingClientRect().width),
      entete: Math.round(entete.getBoundingClientRect().width),
      visible: Math.round((toile.parentElement as HTMLElement).clientWidth),
    }
  })

  // **Le défaut du 10 août 2026** : la ligne prenait la largeur de la *fenêtre*, donc son fond
  // s'arrêtait au bord droit et disparaissait dès qu'on défilait horizontalement. Elle doit
  // couvrir la largeur du **contenu**.
  expect(mesures?.toile).toBeGreaterThan(mesures?.visible ?? 0)
  expect(mesures?.ligne).toBe(mesures?.toile)
  // L'en-tête aussi, sans quoi il cesse de désigner les colonnes sous lui.
  expect(mesures?.entete).toBe(mesures?.toile)
})

test('l’en-tête suit le défilement horizontal', async ({ page }) => {
  const premierEntete = grille_(page).getByRole('columnheader').first()
  const avant = await premierEntete.boundingBox()

  // 100 px : le défilement maximal est la largeur du contenu moins celle de la fenêtre, et
  // demander plus plafonnerait — le test mesurerait alors le plafond, pas le suivi.
  await viewport(page).evaluate((element) => element.scrollTo({ left: 100 }))

  const apres = await premierEntete.boundingBox()
  // Hors de la zone défilante, l'en-tête restait immobile et les colonnes se désalignaient.
  expect(Math.round((avant?.x ?? 0) - (apres?.x ?? 0))).toBe(100)
})

test('le popover reste visible même ancré au bord droit', async ({ page }) => {
  const zone = page.locator('[data-testid=popover-bord]')

  // Le déclencheur de gauche : le panneau s'aligne sur son bord gauche, sans déborder.
  await zone.getByRole('button', { name: 'status' }).click()
  const gauche = await zone.locator('[role=dialog]').boundingBox()
  const fenetre = await page.evaluate(() => window.innerWidth)
  expect(gauche?.x).toBeGreaterThanOrEqual(0)
  expect((gauche?.x ?? 0) + (gauche?.width ?? 0)).toBeLessThanOrEqual(fenetre)
  await page.keyboard.press('Escape')

  // Celui de droite est à une trentaine de pixels du bord : aligné à gauche, le panneau
  // sortirait de la fenêtre. C'est là que la bascule d'alignement se voit.
  //
  // `toPass` plutôt qu'une mesure unique : la position est une propriété de la mise en page
  // **stabilisée**, et une assertion sur un instant est intermittente par construction — celle-ci
  // l'a été avant d'être écrite ainsi.
  await zone.getByRole('button', { name: 'total_cents' }).click()
  await expect(async () => {
    const droite = await zone.locator('[role=dialog]').boundingBox()
    expect(droite?.x).toBeGreaterThanOrEqual(0)
    expect((droite?.x ?? 0) + (droite?.width ?? 0)).toBeLessThanOrEqual(fenetre)
  }).toPass({ timeout: 2000 })
})
