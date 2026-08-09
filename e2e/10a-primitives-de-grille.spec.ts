import { expect, type Page, test } from '@playwright/test'

// Ce que Vitest ne peut pas voir : la hauteur réelle des lignes, la course de la barre de
// défilement, la persistance de l'en-tête, et le rattrapage du popover au bord droit. `10a` les
// nomme — jsdom ne calcule aucune mise en page.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=virtual-grid]')
  await page.evaluate(() => document.fonts.ready)
})

const grille = (page: Page) => page.locator('[data-testid=virtual-grid] [role=grid]')
const viewport = (page: Page) => page.locator('[data-testid=virtual-grid] [role=grid] > div').nth(1)

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
    const conteneur = document.querySelector('[data-testid=virtual-grid] [role=rowgroup] + div')
    const toile = conteneur?.querySelector('[role=rowgroup]')
    if (!conteneur || !toile) return null
    return { visible: conteneur.clientHeight, total: toile.getBoundingClientRect().height }
  })
  // 100 000 × 26 px : c'est la toile qui porte la hauteur totale, pas les lignes montées.
  expect(hauteurs?.total).toBe(2_600_000)
  expect(hauteurs?.visible).toBe(208)
})

test('l’en-tête reste en place quand la grille défile', async ({ page }) => {
  const avant = await grille(page).locator('[role=columnheader]').first().boundingBox()
  await viewport(page).evaluate((element) => element.scrollTo({ top: 12_000 }))
  const apres = await grille(page).locator('[role=columnheader]').first().boundingBox()

  expect(apres?.y).toBe(avant?.y)
  // Et le défilement a bien changé les lignes montées — sans quoi le test ci-dessus passerait
  // sur une grille immobile.
  const premiere = await grille(page).locator('[role=row]').nth(2).getAttribute('aria-rowindex')
  expect(Number(premiere)).toBeGreaterThan(400)
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
  await zone.getByRole('button', { name: 'total_cents' }).click()
  const droite = await zone.locator('[role=dialog]').boundingBox()
  expect(droite?.x).toBeGreaterThanOrEqual(0)
  expect((droite?.x ?? 0) + (droite?.width ?? 0)).toBeLessThanOrEqual(fenetre)
})
