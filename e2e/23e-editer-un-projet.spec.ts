import { expect, test } from '@playwright/test'

// **Ce fichier était celui de `08i`** — la modale de renommage, qui n'existe plus : `23e` l'a absorbée
// dans l'éditeur de projet. Le renommage y est le premier champ, et les tests qui le mesuraient sont
// devenus ceux de cet écran. La commande elle-même reste couverte par les tests Rust, y compris sur le
// magasin chiffré réel.
//
// La démo répond aux cinq gestes de `23c` contre son état local : le pont Tauri ne répond pas en
// Chromium, et sans cela l'écran ne serait mesurable qu'en galerie — le trou que `10b` a corrigé.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).hover()
  await page.getByRole('button', { name: 'Actions de Atelier Nord' }).click()
  await page.getByRole('button', { name: 'Modifier le projet…' }).click()
})

const modale = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: /Modifier Atelier Nord/ })

test('la modale s’ouvre sur le projet, avec son nom et ses quatre environnements', async ({
  page,
}) => {
  await expect(modale(page)).toBeVisible()
  await expect(modale(page).getByLabel('Nom du projet')).toHaveValue('Atelier Nord')
  await expect(modale(page)).toContainText('mots de passe enregistrés suivent le nouveau nom')

  // **Quatre lignes, pas trois** : le décor porte `preprod` justement pour attraper un écran qui
  // relirait le trio de `23a` en dur (`23g`).
  for (const libelle of ['dev', 'preprod', 'staging', 'prod']) {
    await expect(page.getByRole('button', { name: `Retirer ${libelle}` })).toBeVisible()
  }

  // Réellement visible, pas seulement présente — la leçon du défaut n° 35.
  const auPoint = await page.evaluate(() => {
    const boite = document
      .querySelector('[role=dialog][aria-label^="Modifier"]')
      ?.getBoundingClientRect()
    if (!boite) return null
    const dessus = document.elementFromPoint(boite.left + boite.width / 2, boite.top + 8)
    return document.querySelector('[role=dialog][aria-label^="Modifier"]')?.contains(dessus)
  })
  expect(auPoint).toBe(true)
})

test('le contenu porte son propre remplissage, celui de la trame de `A2`', async ({ page }) => {
  // Le corps de `Modal` n'a **aucun** remplissage (`08a`) : c'est au contenu de poser le sien, et
  // l'oublier fait toucher les bords — le défaut déjà attrapé sur la confirmation de retrait.
  //
  // **16 px, et non l'alignement sur le pied.** Le premier jet de ce test exigeait l'égalité avec le
  // premier élément du pied, mesure héritée de l'ancienne modale de `08i` dont le corps portait 14 px.
  // La trame de `A2` — que `24a` et cet écran reprennent délibérément — pose 16 px de corps pour 14 px
  // de pied : ces 2 px sont ceux du handoff, vérifiés par les captures de fidélité. Une mesure qui les
  // refuse ne mesure pas l'écran, elle mesure l'écran d'avant.
  const mesures = await page.evaluate(() => {
    const boite = document.querySelector('[role=dialog][aria-label^="Modifier"]')
    const champ = boite?.querySelector('label')
    if (!boite || !champ) return null
    const modale = boite.getBoundingClientRect()
    const cadre = champ.getBoundingClientRect()
    return {
      marge: Math.round(cadre.left - modale.left),
      droiteModale: Math.round(modale.right),
      droiteChamp: Math.round(cadre.right),
    }
  })
  const m = mesures as NonNullable<typeof mesures>
  // 17 et non 16 : la coquille de `Modal` porte un filet de 1 px, mesuré depuis le bord **externe**.
  expect(m.marge).toBe(17)
  expect(m.droiteChamp).toBeLessThan(m.droiteModale)
})

test('chaque ligne dit combien de connexions en dépendent', async ({ page }) => {
  // Le décor déclare ses deux connexions en `prod`.
  const prod = page.getByRole('button', { name: 'Retirer prod' }).locator('..')
  await expect(prod).toContainText('2 connexions')
  await expect(page.getByRole('button', { name: 'Retirer dev' }).locator('..')).toContainText(
    'aucune connexion',
  )
  // **La marque « · actif » a disparu avec `25a`** : un projet n'a plus d'environnement actif, ils
  // sont tous des paliers de l'arbre. Elle disait « retirer celui-ci change le contenu de l'arbre » ;
  // c'est désormais vrai de tous, et le compte le dit déjà mieux. Un test qui la cherchait encore
  // demanderait le retour d'une notion supprimée.
  await expect(page.getByRole('dialog', { name: /Modifier Atelier Nord/ })).not.toContainText(
    'actif',
  )
})

test('un renommage de projet rapporte le secret introuvable, sans refermer', async ({ page }) => {
  // La démo répond avec un secret manquant : le cas que la commande réelle produit sur un Trousseau
  // nettoyé à la main.
  await modale(page).getByLabel('Nom du projet').fill('Atelier')
  // **Au relâchement du champ** : `23e` supprime le bouton « Appliquer », donc c'est le `blur` qui
  // déclenche — ici provoqué par la touche Entrée, comme l'utilisateur le fait.
  await modale(page).getByLabel('Nom du projet').press('Enter')

  await expect(page.getByRole('status').first()).toContainText('introuvables dans le Trousseau')
  // La modale reste ouverte, et **suit le nouveau nom** : son état la désignait par l'ancien, ce qui
  // l'aurait fermée d'elle-même.
  await expect(page.getByRole('dialog', { name: /Modifier Atelier/ })).toBeVisible()
})

test('retirer un environnement qui porte des connexions les nomme avant', async ({ page }) => {
  await page.getByRole('button', { name: 'Retirer prod' }).click()

  const confirmation = page.getByRole('dialog', { name: /Retirer prod/ })
  await expect(confirmation).toContainText('2 connexions déclarées')
  await expect(confirmation).toContainText('analytics')
  await expect(confirmation).toContainText('evenements')
  // La phrase que `08j` a rendue obligatoire : « supprimer une connexion » se lit comme « supprimer
  // la base ».
  await expect(confirmation).toContainText('bases distantes ne sont pas touchées')
  // **Et rien sur un environnement actif** (`25a`) : la modale annonçait le remplaçant de l'actif
  // quand l'environnement retiré l'était. Il n'y a plus d'actif, donc plus de remplaçant à nommer —
  // ce qui reste vrai, et qui compte, est le compte et les noms de ce qui part.
  await expect(confirmation).not.toContainText('environnement actif')
})

test('un environnement vide se retire sans confirmation, et la liste suit', async ({ page }) => {
  await page.getByRole('button', { name: 'Retirer preprod' }).click()

  // **Aucune confirmation** (`23f`) : un geste sans conséquence n'en demande pas, sinon on apprend à
  // cliquer sans lire.
  await expect(page.getByRole('dialog', { name: /Retirer preprod/ })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Retirer preprod' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Retirer dev' })).toBeVisible()
})

test('les flèches sur la poignée réordonnent la liste', async ({ page }) => {
  const rangs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role=dialog][aria-label^="Modifier"] li input[type=text]')]
        .map((champ) => (champ as HTMLInputElement).value)
        .join(','),
    )
  expect(await rangs()).toBe('dev,preprod,staging,prod')

  await page.getByRole('button', { name: /Déplacer prod/ }).focus()
  await page.keyboard.press('ArrowUp')

  // **Le geste existe au clavier**, et pas seulement à la souris : `draggable` seul rend le
  // réordonnancement inatteignable sans souris.
  await expect.poll(rangs).toBe('dev,preprod,prod,staging')
})

/*
 * **Le test « la pastille de la barre de titre mène à la même modale » a disparu** (`25b`).
 *
 * Il vérifiait que les deux points d'entrée de `23e` ouvraient le même écran — l'arbre où l'on
 * regarde ses projets, la pastille où l'on regardait le projet courant. La pastille n'est plus un
 * contrôle : le « … » de la ligne projet est désormais le **seul** chemin, et c'est celui que le
 * `beforeEach` de ce fichier emprunte à chaque test. Ce qui était une garantie de cohérence entre deux
 * chemins n'a plus deux chemins à comparer.
 */
