import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

/**
 * Les colonnes de la grille de données : leur ajustement automatique, et les deux menus du clic
 * droit — masquer une colonne, copier une valeur.
 *
 * **Rien de tout cela ne peut être vu ailleurs qu'ici.** Le curseur et l'ajustement sont des
 * valeurs **calculées** : jsdom n'en rend aucune (règle n° 9).
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
})

test('le menu du clic droit flotte au-dessus de la grille, et masque la colonne', async ({
  page,
}) => {
  await page.getByRole('columnheader', { name: 'status', exact: true }).click({ button: 'right' })

  const menu = page.getByRole('menu', { name: 'Actions sur la colonne status' })
  await expect(menu).toBeVisible()

  // **Réellement sous le pointeur, et pas seulement dans le DOM** : le menu est posé en coordonnées
  // de fenêtre, donc il peut se retrouver hors de l'écran ou sous un voisin sans qu'une assertion de
  // visibilité s'en aperçoive.
  //
  // **Ce que ce test ne prouve pas** : qu'il échappe à l'`overflow` de la zone défilante. Il est
  // rendu en fin de `TableView`, hors de cette zone, donc un sabotage qui le repasse en `absolute`
  // le laisse au bon endroit — mesuré, et le commentaire l'a dit un moment de trop. La garantie du
  // `position: fixed` se joue chez `MenuContextuel`, où ses propres tests la tiennent.
  const boite = await menu.boundingBox()
  if (!boite) throw new Error('menu introuvable')
  const dessus = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x as number, y as number)?.closest('[role=menu]') !== null,
    [boite.x + boite.width / 2, boite.y + boite.height / 2],
  )
  expect(dessus).toBe(true)

  await menu.getByRole('menuitem', { name: 'Masquer la colonne' }).click()
  await expect(page.getByRole('columnheader', { name: 'status', exact: true })).toHaveCount(0)
  // Le retour existe : la barre d'outils compte les colonnes visibles, et c'est de là qu'on la
  // remontre. Un masquage sans retour serait une impasse.
  await expect(page.getByRole('button', { name: /colonnes/i })).toContainText('8/9')
})

test('le clic droit sur une cellule propose de copier sa valeur', async ({ page }) => {
  await page
    .getByRole('gridcell')
    .filter({ hasText: /^paid$/ })
    .first()
    .click({ button: 'right' })

  const menu = page.getByRole('menu', { name: 'Actions sur la valeur de status' })
  await expect(menu.getByRole('menuitem', { name: 'Copier la valeur' })).toBeEnabled()

  // `Échap` referme, comme les trois autres menus contextuels de l'application.
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('les colonnes s’ajustent à leur contenu, sans rien tronquer sous le plafond', async ({
  page,
}) => {
  await page.evaluate(() => document.fonts.ready)
  const colonnes = await page.evaluate(() => {
    const entetes = [
      ...document.querySelectorAll('[role=row][aria-rowindex="1"] [role=columnheader]'),
    ]
    // La gouttière est écartée : elle porte des actions révélées au survol, dont la largeur ne
    // décrit rien du contenu de la table.
    return entetes.slice(1).map((entete, rang) => {
      const nom = entete.getAttribute('aria-label') ?? ''
      const bouton = entete.querySelector('button')
      const cellules = [
        ...document.querySelectorAll(
          `[role=row][aria-rowindex] [role=gridcell]:nth-child(${rang + 2})`,
        ),
      ]
      const coupe = (element: Element | null) =>
        element === null ? false : element.scrollWidth > element.clientWidth + 1
      return {
        nom,
        largeur: Math.round(entete.getBoundingClientRect().width),
        enteteCoupe: coupe(bouton),
        cellulesCoupees: cellules.filter((cellule) => coupe(cellule)).length,
      }
    })
  })

  // Contrôle positif : sans lui, tout ce qui suit passerait sur une grille sans colonne.
  expect(colonnes.length).toBeGreaterThan(5)

  // **L'ajustement a bien eu lieu** : les colonnes n'ont plus toutes la même largeur, ce qui était
  // le cas quand chacune valait 130 px.
  expect(new Set(colonnes.map((colonne) => colonne.largeur)).size).toBeGreaterThan(1)

  for (const colonne of colonnes) {
    // Le plafond : une colonne de texte libre ne pousse pas ses voisines hors de l'écran.
    expect(colonne.largeur).toBeLessThanOrEqual(320)
    // Et sous le plafond, rien n'est coupé — ni le nom de la colonne, ni ses valeurs. C'est ce
    // test, et lui seul, qui juge les deux avances de caractère d'`ajustement.ts` : elles sont
    // mesurées dans un navigateur, donc fausses le jour où la police ou la taille change.
    if (colonne.largeur < 320) {
      expect(colonne.enteteCoupe, `en-tête coupé : ${colonne.nom}`).toBe(false)
      expect(colonne.cellulesCoupees, `cellules coupées dans ${colonne.nom}`).toBe(0)
    }
  }
})
