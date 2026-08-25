import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// La largeur du panneau, la coloration et le repli du SQL : de la mise en page. `11c` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.keyboard.press('Meta+e')
  await page.getByRole('button', { name: 'Modifier status' }).nth(1).click()
  const champ = page.getByLabel('Nouvelle valeur')
  await champ.fill('shipped')
  await champ.press('Enter')
  await page.waitForSelector('[aria-label="Modifications en attente de la table"]')
  await page.evaluate(() => document.fonts.ready)
})

test('le panneau remplace le détail et occupe la place du mockup', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const panneau = document.querySelector('[aria-label="Modifications en attente de la table"]')
    if (!panneau) return null
    return {
      largeur: Math.round(panneau.getBoundingClientRect().width),
      detailPresent: document.querySelector('[aria-label="Détail de la ligne"]') !== null,
    }
  })
  // **Un seul panneau droit** (`10f`) : le détail cède la place, il ne se superpose pas.
  expect(mesures?.detailPresent).toBe(false)
  // **296 px, et non les 330 du mockup de `A6`.** La largeur du panneau droit est réglable et
  // mémorisée (`SplitPane`, `storageKey`) : la faire sauter de 34 px à l'apparition des
  // modifications reprendrait le défaut écarté pour la sidebar en `10b`, où le handoff donne 252 px
  // à `A4` et 212 aux écrans de travail. Un mockup figé ne peut pas exprimer une colonne que
  // l'utilisateur déplace. Écart consigné dans `specs/11c`.
  expect(mesures?.largeur).toBeGreaterThanOrEqual(290)
})

test('le SQL est coloré, et BEGIN se distingue des instructions', async ({ page }) => {
  const couleurs = await page.evaluate(() => {
    const bloc = document.querySelector('[aria-label="Modifications en attente de la table"] pre')
    if (!bloc) return null
    const trouve = (texte: string) =>
      [...bloc.querySelectorAll('span')].find((span) => span.textContent === texte)
    const begin = trouve('BEGIN')
    const update = trouve('UPDATE')
    const chaine = [...bloc.querySelectorAll('span')].find((span) =>
      span.textContent?.startsWith("'"),
    )
    return {
      fondSombre: getComputedStyle(bloc).backgroundColor,
      begin: begin ? getComputedStyle(begin).color : null,
      update: update ? getComputedStyle(update).color : null,
      chaine: chaine ? getComputedStyle(chaine).color : null,
    }
  })
  // Les jetons `--syn-*` sont faits pour un fond sombre, ce qui confirme que le mockup en attend un.
  expect(couleurs?.fondSombre).not.toBe('rgba(0, 0, 0, 0)')
  // Trois teintes distinctes : les bornes de la transaction ne sont pas des instructions, et une
  // chaîne n'est pas un mot-clé.
  expect(couleurs?.begin).not.toBe(couleurs?.update)
  expect(couleurs?.chaine).not.toBe(couleurs?.update)
})

test('un SQL long se replie au lieu de déborder du panneau', async ({ page }) => {
  const deborde = await page.evaluate(() => {
    const panneau = document.querySelector('[aria-label="Modifications en attente de la table"]')
    const bloc = panneau?.querySelector('pre')
    if (!panneau || !bloc) return null
    // Un `UPDATE` avec des identifiants cités dépasse largement 330 px : sans repli, le panneau
    // gagnerait une barre de défilement horizontale que le mockup ne montre pas.
    return bloc.scrollWidth > Math.ceil(bloc.clientWidth) + 1
  })
  expect(deborde).toBe(false)
})

test('le diff barre l’ancienne valeur et distingue les deux états', async ({ page }) => {
  const styles = await page.evaluate(() => {
    const carte = document.querySelector('[aria-label="Modifications en attente de la table"] li')
    // **Par classe, pas par contenu.** Une première version filtrait sur `/paid|shipped/` et ne
    // trouvait rien : la ligne du décor valait `pending`. Un test qui dépend d'une valeur du décor
    // mesure le décor.
    const jetons = [...(carte?.querySelectorAll('[class*=jeton]') ?? [])]
    if (jetons.length < 2) return null
    return jetons.map((jeton) => {
      const style = getComputedStyle(jeton)
      return { barre: style.textDecorationLine, fond: style.backgroundColor }
    })
  })
  const [avant, apres] = styles ?? []
  // **La barre redouble la couleur** : rouge et vert sont indiscernables pour une part des
  // utilisateurs, et « avant / après » ne doit pas tenir qu'à la teinte.
  expect(avant?.barre).toContain('line-through')
  expect(apres?.barre).not.toContain('line-through')
  expect(avant?.fond).not.toBe(apres?.fond)
})
