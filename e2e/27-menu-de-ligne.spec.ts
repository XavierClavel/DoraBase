import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// Le menu d'une ligne d'arbre (`27`) : son ouverture au clic droit, et sa fermeture quand le pointeur
// s'en va. Deux comportements que seul un vrai navigateur mesure — jsdom n'a ni `visibility` calculée
// ni pointeur, et les trois défauts corrigés ici sont venus de l'usage, pas d'un test.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.evaluate(() => document.fonts.ready)
})

test('sortir de la ligne ferme le menu, et le survol ne le rouvre pas', async ({ page }) => {
  const ligne = page.getByRole('treeitem', { name: /analytics/ }).first()
  await ligne.hover()
  await page.getByRole('button', { name: 'Actions de analytics' }).click()
  await expect(page.getByRole('dialog', { name: 'Actions' })).toBeVisible()

  // On s'en va — vers le filtre, qui est loin de la ligne et du panneau.
  await page.getByPlaceholder(/Filtrer l'arborescence/).hover()

  // **Fermé, pas seulement invisible.** Le panneau vit dans la gouttière que `TreeRow` masque hors
  // survol : sans fermeture réelle, il ne disparaissait qu'en apparence.
  await expect(page.getByRole('dialog', { name: 'Actions' })).toHaveCount(0)

  // Et revenir sur la ligne ne le ramène pas : il faut recliquer.
  await ligne.hover()
  await expect(page.getByRole('dialog', { name: 'Actions' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Actions de analytics' }).click()
  await expect(page.getByRole('dialog', { name: 'Actions' })).toBeVisible()
})

test('descendre du « … » vers le menu ne le ferme pas', async ({ page }) => {
  await page
    .getByRole('treeitem', { name: /analytics/ })
    .first()
    .hover()
  const declencheur = page.getByRole('button', { name: 'Actions de analytics' })
  const depart = await declencheur.boundingBox()
  await declencheur.click()
  const arrivee = await page.getByRole('button', { name: 'Renommer…' }).boundingBox()
  if (!depart || !arrivee) throw new Error('le déclencheur et l’entrée doivent être mesurables')

  /* **Le trajet est joué pas à pas, et c'est tout l'objet du test.** `hover()` téléporte le pointeur
     d'un élément à l'autre : il ne traverse jamais l'interstice de 2px que `Popover` laisse entre le
     déclencheur et son panneau, donc il ne peut pas voir la fermeture prématurée. Un sabotage
     ramenant le délai de grâce à 0 passait ce test tant qu'il utilisait `hover()`.

     Les pas font ~2px : assez fins pour que Chromium hit-teste l'interstice, comme une vraie main. */
  const x = depart.x + depart.width / 2
  for (let y = depart.y + depart.height / 2; y < arrivee.y + arrivee.height / 2; y += 2) {
    await page.mouse.move(x, y)
  }

  await expect(page.getByRole('dialog', { name: 'Actions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Renommer…' })).toBeVisible()
})

test('le clic droit sur une connexion ouvre les mêmes actions, au pointeur', async ({ page }) => {
  const ligne = page.getByRole('treeitem', { name: /analytics/ }).first()
  await ligne.click({ button: 'right' })

  const menu = page.getByRole('menu', { name: 'Actions de analytics' })
  await expect(menu).toContainText('Renommer…')
  await expect(menu).toContainText('Retirer de DoraBase…')

  // **Réellement visible, pas seulement présent** — la sidebar défile, et un `overflow` d'ancêtre
  // découperait le panneau sans qu'aucune assertion de visibilité s'en aperçoive (défaut n° 35).
  const auPoint = await page.evaluate(() => {
    const panneau = document.querySelector('[role=menu]')
    const boite = panneau?.getBoundingClientRect()
    if (!panneau || !boite) return null
    return panneau.contains(document.elementFromPoint(boite.left + boite.width / 2, boite.top + 6))
  })
  expect(auPoint).toBe(true)

  // Le menu du système ne s'ouvre pas par-dessus : c'est tout l'objet du `preventDefault`.
  await page.getByRole('menuitem', { name: 'Renommer…' }).click()
  await expect(page.getByLabel('Nouveau nom de analytics')).toBeFocused()
})

/* **Le parcours complet par le clic droit**, et non seulement l'ouverture du menu : c'est ce qui
   prouve que la seconde voie mène vraiment à l'action, et pas à un menu décoratif. Le renommage
   lui-même est couvert par `26` ; ici il sert de témoin. */
test('le clic droit mène à l’action jusqu’au bout, comme le « … »', async ({ page }) => {
  await page
    .getByRole('treeitem', { name: /analytics/ })
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Renommer…' }).click()
  const champ = page.getByLabel('Nouveau nom de analytics')
  await champ.fill('entrepot')
  await champ.press('Enter')

  await expect(page.getByRole('treeitem', { name: /entrepot/ })).toBeVisible()
})
