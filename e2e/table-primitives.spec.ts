import { expect, test } from '@playwright/test'

// Les trois faits vérifiés ici sont des propriétés de **mise en page**, hors de portée de
// Vitest : largeurs de colonnes, alignement des nombres, et un liseré intérieur. `09a` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('table')
  await page.evaluate(() => document.fonts.ready)
})

/** Le premier `DataTable` de la galerie, celui à sept colonnes. */
async function mesuresDuTableau(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const table = document.querySelector('table')
    if (!table) return null
    const cellule = (selecteur: string) => table.querySelector(selecteur)
    const r = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().width) : null)
    return {
      colonnes: [...table.querySelectorAll('thead th')].map((th) => r(th)),
      // La hauteur **calculée**, pas le rectangle : celui-ci inclut le filet, ce qui masquerait
      // un écart d'un pixel derrière un arrondi. Une première version mesurait le rectangle et
      // trouvait 16 là où la déclaration était tombée à `auto` — le bon chiffre était visible,
      // mais pour la mauvaise raison.
      hauteurEntete: getComputedStyle(cellule('thead th') as Element).height,
      hauteurLigne: getComputedStyle(cellule('tbody th') as Element).height,
      policeEntete: getComputedStyle(cellule('thead th') as Element).fontFamily,
      casseEntete: getComputedStyle(cellule('thead th') as Element).textTransform,
      policeNom: getComputedStyle(cellule('tbody th') as Element).fontFamily,
      policeValeur: getComputedStyle(cellule('tbody td') as Element).fontFamily,
      alignementNombre: getComputedStyle(table.querySelectorAll('tbody td')[0] as Element)
        .textAlign,
      chiffresTabulaires: getComputedStyle(table.querySelectorAll('tbody td')[0] as Element)
        .fontVariantNumeric,
    }
  })
}

test('les largeurs du colgroup sont respectées', async ({ page }) => {
  const m = await mesuresDuTableau(page)
  // 210 · 88 · 78 · 66 · 150 · 120 · auto, du mockup. `table-layout: fixed` est ce qui les rend
  // stables : sans lui, le navigateur les recalculerait d'après le contenu, et une colonne
  // changerait de largeur d'un schéma à l'autre.
  expect(m?.colonnes?.slice(0, 6)).toEqual([210, 88, 78, 66, 150, 120])
})

// `--rowh` **est** la variable de densité, et vaut 26px : le générateur aplatit `rowh.base` en
// `--rowh`. Une première version du CSS écrivait `var(--rowh-base)`, qui n'existe pas — la
// déclaration devenait invalide et l'en-tête retombait en hauteur automatique, 15px au lieu de
// 26. C'est cette mesure qui l'a attrapé, aucun test unitaire ne pouvait le voir.
test('l’en-tête et les lignes font 26 px', async ({ page }) => {
  const m = await mesuresDuTableau(page)
  expect(m?.hauteurEntete).toBe('26px')
  expect(m?.hauteurLigne).toBe('26px')
})

// Les trois points que la seule prose du handoff aurait manqués, et que sa feuille de style
// donne : en-têtes en casse normale, cellules en mono, nom en Nunito.
test('les en-têtes ne sont pas en capitales', async ({ page }) => {
  const m = await mesuresDuTableau(page)
  expect(m?.casseEntete).toBe('none')
  expect(m?.policeEntete).toContain('Nunito')
})

test('les cellules sont en mono, le nom en Nunito', async ({ page }) => {
  const m = await mesuresDuTableau(page)
  expect(m?.policeValeur).toContain('JetBrains Mono')
  expect(m?.policeNom).toContain('Nunito')
})

test('les nombres sont alignés à droite, en chiffres tabulaires', async ({ page }) => {
  const m = await mesuresDuTableau(page)
  expect(m?.alignementNombre).toBe('right')
  // Sans `tabular-nums`, la largeur variable des glyphes fait onduler une colonne de nombres.
  expect(m?.chiffresTabulaires).toContain('tabular-nums')
})

test('la ligne sélectionnée porte un liseré intérieur, pas une bordure', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const table = document.querySelector('table')
    const choisie = table?.querySelector('tr[aria-selected=true]')
    const autre = table?.querySelector('tr[aria-selected=false]')
    if (!choisie || !autre) return null
    const s = getComputedStyle(choisie)
    const premiere = choisie.querySelector('th')
    const premiereAutre = autre.querySelector('th')
    return {
      ombre: s.boxShadow,
      fond: s.backgroundColor,
      // Le contenu ne doit **pas** être décalé : c'est tout l'intérêt d'un liseré intérieur.
      xChoisie: Math.round(premiere?.getBoundingClientRect().x ?? 0),
      xAutre: Math.round(premiereAutre?.getBoundingClientRect().x ?? 0),
    }
  })

  expect(mesures?.ombre).toContain('inset')
  expect(mesures?.fond).not.toBe('rgba(0, 0, 0, 0)')
  // Une bordure de 2px aurait décalé le contenu de la ligne sélectionnée par rapport aux autres.
  expect(mesures?.xChoisie).toBe(mesures?.xAutre)
})

test('il y a des filets verticaux entre colonnes, mais pas au bord gauche', async ({ page }) => {
  const filets = await page.evaluate(() => {
    const entetes = [...(document.querySelector('table')?.querySelectorAll('thead th') ?? [])]
    return entetes.map((th) => getComputedStyle(th).borderLeftWidth)
  })

  // Le mockup pose `th + th { border-left }` : la première colonne n'en a pas.
  expect(filets[0]).toBe('0px')
  expect(filets.slice(1).every((f) => f === '1px')).toBe(true)
})

test('le contrôle segmenté fait 25 px, et son actif est sombre', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=fonctions]'),
    )
    if (!groupe) return null
    const labels = [...groupe.querySelectorAll('label')]
    const actif = labels.find((l) => l.querySelector<HTMLInputElement>('input')?.checked)
    const inactif = labels.find((l) => !l.querySelector<HTMLInputElement>('input')?.checked)
    return {
      hauteurs: labels.map((l) => Math.round(l.getBoundingClientRect().height)),
      fondActif: actif ? getComputedStyle(actif).backgroundColor : null,
      fondInactif: inactif ? getComputedStyle(inactif).backgroundColor : null,
    }
  })

  // 25 px — cinq de moins qu'un `RadioGroup`, ce qui est la première des trois raisons de ne pas
  // le réemployer.
  expect(new Set(mesures?.hauteurs)).toHaveProperty('size', 1)
  expect(mesures?.hauteurs?.[0]).toBe(25)
  // `--dark` (#23201C) et non l'accent : l'accent dit « ce que vous avez choisi de faire »,
  // l'encre « ce que vous regardez ».
  expect(mesures?.fondActif).toBe('rgb(35, 32, 28)')
  expect(mesures?.fondInactif).toBe('rgb(255, 255, 255)')
})
