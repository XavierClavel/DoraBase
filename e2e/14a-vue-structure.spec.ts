import { expect, test } from '@playwright/test'

// La mise en page de `A9` : trois zones empilées à gauche, la colonne du DDL à droite. Des
// géométries, donc hors de portée de jsdom — qui ne calcule aucune mise en page.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.getByRole('button', { name: 'Structure' }).click()
  // `DataTable` (`09a`) nomme son tableau par une `<caption>` masquée, pas par un `aria-label` :
  // c'est ce qui donne l'en-tête à la voix. Le sélecteur suit donc la légende.
  await page.getByRole('table', { name: /Colonnes de public\.orders/ }).waitFor()
  await page.evaluate(() => document.fonts.ready)
})

test('le DDL occupe la colonne de droite sans recouvrir le tableau', async ({ page }) => {
  const boites = await page.evaluate(() => {
    const tableauDesColonnes = () =>
      [...document.querySelectorAll('table')].find((t) =>
        /Colonnes de public\.orders/.test(t.querySelector('caption')?.textContent ?? ''),
      )
    const tableau = tableauDesColonnes()?.getBoundingClientRect()
    const ddl = document
      .querySelector('aside[aria-label^="DDL de public.orders"]')
      ?.getBoundingClientRect()
    return tableau && ddl ? { tableau, ddl } : null
  })
  const m = boites as NonNullable<typeof boites>

  // **Le DDL prend la place du panneau de détail**, à droite du centre — c'est ce que montre le
  // mockup, et c'est pourquoi la structure occupe toute la largeur comme la console de `12a`.
  expect(m.ddl.left).toBeGreaterThanOrEqual(m.tableau.right - 1)
  // 393 et non 392 : `getBoundingClientRect` compte le filet de séparation d'un pixel, que le
  // `width` du CSS n'inclut pas. Arrondir l'attente à « environ 392 » cacherait un jour un écart
  // qui compte.
  expect(Math.round(m.ddl.width)).toBe(393)
})

test('la colonne du DDL n’est pas recouverte : le point de son bouton lui appartient', async ({
  page,
}) => {
  // **`elementFromPoint`, pas `getBoundingClientRect`** : une boîte peut avoir les bonnes
  // coordonnées et être entièrement masquée par un voisin. C'est la leçon du défaut de la
  // gouttière (`11b`), où une mesure de position validait un élément invisible.
  const dessus = await page.evaluate(() => {
    const bouton = document.querySelector('aside[aria-label^="DDL de public.orders"] button')
    if (!bouton) return null
    const boite = bouton.getBoundingClientRect()
    const dessus = document.elementFromPoint(boite.x + boite.width / 2, boite.y + boite.height / 2)
    return bouton.contains(dessus) || dessus === bouton
  })
  expect(dessus).toBe(true)
})

test('les deux panneaux du bas partagent la largeur du centre', async ({ page }) => {
  const boites = await page.evaluate(() => {
    const titres = ['Index', 'Contraintes & triggers'].map(
      (texte) =>
        [...document.querySelectorAll('h3')]
          .find((h) => h.textContent?.trim() === texte)
          ?.parentElement?.getBoundingClientRect() ?? null,
    )
    return titres[0] && titres[1] ? { index: titres[0], contraintes: titres[1] } : null
  })
  const m = boites as NonNullable<typeof boites>

  // Côte à côte, pas empilés : le mockup les met en deux colonnes séparées d'un filet.
  expect(m.contraintes.left).toBeGreaterThanOrEqual(m.index.right - 1)
  // Et de largeurs comparables — un panneau écrasé à 40 px ne montrerait aucune définition.
  expect(Math.abs(m.index.width - m.contraintes.width)).toBeLessThan(m.index.width * 0.15)
})

test('le tableau des colonnes défile plutôt que de pousser les panneaux hors de l’écran', async ({
  page,
}) => {
  const mesures = await page.evaluate(() => {
    const tableauDesColonnes = () =>
      [...document.querySelectorAll('table')].find((t) =>
        /Colonnes de public\.orders/.test(t.querySelector('caption')?.textContent ?? ''),
      )
    const zone = tableauDesColonnes()?.parentElement
    const fenetre = document.documentElement.getBoundingClientRect()
    const panneaux = [...document.querySelectorAll('h3')]
      .find((h) => h.textContent?.trim() === 'Index')
      ?.parentElement?.parentElement?.getBoundingClientRect()
    if (!zone || !panneaux) return null
    return {
      defilable: getComputedStyle(zone).overflowY,
      panneauxDansLaFenetre: panneaux.bottom <= fenetre.bottom + 1,
    }
  })
  const m = mesures as NonNullable<typeof mesures>

  // Dix-huit colonnes dépassent la hauteur donnée au tableau. Sans défilement, les panneaux
  // d'index et de contraintes sortiraient du bas de la fenêtre — le mockup, figé, ne le montre
  // pas parce qu'il n'a que quatorze lignes.
  expect(m.defilable).toBe('auto')
  expect(m.panneauxDansLaFenetre).toBe(true)
})

test('« Données » ramène la grille, et l’état actif se voit', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Structure' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // La pastille sombre du mockup : sans elle, les deux libellés seraient du même gris et rien ne
  // dirait laquelle des deux vues est à l'écran.
  const fond = await page.evaluate(() => {
    const bouton = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Structure',
    )
    return bouton ? getComputedStyle(bouton).backgroundColor : null
  })
  expect(fond).not.toBe('rgba(0, 0, 0, 0)')

  await page.getByRole('button', { name: 'Données' }).click()
  await expect(page.getByRole('grid', { name: /Lignes de public\.orders/ })).toBeVisible()
})
