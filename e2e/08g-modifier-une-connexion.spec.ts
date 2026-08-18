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
  // **`toBeVisible()` ne prouve pas qu'on le voit.** Il vérifie une boîte non vide et l'absence de
  // `visibility: hidden` — il **ignore le découpage par un ancêtre `overflow: hidden`**. La barre de
  // titre en portait un, le panneau était coupé net, et ce test était vert : cliquer la pastille ne
  // faisait rien de visible. Même piège que la bande d'onglets de `10b`. Seul `elementFromPoint`
  // répond à « qu'y a-t-il réellement à cet endroit de l'écran ? ».
  const auPoint = await page.evaluate(() => {
    const panneau = document.querySelector('[role=dialog][aria-label="Projets et bases"]')
    const boite = panneau?.getBoundingClientRect()
    if (!panneau || !boite || boite.height === 0) return null
    const dessus = document.elementFromPoint(boite.left + boite.width / 2, boite.top + 4)
    return { contenu: panneau.contains(dessus), bas: boite.bottom, hauteurBarre: 44 }
  })
  expect(auPoint?.contenu).toBe(true)
  // Et il déborde bien de la barre de titre : c'est ce débordement qu'un ancêtre découpait.
  expect(auPoint?.bas).toBeGreaterThan(auPoint?.hauteurBarre ?? 0)
  await expect(menu.getByText('analytics')).toBeVisible()
  // Les environnements déclarés distinguent deux bases de même nom, et c'est ce qu'on cherche en
  // corrigeant un port.
  //
  // **Deux bases dans le décor depuis `13a`** — une relationnelle, une documentaire — donc deux
  // pastilles « prod ». Le bouton entier est visé plutôt que le mot seul : il porte le nom de la
  // base, ce qui rend l'assertion plus précise qu'avant, pas moins.
  await expect(menu.getByRole('button', { name: 'analytics prod' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'evenements prod' })).toBeVisible()
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

  // **La modale s'ouvre, sur cette base.** Cette assertion portait sur `document.title`, que la
  // démo inscrivait faute de monter `A2` : un proxy du chemin, qui n'aurait rien dit d'une modale
  // cassée. `08h` a monté `A2` dans la démo, donc le vrai fait est vérifiable — et le proxy n'a plus
  // de raison d'être.
  const modale = page.getByRole('dialog', { name: 'Modifier analytics' })
  await expect(modale).toBeVisible()
  await expect(modale.getByLabel('Nom de la base')).toHaveValue('analytics')
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
