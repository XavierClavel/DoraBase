import { expect, type Page, test } from '@playwright/test'

// Ce que Vitest ne peut pas voir : la hauteur réelle des lignes, la course de la barre de
// défilement, la persistance de l'en-tête, et le rattrapage du popover au bord droit. `10a` les
// nomme — jsdom ne calcule aucune mise en page.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=virtual-grid]')
  await page.evaluate(() => document.fonts.ready)
})

const grille_ = (page: Page) => page.locator('[data-testid=virtual-grid] [role=grid]')
const viewport = (page: Page) =>
  page.locator('[data-testid=virtual-grid] [role=grid] > div').first()

test('les lignes font 26 px et l’en-tête aussi', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const racine = document.querySelector('[data-testid=virtual-grid]')
    const entete = racine?.querySelector('[role=columnheader]')
    const ligne = racine?.querySelector('[role=row][aria-rowindex="3"]')
    if (!entete || !ligne) return null
    return {
      // La hauteur **calculée**, pas le rectangle : celui-ci inclut le filet et masquerait un
      // écart d'un pixel derrière un arrondi.
      entete: getComputedStyle(entete).height,
      ligne: Math.round(ligne.getBoundingClientRect().height),
    }
  })
  expect(mesures?.entete).toBe('26px')
  expect(mesures?.ligne).toBe(26)
})

test('la barre de défilement a la course des cent mille lignes', async ({ page }) => {
  const hauteurs = await page.evaluate(() => {
    // La zone défilante, et la toile qui porte la hauteur totale. Depuis que l'en-tête vit dans
    // la zone défilante, la toile est son **second** `rowgroup`.
    const conteneur = document.querySelector('[data-testid=virtual-grid] [class*=viewport]')
    const toile = conteneur?.querySelectorAll('[role=rowgroup]')[1]
    if (!conteneur || !toile) return null
    return { visible: conteneur.clientHeight, total: toile.getBoundingClientRect().height }
  })
  // 100 000 × 26 px : c'est la toile qui porte la hauteur totale, pas les lignes montées.
  expect(hauteurs?.total).toBe(2_600_000)
  expect(hauteurs?.visible).toBe(208)
})

test('l’en-tête reste en place quand la grille défile', async ({ page }) => {
  const avant = await grille_(page).locator('[role=columnheader]').first().boundingBox()
  await viewport(page).evaluate((element) => element.scrollTo({ top: 12_000 }))

  // **Le défilement a bien changé les lignes montées** — sans quoi la mesure d'en-tête passerait
  // sur une grille immobile. En `poll`, et non en lecture sèche : les lignes se remontent au rendu
  // qui *suit* le `scrollTo`, et `getAttribute` ne réessaie pas. Sur un runner chargé, la lecture
  // arrivait donc avant le remontage et rendait l'index d'avant le défilement — un échec qui ne
  // disait rien de l'exigence mesurée, et que la reprise déguisait en test instable.
  await expect
    .poll(async () =>
      Number(await grille_(page).locator('[role=row]').nth(2).getAttribute('aria-rowindex')),
    )
    .toBeGreaterThan(400)

  // L'en-tête, mesuré **après** que le défilement a pris effet : c'est le seul moment où « il n'a
  // pas bougé » veut dire quelque chose.
  const apres = await grille_(page).locator('[role=columnheader]').first().boundingBox()
  expect(apres?.y).toBe(avant?.y)
})

test('le fond d’une ligne sélectionnée court sur toutes les colonnes, même hors écran', async ({
  page,
}) => {
  const grille = grille_(page)
  await grille.getByRole('row').nth(2).click()

  const mesures = await page.evaluate(() => {
    const g = document.querySelector('[data-testid=virtual-grid] [role=grid]')
    const ligne = g?.querySelector('[role=row][aria-selected="true"]')
    const toile = ligne?.parentElement
    const entete = g?.querySelector('[role=rowgroup]')
    if (!ligne || !toile || !entete) return null
    return {
      ligne: Math.round(ligne.getBoundingClientRect().width),
      toile: Math.round(toile.getBoundingClientRect().width),
      entete: Math.round(entete.getBoundingClientRect().width),
      visible: Math.round((toile.parentElement as HTMLElement).clientWidth),
    }
  })

  // **Le défaut du 10 août 2026** : la ligne prenait la largeur de la *fenêtre*, donc son fond
  // s'arrêtait au bord droit et disparaissait dès qu'on défilait horizontalement. Elle doit
  // couvrir la largeur du **contenu**.
  expect(mesures?.toile).toBeGreaterThan(mesures?.visible ?? 0)
  expect(mesures?.ligne).toBe(mesures?.toile)
  // L'en-tête aussi, sans quoi il cesse de désigner les colonnes sous lui.
  expect(mesures?.entete).toBe(mesures?.toile)
})

test('l’en-tête suit le défilement horizontal', async ({ page }) => {
  const premierEntete = grille_(page).getByRole('columnheader').first()
  const avant = await premierEntete.boundingBox()

  // 100 px : le défilement maximal est la largeur du contenu moins celle de la fenêtre, et
  // demander plus plafonnerait — le test mesurerait alors le plafond, pas le suivi.
  await viewport(page).evaluate((element) => element.scrollTo({ left: 100 }))

  const apres = await premierEntete.boundingBox()
  // Hors de la zone défilante, l'en-tête restait immobile et les colonnes se désalignaient.
  expect(Math.round((avant?.x ?? 0) - (apres?.x ?? 0))).toBe(100)
})

test('le popover reste visible même ancré au bord droit', async ({ page }) => {
  const zone = page.locator('[data-testid=popover-bord]')

  // Le déclencheur de gauche : le panneau s'aligne sur son bord gauche, sans déborder.
  await zone.getByRole('button', { name: 'status' }).click()
  const gauche = await zone.locator('[role=dialog]').boundingBox()
  const fenetre = await page.evaluate(() => window.innerWidth)
  expect(gauche?.x).toBeGreaterThanOrEqual(0)
  expect((gauche?.x ?? 0) + (gauche?.width ?? 0)).toBeLessThanOrEqual(fenetre)
  await page.keyboard.press('Escape')

  // Celui de droite est à une trentaine de pixels du bord : aligné à gauche, le panneau
  // sortirait de la fenêtre. C'est là que la bascule d'alignement se voit.
  //
  // `toPass` plutôt qu'une mesure unique : la position est une propriété de la mise en page
  // **stabilisée**, et une assertion sur un instant est intermittente par construction — celle-ci
  // l'a été avant d'être écrite ainsi.
  await zone.getByRole('button', { name: 'total_cents' }).click()
  await expect(async () => {
    const droite = await zone.locator('[role=dialog]').boundingBox()
    expect(droite?.x).toBeGreaterThanOrEqual(0)
    expect((droite?.x ?? 0) + (droite?.width ?? 0)).toBeLessThanOrEqual(fenetre)
  }).toPass({ timeout: 2000 })
})

test('la bande d’en-tête court jusqu’au bord, même avec peu de colonnes', async ({ page }) => {
  // **Le décor est le test.** Deux colonnes de 40 et 70 px dans un cadre de 340 : sans un décor où
  // les colonnes sont plus étroites que la grille, le défaut est invisible — c'est pourquoi la
  // galerie porte ce second cas depuis le 25 août 2026.
  // **Amenée dans la fenêtre d'abord** : la galerie est longue, cette grille vit à 3800 px du haut,
  // et `elementFromPoint` ne répond que sur ce qui est réellement à l'écran — il rendait `null`,
  // ce qui se lisait comme « rien n'est peint ».
  await page.locator('[data-testid=virtual-grid-etroite]').scrollIntoViewIfNeeded()

  const mesure = await page.evaluate(() => {
    const racine = document.querySelector('[data-testid=virtual-grid-etroite]')
    const ligne = racine?.querySelector('[role=row][aria-rowindex="1"]')
    const grille = racine?.querySelector('[role=grid]')
    if (!ligne || !grille) return null
    const boite = ligne.getBoundingClientRect()
    // Le point à peindre : **au-delà de la dernière colonne**, quatre pixels avant le bord droit.
    const x = grille.getBoundingClientRect().right - 4
    const y = boite.top + boite.height / 2
    const sous = document.elementFromPoint(x, y)
    return {
      largeurLigne: Math.round(boite.width),
      largeurGrille: Math.round(grille.getBoundingClientRect().width),
      // La couleur **peinte à cet endroit**, remontée jusqu'à l'élément qui la porte : c'est ce que
      // l'œil voit, là où une mesure de boîte ne dirait que « quelque chose est là ».
      fond: sous ? getComputedStyle(sous).backgroundColor : null,
      estDansLEntete: sous ? ligne.contains(sous) || sous === ligne : false,
    }
  })

  expect(mesure?.largeurLigne).toBe(mesure?.largeurGrille)
  expect(mesure?.estDansLEntete).toBe(true)
  // Opaque : c'est `--bar` qui doit être peint là, et non le fond de la page par transparence.
  expect(mesure?.fond).not.toBe('rgba(0, 0, 0, 0)')
})
