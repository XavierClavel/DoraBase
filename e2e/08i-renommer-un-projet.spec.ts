import { expect, test } from '@playwright/test'

// Le chemin du « … » à la modale, et ce que la modale montre : de l'assemblage d'écran.
// La commande elle-même est couverte par les tests Rust, y compris sur le magasin chiffré réel.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).hover()
  await page.getByRole('button', { name: 'Actions de Atelier Nord' }).click()
  await page.getByRole('button', { name: 'Renommer…' }).click()
})

test('la modale s’ouvre sur le projet, et dit ce que le renommage entraîne', async ({ page }) => {
  const modale = page.getByRole('dialog', { name: /Renommer Atelier Nord/ })
  await expect(modale).toBeVisible()
  await expect(modale.getByLabel('Nom du projet')).toHaveValue('Atelier Nord')

  // **Déplacer des mots de passe et fermer des connexions n'est pas ce qu'on attend d'un changement
  // de nom** : c'est dit avant, pas découvert après.
  await expect(modale).toContainText('mots de passe enregistrés suivent le nouveau nom')

  // Réellement visible, pas seulement présente — la leçon du défaut n° 35.
  const auPoint = await page.evaluate(() => {
    const boite = document
      .querySelector('[role=dialog][aria-label^="Renommer"]')
      ?.getBoundingClientRect()
    if (!boite) return null
    const dessus = document.elementFromPoint(boite.left + boite.width / 2, boite.top + 8)
    return document.querySelector('[role=dialog][aria-label^="Renommer"]')?.contains(dessus)
  })
  expect(auPoint).toBe(true)
})

test('le contenu s’aligne sur l’en-tête et ne touche pas les bords', async ({ page }) => {
  // Même oubli que la confirmation de retrait, même mesure : le corps de `Modal` n'a aucun
  // remplissage (`08a`), c'est au contenu de poser le sien.
  const mesures = await page.evaluate(() => {
    const modale = document.querySelector('[role=dialog][aria-label^="Renommer"]')
    const repere = modale?.querySelector('[data-testid=modal-footer]')?.firstElementChild
    const champ = modale?.querySelector('label')
    if (!modale || !repere || !champ) return null
    return {
      gaucheModale: Math.round(modale.getBoundingClientRect().left),
      droiteModale: Math.round(modale.getBoundingClientRect().right),
      gaucheRepere: Math.round(repere.getBoundingClientRect().left),
      gaucheChamp: Math.round(champ.getBoundingClientRect().left),
      droiteChamp: Math.round(champ.getBoundingClientRect().right),
    }
  })
  const m = mesures as NonNullable<typeof mesures>
  expect(m.gaucheChamp).toBe(m.gaucheRepere)
  expect(m.droiteChamp).toBeLessThan(m.droiteModale)
})

test('un nom vide désactive « Renommer » et dit pourquoi', async ({ page }) => {
  await page.getByLabel('Nom du projet').fill('   ')
  const bouton = page.getByRole('button', { name: 'Renommer', exact: true })
  await expect(bouton).toBeDisabled()
  // La raison est à portée du geste qui a échoué (`09f`), pas dans une alerte séparée.
  await expect(bouton).toHaveAttribute('title', /ne peut pas être vide/)
})

test('un secret introuvable est rapporté, et la modale attend d’être fermée', async ({ page }) => {
  // La démo répond avec un secret manquant : le cas que la commande réelle produit sur un
  // Trousseau nettoyé à la main.
  await page.getByLabel('Nom du projet').fill('Atelier')
  await page.getByRole('button', { name: 'Renommer', exact: true }).click()

  const rapport = page.getByRole('status')
  await expect(rapport).toContainText('introuvables dans le Trousseau')
  // **Elle ne se referme pas dessus** : une base qui redemande son mot de passe sans raison
  // apparente se découvrirait des semaines plus tard, sur un échec de connexion.
  await expect(page.getByRole('dialog', { name: /Renommer/ })).toBeVisible()
  // « Terminé », pas « Fermer » : la croix de la modale porte déjà ce dernier nom, et deux contrôles
  // homonymes dans un dialogue sont indiscernables à la voix. C'est ce test qui l'a révélé.
  await page.getByRole('button', { name: 'Terminé' }).click()
  await expect(page.getByRole('dialog', { name: /Renommer/ })).toBeHidden()
})
