import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement, ouvrirUneConsole } from './pourLesTests'

// L'assemblage : le résultat dans la grille, la barre, la confirmation. Le moteur est couvert par
// les tests Rust sur PostgreSQL réel.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  await ouvrirUneConsole(page, 'analytics')
  await page.waitForSelector('.cm-content')
  await page.locator('.cm-content').click()
  await page.evaluate(() => document.fonts.ready)
})

test('exécuter affiche le résultat sous l’éditeur, avec ses chiffres', async ({ page }) => {
  await page.keyboard.insertText('select 1')
  await page.getByRole('button', { name: /Exécuter/ }).click()

  const grille = page.getByRole('grid', { name: /Résultat de la requête/ })
  await expect(grille).toBeVisible()

  const positions = await page.evaluate(() => {
    const editeur = document.querySelector('.cm-editor')?.getBoundingClientRect()
    const resultat = document.querySelector('[role=grid]')?.getBoundingClientRect()
    return editeur && resultat ? { bas: editeur.bottom, haut: resultat.top } : null
  })
  // Le résultat vit **sous** l'éditeur, dans la zone que le partage de `12a` lui réserve.
  expect(positions?.haut).toBeGreaterThan((positions?.bas ?? 0) - 1)

  const barre = page.getByRole('status', { name: 'État du résultat' })
  await expect(barre).toContainText('2 lignes')
  await expect(barre).toContainText('128 ms')
  // **La limite ajoutée est dite** : une limite silencieuse ferait croire à une table de mille lignes.
  await expect(barre).toContainText('limité à 1000 par DoraBase')
})

test('réordonner une colonne du résultat réécrit la projection dans l’éditeur', async ({
  page,
}) => {
  // `select *` : le cas le plus courant, et celui que la réécriture développe — le décor rend
  // toujours `jour, commandes, ca_eur`, donc la liste écrite doit devenir ces trois noms.
  await page.keyboard.insertText('select * from ventes')
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await page.waitForSelector('[role=grid]')

  await page.getByRole('button', { name: 'Déplacer commandes (flèches gauche et droite)' }).focus()
  await page.keyboard.press('ArrowLeft')

  // En `poll` : la réécriture passe par une transaction CodeMirror, dont le rendu suit le geste.
  const editeur = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.cm-content > .cm-line')]
        .map((ligne) => ligne.textContent)
        .join('\n'),
    )
  await expect.poll(editeur).toBe('select commandes, jour, ca_eur from ventes')

  // Le menu des colonnes de la barre — celui d'`A5` — masque `jour`, et le select la perd.
  await page.getByRole('button', { name: 'Colonnes affichées' }).click()
  await page.getByRole('checkbox', { name: 'jour' }).uncheck()
  await expect.poll(editeur).toBe('select commandes, ca_eur from ventes')
  await page.keyboard.press('Escape')

  // Et le stepper LIMIT écrit dans la requête ce qu'il affichait comme implicite.
  await page.getByRole('button', { name: 'Réduire la limite' }).click()
  await expect.poll(editeur).toBe('select commandes, ca_eur from ventes\nlimit 500')
})

test('le résultat appartient à sa console : basculer d’onglet le change', async ({ page }) => {
  await page.keyboard.insertText('select 1')
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await expect(page.getByRole('grid', { name: /Résultat de la requête/ })).toBeVisible()

  // **Une console neuve n'a rien exécuté, donc elle ne montre rien.** Un état d'exécution unique lui
  // faisait afficher le résultat de la voisine, sous un texte qui ne l'avait pas produit — deux
  // requêtes, un seul résultat, et rien pour dire laquelle on regardait.
  await ouvrirUneConsole(page, 'analytics')
  await expect(page.getByRole('grid', { name: /Résultat de la requête/ })).toBeHidden()
  await expect(page.getByText(/Aucun résultat/)).toBeVisible()

  // Et revenir retrouve le premier résultat : basculer d'onglet ne relance rien.
  await page.getByRole('tab', { name: /console 1/ }).click()
  await expect(page.getByRole('grid', { name: /Résultat de la requête/ })).toBeVisible()
})

test('les nombres du résultat sont alignés à droite', async ({ page }) => {
  await page.keyboard.insertText('select 1')
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await page.waitForSelector('[role=grid]')

  const alignements = await page.evaluate(() => {
    const cellules = [...document.querySelectorAll('[role=grid] [role=gridcell]')]
    return cellules.slice(0, 3).map((c) => getComputedStyle(c).textAlign)
  })
  // L'alignement suit le genre de la valeur, seule information disponible pour une colonne calculée :
  // `count(*)` n'existe dans aucun catalogue.
  expect(alignements[0]).not.toBe('right')
  expect(alignements[1]).toBe('right')
  expect(alignements[2]).toBe('right')
})

test('un `delete` ouvre une confirmation qui récapitule', async ({ page }) => {
  await page.keyboard.insertText('delete from orders')
  await page.getByRole('button', { name: /Exécuter/ }).click()

  const confirmation = page.getByRole('dialog', { name: 'Écrire dans la base' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toContainText('toutes les lignes')
  // La confirmation dit ce que DoraBase **ne** fait pas : ni transaction, ni patch inverse — laisser
  // croire à un filet qui n'existe pas serait pire que ne rien annoncer.
  await expect(confirmation).toContainText('sans transaction et sans patch inverse')

  // Réellement visible, pas seulement présente — la leçon du défaut n° 35.
  const auPoint = await page.evaluate(() => {
    const modale = document.querySelector('[role=dialog][aria-label="Écrire dans la base"]')
    const boite = modale?.getBoundingClientRect()
    if (!modale || !boite) return null
    return modale.contains(document.elementFromPoint(boite.left + boite.width / 2, boite.top + 8))
  })
  expect(auPoint).toBe(true)
})

test('la sélection s’exécute seule quand il y en a une', async ({ page }) => {
  await page.keyboard.insertText('select 1;\nselect 2')
  // Sélectionner la première ligne seulement.
  await page.keyboard.press('Meta+ArrowUp')
  await page.keyboard.press('Shift+ArrowDown')
  await page.getByRole('button', { name: /Sélection/ }).click()
  // Le bouton répond : `12a` le laissait désactivé, et un bouton actif qui ne ferait rien se lirait
  // comme une panne (défaut n° 36).
  await expect(page.getByRole('grid', { name: /Résultat de la requête/ })).toBeVisible()
})
