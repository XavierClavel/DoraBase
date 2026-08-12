import { expect, test } from '@playwright/test'

// L'intégration réelle : la liste s'ouvre, `↑↓` navigue, `⇥` insère. Les règles sont couvertes par
// les tests unitaires ; ici on vérifie qu'elles sont branchées à CodeMirror.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  // La table est ouverte pour que ses colonnes soient connues : l'autocomplétion ne les invente pas.
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.getByRole('button', { name: /Nouvelle console/ }).click()
  await page.waitForSelector('.cm-content')
  await page.locator('.cm-content').click()
  await page.evaluate(() => document.fonts.ready)
})

test('après un alias résolu, la liste propose les colonnes avec leur type', async ({ page }) => {
  await page.keyboard.insertText('select o.stat from orders o')
  // Le curseur est en fin de texte : on le ramène après `o.stat`.
  for (let i = 0; i < ' from orders o'.length; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('u')

  const liste = page.locator('.cm-tooltip-autocomplete')
  await expect(liste).toBeVisible()
  await expect(liste).toContainText('status')
  // Le type est affiché, comme dans le mockup : c'est ce qui permet de choisir sans aller voir la
  // structure.
  await expect(liste).toContainText('text')
})

test('⇥ insère la suggestion, et garde le qualifiant', async ({ page }) => {
  await page.keyboard.insertText('select o.stat from orders o')
  for (let i = 0; i < ' from orders o'.length; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('u')
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible()

  await page.keyboard.press('Tab')
  // **`o.status`, pas `status`** : l'insertion remplace le mot après le point, jamais le qualifiant.
  await expect(page.locator('.cm-content')).toContainText('select o.status from orders o')
})

test('↑↓ navigue dans la liste', async ({ page }) => {
  await page.keyboard.insertText('select o. from orders o')
  for (let i = 0; i < ' from orders o'.length; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.type('c')

  const liste = page.locator('.cm-tooltip-autocomplete')
  await expect(liste).toBeVisible()
  const premier = await page.evaluate(
    () => document.querySelector('.cm-tooltip-autocomplete [aria-selected=true]')?.textContent,
  )
  await page.keyboard.press('ArrowDown')
  const second = await page.evaluate(
    () => document.querySelector('.cm-tooltip-autocomplete [aria-selected=true]')?.textContent,
  )
  // Le mockup annonce « ↑↓ naviguer » : la sélection doit bouger, sinon l'annonce est fausse.
  expect(second).not.toBe(premier)
})

test('un alias inconnu n’ouvre aucune liste de colonnes', async ({ page }) => {
  await page.keyboard.insertText('select x.sta')
  await page.keyboard.type('t')
  // **Une suggestion fausse produit une requête en erreur que l'utilisateur croira correcte.** En cas
  // de doute, la liste ne devine pas — elle ne s'ouvre pas.
  await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0)
})

test('aucune requête n’est envoyée pendant la frappe', async ({ page }) => {
  const appels: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('run_sql')) appels.push(message.text())
  })
  await page.keyboard.insertText('select o.')
  await page.keyboard.type('sta')
  await page.waitForTimeout(200)
  // Les suggestions viennent de ce que l'écran a **déjà chargé** : interroger le serveur à chaque
  // caractère ajouterait une latence à l'endroit le plus sensible de l'écran.
  expect(appels).toEqual([])
})
