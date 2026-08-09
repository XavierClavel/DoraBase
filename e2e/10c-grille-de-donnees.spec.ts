import { expect, test } from '@playwright/test'

// Ce que jsdom ne peut pas voir : la hauteur réelle des lignes, la gouttière, et surtout le
// fait que cinq cents lignes ne montent qu'une poignée de nœuds. `10c` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('cinq cents lignes, une poignée de nœuds montés', async ({ page }) => {
  const grille = page.getByRole('grid', { name: 'Lignes de public.orders' })

  // Le total est annoncé — 500 lignes plus les **deux** lignes d'en-tête, celle des noms et
  // celle des filtres (`10d`) — alors que le DOM n'en porte qu'une dizaine. Sans
  // `aria-rowcount`, la virtualisation mentirait à l'arbre d'accessibilité.
  await expect(grille).toHaveAttribute('aria-rowcount', '502')
  const montees = await grille.getByRole('row').count()
  expect(montees).toBeLessThan(40)
  expect(montees).toBeGreaterThan(3)
})

test('la barre d’état porte les chiffres de la fenêtre', async ({ page }) => {
  const statut = page.getByRole('status')
  await expect(statut).toContainText('500 lignes')
  await expect(statut).toContainText('41 ms')
  await expect(statut).toContainText('limit 500')
  await expect(statut).toContainText('lecture seule')
  // L'édition est `11` : un raccourci affiché qui ne répond pas est pire qu'un raccourci absent.
  await expect(statut).not.toContainText('⌘E')
})

test('les lignes font 26 px et la gouttière 30', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const grille = document.querySelector('[role=grid]')
    // La première ligne de données : deux en-têtes, donc l'indice 3.
    const ligne = grille?.querySelector('[role=row][aria-rowindex="3"]')
    const gouttiere = ligne?.querySelector('[role=gridcell]')
    if (!ligne || !gouttiere) return null
    return {
      ligne: Math.round(ligne.getBoundingClientRect().height),
      gouttiere: Math.round(gouttiere.getBoundingClientRect().width),
    }
  })
  expect(mesures?.ligne).toBe(26)
  expect(mesures?.gouttiere).toBe(30)
})

test('NULL est écrit et atténué, jamais du vide', async ({ page }) => {
  const nul = page.getByRole('grid').getByText('NULL').first()
  await expect(nul).toBeVisible()

  const couleur = await nul.evaluate((element) => getComputedStyle(element).color)
  const voisine = await page
    .getByRole('grid')
    .getByText('EUR')
    .first()
    .evaluate((element) => getComputedStyle(element).color)
  // Atténué **par rapport à une valeur ordinaire** : c'est la distinction qui compte, pas la
  // valeur exacte du jeton.
  expect(couleur).not.toBe(voisine)
})

test('sélectionner une ligne la marque, et le clavier déplace la sélection', async ({ page }) => {
  const grille = page.getByRole('grid')
  await grille.getByRole('row').nth(2).click()
  await expect(grille.getByRole('row').nth(2)).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowDown')
  await expect(grille.getByRole('row').nth(3)).toHaveAttribute('aria-selected', 'true')
})
