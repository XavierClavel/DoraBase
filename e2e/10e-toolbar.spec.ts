import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// Hauteurs, alignement des chips et débordement du panneau SQL : de la mise en page, donc hors
// de portée de Vitest. `10e` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

test('la toolbar fait 36 px et ses contrôles 25', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    // La barre **de la table** : « Rafraîchir » existe aussi dans le pied de la sidebar.
    const barre = document.querySelector('[role=toolbar][aria-label="Outils de la table"]')
    const rafraichir = barre?.querySelector('[aria-label="Rafraîchir"]')
    if (!barre || !rafraichir) return null
    return {
      barre: getComputedStyle(barre).height,
      bouton: Math.round(rafraichir.getBoundingClientRect().height),
    }
  })
  expect(mesures?.barre).toBe('36px')
  // 25 px déclarés + 2 de bordure : `--h-btn-sm` est une hauteur de contenu, comme partout
  // ailleurs dans ce projet.
  expect(mesures?.bouton).toBe(27)
})

test('le panneau SQL s’ouvre sans sortir de la fenêtre', async ({ page }) => {
  await page.getByRole('button', { name: /Voir le SQL/ }).click()
  const panneau = page.getByRole('dialog', { name: 'SQL exécuté' })
  await expect(panneau).toContainText('select * from public.orders limit 500')

  const boite = await panneau.boundingBox()
  const largeur = await page.evaluate(() => window.innerWidth)
  expect(boite?.x).toBeGreaterThanOrEqual(0)
  expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur)
})

test('masquer une colonne la retire de la grille', async ({ page }) => {
  // L'en-tête de nom, pas la cellule de filtre — les deux sont des `columnheader`.
  const entete = page.getByRole('button', { name: 'Trier par currency' })
  await expect(entete).toBeVisible()

  await page.getByRole('button', { name: 'Colonnes affichées' }).click()
  await page.getByRole('dialog', { name: 'Colonnes affichées' }).getByText('currency').click()

  await expect(page.getByRole('button', { name: 'Trier par currency' })).toHaveCount(0)
  // 8 sur 9 : le décor de démo porte une neuvième colonne depuis `10f`, dont la valeur ne tient pas
  // dans le panneau de ligne — c'est ce qui rend l'ellipse et l'aperçu mesurables. Un compte en dur
  // dans un test est un lien vers le décor, et il faut le suivre quand le décor change.
  await expect(page.getByRole('button', { name: 'Colonnes affichées' })).toContainText('8/9')
})

test('un filtre actif produit un chip d’accent, distinct du chip de tri', async ({ page }) => {
  await page.getByLabel('Filtrer status').fill('paid')
  await page.getByLabel('Filtrer status').press('Enter')
  await page.getByRole('button', { name: 'Trier par created_at' }).click()

  const filtre = page.getByText('status = paid')
  const tri = page.getByText('created_at asc')
  await expect(filtre).toBeVisible()
  await expect(tri).toBeVisible()

  const fondFiltre = await filtre.evaluate((e) => getComputedStyle(e).backgroundColor)
  const fondTri = await tri.evaluate((e) => getComputedStyle(e).backgroundColor)
  expect(fondFiltre).not.toBe(fondTri)
})

// L'animation du bouton « Rafraîchir », mesurée dans la galerie : la démo répond
// instantanément, donc l'état d'attente n'y est jamais observable, et jsdom ne calcule aucune
// animation. C'est le seul endroit où cette garantie tient.
test.describe('l’attente du rafraîchissement', () => {
  const animation = (page: import('@playwright/test').Page, testid: string) =>
    page.evaluate((id) => {
      const bouton = document
        .querySelector(`[data-testid=${id}]`)
        ?.querySelector('button[aria-label=Rafraîchir]')
      const icone = bouton?.querySelector('svg')
      if (!bouton || !icone) return null
      const style = getComputedStyle(icone)
      return {
        nom: style.animationName,
        duree: style.animationDuration,
        inerte: (bouton as HTMLButtonElement).disabled,
        occupe: bouton.getAttribute('aria-busy'),
      }
    }, testid)

  test('le bouton tourne et devient inerte pendant la relecture', async ({ page }) => {
    await page.goto('/?gallery')
    await page.waitForSelector('[data-testid=toolbar-en-cours]')

    const enCours = await animation(page, 'toolbar-en-cours')
    expect(enCours?.nom).not.toBe('none')
    expect(enCours?.duree).toBe('0.9s')
    // **Les deux vont ensemble** : un bouton qui tourne mais reste cliquable lance trois relectures
    // dont deux pour rien.
    expect(enCours?.inerte).toBe(true)
    expect(enCours?.occupe).toBe('true')

    // Au repos, rien ne tourne — sans quoi la mesure ci-dessus ne dirait rien.
    const repos = await animation(page, 'toolbar-repos')
    expect(repos?.nom).toBe('none')
    expect(repos?.inerte).toBe(false)
  })

  test('sous prefers-reduced-motion, le mouvement part et l’information reste', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/?gallery')
    await page.waitForSelector('[data-testid=toolbar-en-cours]')

    const enCours = await animation(page, 'toolbar-en-cours')
    // Ignorer ce réglage est un défaut d'accessibilité, pas un choix esthétique.
    expect(enCours?.nom).toBe('none')
    // L'état demeure lisible sans elle : c'est ce qui rend le retrait acceptable.
    expect(enCours?.inerte).toBe(true)
    expect(enCours?.occupe).toBe('true')
  })
})
