import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement, ouvrirUneConsole } from './pourLesTests'

// Les trois vues et leurs chiffres : de l'assemblage d'écran.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  await ouvrirUneConsole(page, 'analytics')
  await page.locator('.cm-content').click()
  await page.keyboard.insertText("select date_trunc('day', created_at) from orders")
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('les trois vues existent, et « Résultat » porte le compte', async ({ page }) => {
  for (const vue of ['Résultat', 'JSON', 'Messages']) {
    await expect(page.getByRole('radio', { name: new RegExp(vue) })).toBeVisible()
  }
  // Le compte est accolé au libellé, comme le segmenté de `A4` (`09a`).
  await expect(page.getByRole('radio', { name: /Résultat/ })).toBeChecked()
  // Le compte vit dans le libellé de la radio, pas dans un texte isolé : `getByText('Résultat')`
  // attrapait la légende du groupe (« Vue du résultat »).
  await expect(page.getByRole('radio', { name: /Résultat/ })).toHaveAccessibleName(/2/)
})

test('la vue JSON suit la ligne sélectionnée', async ({ page }) => {
  await page.getByRole('radio', { name: /JSON/ }).check({ force: true })
  await expect(page.getByText(/Sélectionnez une ligne/)).toBeVisible()

  await page.getByRole('radio', { name: /Résultat/ }).check({ force: true })
  await page.getByRole('row').nth(1).click()
  await page.getByRole('radio', { name: /JSON/ }).check({ force: true })
  // Sérialiser mille lignes contredirait la contrainte transverse du projet : la vue suit la
  // sélection, comme le panneau de `10f`.
  await expect(page.locator('pre')).toContainText('jour')
})

test('« Messages » consigne la limite ajoutée par DoraBase', async ({ page }) => {
  await page.getByRole('radio', { name: /Messages/ }).check({ force: true })
  // La barre disparaît du regard ; un journal se relit. Et c'est là qu'on cherche pourquoi un
  // résultat s'arrête à mille lignes.
  await expect(page.getByText(/a ajouté/)).toContainText('limit 1000')
  // Ce qui n'est pas capté est dit, plutôt que laissé croire à un serveur silencieux.
  await expect(page.getByText(/ne sont pas encore captés/)).toBeVisible()
})
