import { expect, test } from '@playwright/test'

// La confirmation et ce qu'elle montre : de l'assemblage d'écran. Les commandes sont couvertes par
// les tests Rust, y compris la garantie qu'elles n'émettent aucun SQL.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).hover()
  await page.getByRole('button', { name: 'Actions de Atelier Nord' }).click()
  await page.getByRole('button', { name: 'Retirer de DoraBase…' }).click()
})

test('le mot « supprimer » n’apparaît nulle part dans la confirmation', async ({ page }) => {
  const modale = page.getByRole('dialog', { name: /Retirer Atelier Nord de DoraBase/ })
  await expect(modale).toBeVisible()

  // **La décision centrale de `08j`.** « Supprimer la base » dans un client de bases se lit comme un
  // `DROP DATABASE` ; ce qui part est une déclaration sur cet ordinateur.
  const texte = ((await modale.textContent()) ?? '').toLowerCase()
  expect(texte).not.toContain('supprim')
  expect(texte).toContain('retirer')
})

test('les deux faits ont le même poids visuel', async ({ page }) => {
  // Mettre en avant ce qui inquiète et reléguer ce qui rassure en petit gris ferait lire « vous
  // allez perdre votre base » — l'inverse exact du message.
  const mesures = await page.evaluate(() => {
    const modale = document.querySelector('[role=dialog][aria-label^="Retirer"]')
    const blocs = [...(modale?.querySelectorAll('p') ?? [])].filter((p) =>
      /Ce qui/.test(p.textContent ?? ''),
    )
    if (blocs.length !== 2) return null
    return blocs.map((bloc) => {
      const style = getComputedStyle(bloc)
      return {
        taille: style.fontSize,
        graisse: style.fontWeight,
        fondPeint: style.backgroundColor !== 'rgba(0, 0, 0, 0)',
        largeur: Math.round(bloc.getBoundingClientRect().width),
      }
    })
  })
  expect(mesures).not.toBeNull()
  const [efface, intact] = mesures ?? []
  expect(intact?.taille).toBe(efface?.taille)
  expect(intact?.graisse).toBe(efface?.graisse)
  expect(intact?.fondPeint).toBe(true)
  expect(intact?.largeur).toBe(efface?.largeur)
})

test('le bouton porte le verbe du geste, jamais « OK »', async ({ page }) => {
  const pied = page.getByRole('dialog', { name: /Retirer Atelier Nord/ })
  await expect(pied.getByRole('button', { name: 'Retirer le projet' })).toBeVisible()
  await expect(pied.getByRole('button', { name: 'OK' })).toHaveCount(0)
})

test('annuler ne retire rien, et l’arbre garde son projet', async ({ page }) => {
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('dialog', { name: /Retirer/ })).toBeHidden()
  await expect(page.getByRole('treeitem', { name: /Atelier Nord/ })).toBeVisible()
})
