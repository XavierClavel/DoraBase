import { expect, test } from '@playwright/test'

// La section « Mes requêtes » et le parcours d'enregistrement : de l'assemblage d'écran. Les règles
// sont couvertes côté Rust, dont la rétrocompatibilité du fichier de configuration.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.evaluate(() => document.fonts.ready)
})

test('« Mes requêtes » liste les requêtes du projet', async ({ page }) => {
  await expect(page.getByText('Mes requêtes')).toBeVisible()
  for (const nom of ['CA par jour', 'Top coupons', 'Paniers abandonnés']) {
    await expect(page.getByRole('button', { name: new RegExp(nom) })).toBeVisible()
  }
})

test('cliquer une requête ouvre une console sur son texte', async ({ page }) => {
  await page.getByRole('button', { name: /CA par jour/ }).click()
  await expect(page.getByRole('tab', { name: /console 1/ })).toBeVisible()
  // Une console est le seul endroit où l'on peut exécuter : ouvrir la requête ailleurs demanderait un
  // second éditeur.
  await expect(page.locator('.cm-content')).toContainText('date_trunc')
})

test('le menu « … » d’une requête propose renommer et retirer', async ({ page }) => {
  await page.getByRole('button', { name: /CA par jour/ }).hover()
  await page.getByRole('button', { name: 'Actions de CA par jour' }).click()

  const menu = page.getByRole('dialog', { name: 'Actions' })
  await expect(menu).toContainText('Renommer…')
  await expect(menu).toContainText('Retirer…')
  // Réellement visible, pas seulement présent — la leçon du défaut n° 35 : la sidebar défile, et un
  // `overflow` d'ancêtre découperait le panneau sans qu'aucune assertion de visibilité s'en aperçoive.
  const auPoint = await page.evaluate(() => {
    const panneau = document.querySelector('[role=dialog][aria-label=Actions]')
    const boite = panneau?.getBoundingClientRect()
    if (!panneau || !boite) return null
    return panneau.contains(document.elementFromPoint(boite.left + boite.width / 2, boite.top + 6))
  })
  expect(auPoint).toBe(true)
})

test('« Enregistrer » propose le nom de la requête ouverte', async ({ page }) => {
  await page.getByRole('button', { name: /Top coupons/ }).click()
  await page.waitForSelector('.cm-content')
  const toolbar = page.getByRole('toolbar', { name: 'Actions de la console' })
  await toolbar.getByRole('button', { name: /Enregistrer/ }).click()

  // **Sans ce nom pré-rempli**, l'utilisateur devrait retaper le nom exact pour mettre à jour
  // l'entrée, ou créerait un doublon sans le vouloir.
  await expect(page.getByLabel('Nom de la requête')).toHaveValue('Top coupons')
  // Et le bouton annonce le remplacement, puisque le nom est pris.
  await expect(page.getByRole('button', { name: 'Remplacer' })).toBeVisible()
})
