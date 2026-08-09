import { expect, test } from '@playwright/test'

// Les teintes de colonne, la hauteur du champ de filtre et le popover ancré sont des propriétés
// de mise en page : hors de portée de Vitest. `10d` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('le champ de filtre fait 20 px, comme le mockup', async ({ page }) => {
  const hauteur = await page.evaluate(() => {
    const champ = document.querySelector('[role=row][aria-rowindex="2"] input')?.parentElement
    return champ ? Math.round(champ.getBoundingClientRect().height) : null
  })
  expect(hauteur).toBe(20)
})

test('une colonne filtrée est teintée, une colonne triée l’est moins', async ({ page }) => {
  const neutre = await fondDeColonne(page, 'currency')

  await page.getByLabel('Filtrer status').fill('paid')
  await page.getByLabel('Filtrer status').press('Enter')
  await page.getByRole('button', { name: 'Trier par created_at' }).click()

  const filtree = await fondDeColonne(page, 'status')
  const triee = await fondDeColonne(page, 'created_at')

  expect(filtree).not.toBe(neutre)
  expect(triee).not.toBe(neutre)
  // 10 % contre 6 % : les deux teintes se distinguent, sans quoi « filtré » et « trié » se
  // liraient pareil.
  expect(filtree).not.toBe(triee)
})

test('le popover d’opérateur s’ouvre sous son champ et se ferme sur Échap', async ({ page }) => {
  await page.getByRole('button', { name: 'Opérateur de status' }).click()
  const panneau = page.getByRole('dialog', { name: 'Opérateur · status' })
  await expect(panneau).toBeVisible()

  const boite = await panneau.boundingBox()
  const declencheur = await page.getByRole('button', { name: 'Opérateur de status' }).boundingBox()
  expect(boite?.y).toBeGreaterThan(declencheur?.y ?? 0)

  await page.keyboard.press('Escape')
  await expect(panneau).toBeHidden()
})

test('la sidebar annote la colonne filtrée', async ({ page }) => {
  await page.getByLabel('Filtrer status').fill('paid')
  await page.getByLabel('Filtrer status').press('Enter')

  await expect(page.locator('section').getByText('filtré')).toBeVisible()
})

/** La couleur de fond de l'en-tête d'une colonne, telle que le navigateur la calcule. */
async function fondDeColonne(page: import('@playwright/test').Page, colonne: string) {
  return page
    .getByRole('button', { name: `Trier par ${colonne}` })
    .evaluate((element) => getComputedStyle(element.parentElement as Element).backgroundColor)
}
