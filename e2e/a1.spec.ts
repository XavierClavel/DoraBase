import { expect, test } from '@playwright/test'

test('A1 est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a1-accueil.png', { fullPage: true })
})

// La modale de `A2` par-dessus `A1`, capturée comme référence de la même façon. Elle inclut
// la barre de titre ternie derrière, qui fait partie de l'écran.
//
// **Les trois feux ne sont pas dans la capture** : ils sont dessinés par macOS par-dessus la
// fenêtre, hors du DOM et hors de portée de Playwright comme du CSS. Le mockup les grise ;
// nous ne pouvons pas. Voir `specs/README.md` § « À trancher ».
test('A2 est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.waitForSelector('[role=dialog]')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a2-nouvelle-connexion.png', { fullPage: true })
})

// Le panneau proxy / tunnel déplié et renseigné, comme le mockup le montre. Capturé
// séparément parce que `A2` s'ouvre panneau replié : les deux états méritent une référence.
test('A2 avec le panneau tunnel est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Proxy \/ tunnel/ }).click()
  await page.getByLabel('Hôte du bastion').fill('bastion.exemple.net')
  await page.getByLabel('Clé privée').fill('~/.ssh/id_ed25519')
  // Le focus reste sur le dernier champ rempli, et son anneau entrerait dans la référence :
  // celle-ci dépendrait alors de l'ordre de remplissage. Un `blur` la rend déterministe.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a2-tunnel.png', { fullPage: true })
})
