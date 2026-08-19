import { expect, test } from '@playwright/test'

// Hauteurs, alignement des chips et débordement du panneau SQL : de la mise en page, donc hors
// de portée de Vitest. `10e` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('la toolbar fait 36 px et ses contrôles 25', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    // La barre **de la table** : « Rafraîchir » existe aussi dans le pied de la sidebar.
    const barre = document.querySelector('[role=toolbar][aria-label="Outils de la table"]')
    const rafraichir = barre?.querySelector('[aria-label="Rafraîchir"]')
    if (!barre || !rafraichir) return null
    return {
      barre: getComputedStyle(barre).height,
      bouton: Math.round(rafraichir.getBoundingClientRect().height),
    }
  })
  expect(mesures?.barre).toBe('36px')
  // 25 px déclarés + 2 de bordure : `--h-btn-sm` est une hauteur de contenu, comme partout
  // ailleurs dans ce projet.
  expect(mesures?.bouton).toBe(27)
})

test('le panneau SQL s’ouvre sans sortir de la fenêtre', async ({ page }) => {
  await page.getByRole('button', { name: /Voir le SQL/ }).click()
  const panneau = page.getByRole('dialog', { name: 'SQL exécuté' })
  await expect(panneau).toContainText('select * from public.orders limit 500')

  const boite = await panneau.boundingBox()
  const largeur = await page.evaluate(() => window.innerWidth)
  expect(boite?.x).toBeGreaterThanOrEqual(0)
  expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur)
})

test('masquer une colonne la retire de la grille', async ({ page }) => {
  // L'en-tête de nom, pas la cellule de filtre — les deux sont des `columnheader`.
  const entete = page.getByRole('button', { name: 'Trier par currency' })
  await expect(entete).toBeVisible()

  await page.getByRole('button', { name: 'Colonnes affichées' }).click()
  await page.getByRole('dialog', { name: 'Colonnes affichées' }).getByText('currency').click()

  await expect(page.getByRole('button', { name: 'Trier par currency' })).toHaveCount(0)
  // 8 sur 9 : le décor de démo porte une neuvième colonne depuis `10f`, dont la valeur ne tient pas
  // dans le panneau de ligne — c'est ce qui rend l'ellipse et l'aperçu mesurables. Un compte en dur
  // dans un test est un lien vers le décor, et il faut le suivre quand le décor change.
  await expect(page.getByRole('button', { name: 'Colonnes affichées' })).toContainText('8/9')
})

test('un filtre actif produit un chip d’accent, distinct du chip de tri', async ({ page }) => {
  await page.getByLabel('Filtrer status').fill('paid')
  await page.getByLabel('Filtrer status').press('Enter')
  await page.getByRole('button', { name: 'Trier par created_at' }).click()

  const filtre = page.getByText('status = paid')
  const tri = page.getByText('created_at asc')
  await expect(filtre).toBeVisible()
  await expect(tri).toBeVisible()

  const fondFiltre = await filtre.evaluate((e) => getComputedStyle(e).backgroundColor)
  const fondTri = await tri.evaluate((e) => getComputedStyle(e).backgroundColor)
  expect(fondFiltre).not.toBe(fondTri)
})
