import { expect, test } from '@playwright/test'

// Le point d'entrée et la géométrie du menu : de la mise en page, donc hors de portée de Vitest.
// `08g` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  await page.evaluate(() => document.fonts.ready)
})

test('la pastille projet ouvre le menu des bases', async ({ page }) => {
  // Son chevron l'annonçait depuis `09c`, et son `onOpenProjects` n'était appelé par personne.
  await page
    .getByRole('button', { name: /Atelier Nord/ })
    .first()
    .click()

  const menu = page.getByRole('dialog', { name: 'Projets et bases' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('analytics')).toBeVisible()
  // Les environnements déclarés distinguent deux bases de même nom, et c'est ce qu'on cherche en
  // corrigeant un port.
  await expect(menu.getByText('prod')).toBeVisible()
})

test('un projet sans base le dit plutôt que de paraître vide', async ({ page }) => {
  await page
    .getByRole('button', { name: /Atelier Nord/ })
    .first()
    .click()
  const menu = page.getByRole('dialog', { name: 'Projets et bases' })
  // « Outils internes » n'a aucune base : un projet vide est un état normal depuis `08f`.
  await expect(menu.getByText('Aucune base déclarée.')).toBeVisible()
})

test('cliquer une base désigne celle-là, et referme le menu', async ({ page }) => {
  await page
    .getByRole('button', { name: /Atelier Nord/ })
    .first()
    .click()
  await page
    .getByRole('dialog', { name: 'Projets et bases' })
    .getByRole('button', { name: /analytics/ })
    .click()

  // La démo n'ouvre pas `A2` : elle enregistre la cible, ce qui prouve que le menu désigne la
  // bonne base et referme derrière lui.
  await expect(page).toHaveTitle('édition Atelier Nord/analytics')
  await expect(page.getByRole('dialog', { name: 'Projets et bases' })).toBeHidden()
})

test('le menu ne sort pas de la fenêtre', async ({ page }) => {
  await page
    .getByRole('button', { name: /Atelier Nord/ })
    .first()
    .click()
  const boite = await page.getByRole('dialog', { name: 'Projets et bases' }).boundingBox()
  const largeur = await page.evaluate(() => window.innerWidth)

  expect(boite?.x).toBeGreaterThanOrEqual(0)
  expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur)
})
