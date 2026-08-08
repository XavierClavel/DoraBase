import { expect, test } from '@playwright/test'

// Largeurs de colonnes, alignements et débordement sont hors de portée de jsdom. `09e` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=centre-a4]')
  await page.evaluate(() => document.fonts.ready)
})

test('la barre de fil d’Ariane fait 34 px, le champ de filtre 210', async ({ page }) => {
  const m = await page.evaluate(() => {
    const centre = document.querySelector('[data-testid=centre-a4]')
    const barre = centre?.firstElementChild
    const champ = centre?.querySelector('input')?.parentElement
    if (!barre || !champ) return null
    return {
      barre: Math.round(barre.getBoundingClientRect().height),
      champ: Math.round(champ.getBoundingClientRect().width),
      hauteurChamp: Math.round(champ.getBoundingClientRect().height),
    }
  })
  expect(m?.barre).toBe(34)
  expect(m?.champ).toBe(210)
  expect(m?.hauteurChamp).toBe(25)
})

test('le tableau du centre suit les largeurs du colgroup', async ({ page }) => {
  const largeurs = await page.evaluate(() => {
    const table = document.querySelector('[data-testid=centre-a4] table')
    return [...(table?.querySelectorAll('thead th') ?? [])].map((th) =>
      Math.round(th.getBoundingClientRect().width),
    )
  })
  expect(largeurs.slice(0, 6)).toEqual([210, 88, 78, 66, 150, 120])
})

// Le mockup emploie `table-layout: fixed` : la dernière colonne prend ce qui reste, et le
// tableau ne déborde pas quel que soit le contenu.
test('le tableau ne déborde pas à 960 px de fenêtre', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 })
  const deborde = await page.evaluate(() => {
    const centre = document.querySelector('[data-testid=centre-a4]')
    const table = centre?.querySelector('table')
    if (!centre || !table) return null
    return table.getBoundingClientRect().right > centre.getBoundingClientRect().right + 1
  })
  // 960 px est le minimum déclaré dans `tauri.conf.json` : à vérifier, non à supposer.
  expect(deborde).toBe(false)
})

test('le fil d’Ariane met son dernier segment en avant', async ({ page }) => {
  const m = await page.evaluate(() => {
    const fil = document.querySelector('[data-testid=centre-a4] nav')
    const dernier = fil?.querySelector('span:last-child')
    if (!fil || !dernier) return null
    return {
      chemin: getComputedStyle(fil).color,
      courant: getComputedStyle(dernier).color,
      graisse: getComputedStyle(dernier).fontWeight,
    }
  })
  // Le dernier segment est celui qu'on regarde : encre pleine et graisse 700, quand le reste du
  // chemin reste en encre secondaire.
  expect(m?.courant).not.toBe(m?.chemin)
  expect(m?.graisse).toBe('700')
})

test('le contrôle segmenté reste à droite quand le fil d’Ariane s’allonge', async ({ page }) => {
  const aDroite = await page.evaluate(() => {
    const barre = document.querySelector('[data-testid=centre-a4]')?.firstElementChild
    const fil = barre?.querySelector('nav')
    const segments = barre?.querySelector('fieldset')
    if (!fil || !segments) return null
    return segments.getBoundingClientRect().left > fil.getBoundingClientRect().right
  })
  expect(aDroite).toBe(true)
})

test('les trois états vides sont trois textes distincts', async ({ page }) => {
  const textes = await page.evaluate(() => {
    const cellules = [...document.querySelectorAll('[class*=cell]')]
      .map((c) => c.querySelector('[class*=empty]')?.textContent?.trim())
      .filter(Boolean)
    return [...new Set(cellules)]
  })
  // Aucun ne doit ressembler aux deux autres : le handoff n'en maquette aucun des trois.
  expect(textes.length).toBeGreaterThanOrEqual(3)
})
