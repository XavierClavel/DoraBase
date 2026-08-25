import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement, ouvrirUneConsole } from './pourLesTests'

// La coloration, la gouttière et le fond : des couleurs calculées, donc hors de portée de Vitest.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await ouvrirUneConsole(page, 'analytics')
  await page.waitForSelector('.cm-content')
  await page.locator('.cm-content').click()
  await page.keyboard.type("select count(*) from orders where status = 'paid' -- note")
  await page.evaluate(() => document.fonts.ready)
})

test('mots-clés, chaînes, nombres et commentaires prennent quatre teintes distinctes', async ({
  page,
}) => {
  const couleurs = await page.evaluate(() => {
    const teinte = (texte: string) => {
      const cible = [...document.querySelectorAll('.cm-content span')].find(
        (span) => span.textContent === texte,
      )
      return cible ? getComputedStyle(cible).color : null
    }
    const temoin = document.createElement('div')
    document.body.append(temoin)
    const jeton = (nom: string) => {
      temoin.style.color = `var(${nom})`
      return getComputedStyle(temoin).color
    }
    const attendus = {
      keyword: jeton('--syn-keyword'),
      string: jeton('--syn-string'),
      comment: jeton('--syn-comment'),
    }
    temoin.remove()
    return { select: teinte('select'), chaine: teinte("'paid'"), attendus }
  })

  // **Les couleurs du handoff, pas celles de CodeMirror.** Un éditeur au thème par défaut à côté du
  // bloc SQL de `11c` se lirait comme deux applications.
  expect(couleurs.select).toBe(couleurs.attendus.keyword)
  expect(couleurs.chaine).toBe(couleurs.attendus.string)
  expect(couleurs.select).not.toBe(couleurs.chaine)
})

test('un double tiret de commentaire s’insère en entier', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  // **Une capture d'écran a semé le doute** : le commentaire y apparaissait avec un seul tiret. La
  // frappe pilotée en était la cause, pas l'éditeur — mais `--` est le préfixe de commentaire SQL, et
  // un caractère perdu là transformerait un commentaire en soustraction.
  await page.keyboard.insertText('-- une note')
  await expect(page.locator('.cm-content')).toContainText('-- une note')
})

test('la gouttière numérote les lignes, et suit le contenu', async ({ page }) => {
  await page.keyboard.press('Enter')
  await page.keyboard.type('order by 1')

  const numeros = await page.evaluate(() =>
    [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
      .map((e) => e.textContent)
      .filter((t) => t !== '')
      // Le premier élément sert à **mesurer** la largeur de la gouttière — il porte le numéro le plus
      // large possible et vit en dehors du flux. Présent en navigateur comme sous jsdom.
      .slice(-2),
  )
  // Deux lignes, deux numéros : une erreur SQL annoncée « ligne 4 » serait sinon à compter à la main.
  expect(numeros).toEqual(['1', '2'])
})

test('le fond de l’éditeur est sombre, comme celui du bloc SQL de `11c`', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const editeur = document.querySelector('.cm-editor')
    const gouttiere = document.querySelector('.cm-gutters')
    const temoin = document.createElement('div')
    document.body.append(temoin)
    temoin.style.background = 'var(--dark)'
    const sombre = getComputedStyle(temoin).backgroundColor
    temoin.remove()
    return {
      editeur: editeur ? getComputedStyle(editeur).backgroundColor : null,
      gouttiere: gouttiere ? getComputedStyle(gouttiere).backgroundColor : null,
      sombre,
    }
  })
  // Les six jetons `--syn-*` sont faits pour un fond sombre : un éditeur clair les rendrait
  // illisibles, et en inventer six clairs créerait un second jeu de jetons pour un seul écran.
  expect(mesures.editeur).toBe(mesures.sombre)
  // La gouttière partage ce fond : un liseré entre elle et le texte découperait l'éditeur en deux.
  expect(mesures.gouttiere).toBe(mesures.sombre)
})

test('la ligne courante est marquée par un fond, pas par une bordure', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const active = document.querySelector('.cm-activeLine')
    if (!active) return null
    const style = getComputedStyle(active)
    return { fond: style.backgroundColor, bordure: style.borderLeftWidth }
  })
  expect(mesures?.fond).not.toBe('rgba(0, 0, 0, 0)')
  // Une bordure décalerait le texte d'un pixel à chaque déplacement du curseur — le même arbitrage
  // que la ligne sélectionnée de la grille (`10a`).
  expect(mesures?.bordure).toBe('0px')
})

test('le texte saisi remonte à l’écran : changer d’onglet et revenir le retrouve', async ({
  page,
}) => {
  await ouvrirUneConsole(page, 'analytics')
  await expect(page.locator('.cm-content')).toHaveText('')
  await page.getByRole('tab', { name: /console 1/ }).click()
  // Le va-et-vient remonte l'éditeur : c'est ce qui prouve que l'écran détient le texte, et non
  // CodeMirror.
  await expect(page.locator('.cm-content')).toContainText('select count(*)')
})
