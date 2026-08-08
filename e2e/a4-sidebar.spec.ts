import { expect, test } from '@playwright/test'

// `04` a coûté quatre défauts de mise en page invisibles en test unitaire. Les mêmes propriétés
// sont ici hors de portée de jsdom : largeur de la colonne, indentation par niveau, absence de
// débordement horizontal.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=sidebar-a4]')
  await page.evaluate(() => document.fonts.ready)
})

test('la colonne fait 252 px, contre 212 pour A5 → A9', async ({ page }) => {
  const largeur = await page.evaluate(() => {
    const colonne = document.querySelector('[data-testid=sidebar-a4]')
      ?.firstElementChild as HTMLElement | null
    return colonne ? Math.round(colonne.getBoundingClientRect().width) : null
  })
  // 253 et non 252 : le mockup déclare `width:252px` **avec** un `border-right` de 1 px, et sans
  // `box-sizing` la bordure s'ajoute — c'est donc 253 qu'il rend, et 253 qu'il faut reproduire.
  // Quarante pixels de plus que `A5` → `A9`, parce que l'arbre de `A4` a un niveau de plus pour
  // la même profondeur d'indentation.
  expect(largeur).toBe(253)
})

test('les quatre niveaux suivent la table d’indentation de TreeRow', async ({ page }) => {
  const indentations = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid=sidebar-a4]')
    const parNiveau = new Map<string, string>()
    for (const ligne of sidebar?.querySelectorAll('[role=treeitem]') ?? []) {
      const niveau = ligne.getAttribute('aria-level')
      if (niveau && !parNiveau.has(niveau)) {
        parNiveau.set(niveau, getComputedStyle(ligne).paddingLeft)
      }
    }
    return [...parNiveau.entries()].sort()
  })

  // La table littérale de `TreeRow` : 8, 22, 36, 52 — gaps 14, 14, **16**. Aucune formule ne la
  // produit, et `04` l'avait déjà établi.
  expect(indentations).toEqual([
    ['1', '8px'],
    ['2', '22px'],
    ['3', '36px'],
    ['4', '52px'],
  ])
})

test('aucune ligne ne déborde horizontalement de la colonne', async ({ page }) => {
  const debordements = await page.evaluate(() => {
    const colonne = document.querySelector('[data-testid=sidebar-a4]')?.firstElementChild
    if (!colonne) return null
    const droite = colonne.getBoundingClientRect().right
    return [...colonne.querySelectorAll('[role=treeitem]')].filter(
      (l) => l.getBoundingClientRect().right > droite + 1,
    ).length
  })
  // Un nom de table long doit être tronqué, pas déborder : c'est le genre de défaut que `04` a
  // trouvé à la mesure.
  expect(debordements).toBe(0)
})

test('les lignes font 22 px', async ({ page }) => {
  const hauteurs = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-testid=sidebar-a4]')
    return [
      ...new Set(
        [...(sidebar?.querySelectorAll('[role=treeitem]') ?? [])].map((l) =>
          Math.round(l.getBoundingClientRect().height),
        ),
      ),
    ]
  })
  expect(hauteurs).toEqual([22])
})

test('la ligne sélectionnée porte l’aplat d’accent et son filet gauche', async ({ page }) => {
  const style = await page.evaluate(() => {
    const choisie = document
      .querySelector('[data-testid=sidebar-a4]')
      ?.querySelector('[aria-selected=true]')
    if (!choisie) return null
    const s = getComputedStyle(choisie)
    return { fond: s.backgroundColor, gauche: s.borderLeftWidth, ombre: s.boxShadow }
  })
  expect(style?.fond).not.toBe('rgba(0, 0, 0, 0)')
  // `TreeRow` de `04` porte déjà le filet : bordure ou liseré, l'un des deux doit être là.
  expect(style?.gauche !== '0px' || style?.ombre !== 'none').toBe(true)
})

// L'échec d'un dépliage ne doit pas vider l'arbre : une erreur de réseau sur une base ne fait
// pas disparaître les autres.
test('une base hors ligne affiche son échec sans masquer les autres', async ({ page }) => {
  const sidebar = page.locator('[data-testid=sidebar-a4]')
  await expect(sidebar.getByText('hôte injoignable')).toHaveCount(1)
  await expect(sidebar.getByRole('treeitem', { name: /^analytics/ })).toHaveCount(1)
  // `/orders/` seul matcherait aussi `orders_by_day` : un motif de nom accessible doit être
  // ancré, sans quoi il compte des lignes voisines. Le nom complet porte la métadonnée —
  // « orders 1.9 M » — l'espace venant de `TreeRow` depuis la correction de `09d`.
  await expect(sidebar.getByRole('treeitem', { name: /^orders 1\.9 M$/ })).toHaveCount(1)
})

test('le pied reste visible quand l’arbre déborde', async ({ page }) => {
  const visible = await page.evaluate(() => {
    const colonne = document.querySelector('[data-testid=sidebar-a4]')?.firstElementChild
    const pied = colonne?.lastElementChild
    if (!colonne || !pied) return null
    const c = colonne.getBoundingClientRect()
    const p = pied.getBoundingClientRect()
    // Le pied doit rester dans la colonne, l'arbre défilant au-dessus.
    return p.bottom <= c.bottom + 1 && p.top >= c.top
  })
  expect(visible).toBe(true)
})
