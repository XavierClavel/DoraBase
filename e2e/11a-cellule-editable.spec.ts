import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// La boîte de saisie déborde de sa ligne et ne doit être découpée par personne : de la mise en page
// pure, donc invisible à Vitest. `11a` la nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
  // **L'édition s'ouvre par `⌘E`**, depuis que `11b` a livré la bascule : la démo ne la force plus
  // par un drapeau, et un décor déjà en édition n'aurait jamais montré que le raccourci marche.
  await page.keyboard.press('Meta+e')
  await page.getByRole('button', { name: 'Modifier status' }).nth(2).click()
  await page.waitForSelector('[data-saisie]')
})

test('la boîte reste dans sa colonne et déborde de sa ligne', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const boite = document.querySelector('[data-saisie]')
    const cellule = boite?.parentElement
    const ligne = cellule?.closest('[role=row]')
    if (!boite || !cellule || !ligne) return null
    const b = boite.getBoundingClientRect()
    const c = cellule.getBoundingClientRect()
    const l = ligne.getBoundingClientRect()
    return {
      // **Deux défauts trouvés à la capture.** La boîte se calait sur la ligne — `.td` n'était pas
      // un référentiel positionné — et s'étendait sur toute la largeur.
      largeurBoite: Math.round(b.width),
      largeurCellule: Math.round(c.width),
      // Puis, `.td` portant `overflow: hidden` pour l'ellipse, elle disparaissait entièrement.
      hauteurBoite: Math.round(b.height),
      hauteurLigne: Math.round(l.height),
      // Le débordement se mesure **symétriquement** : la boîte est centrée sur sa cellule, donc
      // c'est l'écart des centres qui doit être nul, et l'excès de hauteur qui donne les 3 px.
      ecartDesCentres: Math.abs(b.top + b.height / 2 - (l.top + l.height / 2)),
    }
  })

  // La boîte a la largeur de sa cellule, plus 1 px de chaque côté — la valeur du mockup.
  expect(mesures?.largeurBoite).toBe((mesures?.largeurCellule ?? 0) + 2)
  // Et elle déborde de 3 px en haut et en bas : 26 + 6 = 32.
  expect(mesures?.hauteurBoite).toBe((mesures?.hauteurLigne ?? 0) + 6)
  // Un demi-pixel de tolérance : les deux centres tombent sur des positions fractionnaires, et
  // `Math.round` d'une valeur négative proche de zéro rend `-0`, que `toBe(0)` refuse.
  expect(mesures?.ecartDesCentres).toBeLessThanOrEqual(0.5)
})

test('la boîte n’est découpée par personne', async ({ page }) => {
  // `overflow: hidden` sur la cellule la faisait disparaître : le test regarde ce qui se trouve
  // **sous le pixel** du haut de la boîte, hors de sa ligne.
  const visible = await page.evaluate(() => {
    const boite = document.querySelector('[data-saisie]') as HTMLElement
    const b = boite.getBoundingClientRect()
    const dessus = document.elementFromPoint(
      Math.round(b.left + b.width / 2),
      Math.round(b.top + 1),
    )
    return boite.contains(dessus)
  })
  expect(visible).toBe(true)
})

test('le texte de la boîte s’aligne comme sa colonne', async ({ page }) => {
  const alignements = await page.evaluate(() => {
    const champ = document.querySelector('[data-saisie] input') as HTMLElement
    const cellule = champ.closest('[role=gridcell]') as HTMLElement
    return {
      champ: getComputedStyle(champ).textAlign,
      cellule: getComputedStyle(cellule).textAlign,
    }
  })
  // `status` est une colonne de texte : fixer l'alignement à droite y laissait la valeur à
  // l'opposé du reste de la colonne, et le caret décoratif orphelin.
  expect(alignements.champ).toBe(alignements.cellule)
})
