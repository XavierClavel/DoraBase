import { expect, test } from '@playwright/test'

// Les quatre vues et leurs chiffres : de l'assemblage d'écran. Le plan lui-même est couvert par les
// tests Rust, dont celui qui vérifie qu'`EXPLAIN` n'exécute rien.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('button', { name: /Nouvelle console/ }).click()
  await page.locator('.cm-content').click()
  await page.keyboard.insertText("select date_trunc('day', created_at) from orders")
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('les quatre vues existent, et « Résultat » porte le compte', async ({ page }) => {
  for (const vue of ['Résultat', 'JSON', 'Plan', 'Messages']) {
    await expect(page.getByRole('radio', { name: new RegExp(vue) })).toBeVisible()
  }
  // Le compte est accolé au libellé, comme le segmenté de `A4` (`09a`).
  await expect(page.getByRole('radio', { name: /Résultat/ })).toBeChecked()
  // Le compte vit dans le libellé de la radio, pas dans un texte isolé : `getByText('Résultat')`
  // attrapait la légende du groupe (« Vue du résultat »).
  await expect(page.getByRole('radio', { name: /Résultat/ })).toHaveAccessibleName(/2/)
})

test('« Expliquer » montre le plan, et dit que la requête n’a pas été exécutée', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Expliquer/ }).click()

  await expect(page.getByRole('radio', { name: /Plan/ })).toBeChecked()
  await expect(page.getByText(/Coûts/)).toContainText('estimés')
  // **Le fait qui compte** : un plan dont on croirait les temps réels ferait prendre des décisions sur
  // des chiffres qui n'en sont pas.
  await expect(page.getByText(/n’a pas été exécutée/)).toBeVisible()
  // Le plan garde son indentation : elle porte l'arbre des nœuds.
  const espaces = await page.evaluate(
    () => getComputedStyle(document.querySelector('pre') as Element).whiteSpace,
  )
  expect(espaces).toBe('pre')
  // Et la barre distingue le temps du plan de celui de la requête.
  await expect(page.getByRole('status', { name: 'État du résultat' })).toContainText('plan 2 ms')
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
