import { expect, test } from '@playwright/test'

// Largeur du panneau, largeur des étiquettes, bouton pleine largeur : de la mise en page, donc
// hors de portée de Vitest. `10f` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
  // Sélectionner la première ligne : le panneau ne se remplit pas sans elle.
  await page.getByRole('grid').getByRole('row').nth(2).click()
  await page.waitForSelector('[aria-label="Détail de la ligne 1"]')
})

test('le panneau fait 296 px, ses étiquettes 96, et l’en-tête du cadre 34', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const panneau = document.querySelector('[aria-label="Détail de la ligne 1"]')
    const etiquette = panneau?.querySelector('dt')
    // **L'en-tête n'est plus dans le panneau** : il appartient au cadre de la colonne depuis `22`,
    // pour survivre à la bascule de vue et au panneau des modifications. Sa mesure reste celle du
    // mockup — c'est la même barre, elle a changé de contenu, pas de hauteur.
    const entete = document.querySelector('[role=separator] ~ * header')
    if (!panneau || !etiquette || !entete) return null
    return {
      // La largeur **calculée** : le rectangle inclurait le filet gauche.
      panneau: getComputedStyle(panneau).width,
      etiquette: getComputedStyle(etiquette).width,
      entete: getComputedStyle(entete).height,
    }
  })
  expect(mesures?.panneau).toBe('296px')
  expect(mesures?.etiquette).toBe('96px')
  expect(mesures?.entete).toBe('34px')
})

test('l’aperçu de ligne liée apparaît et nomme ses champs détectés', async ({ page }) => {
  // `users` porte `email` et `name` : deux champs de la liste blanche du handoff.
  await expect(page.getByText(/Ligne liée · users/)).toBeVisible()
  await expect(page.getByText(/email, name détectés/)).toBeVisible()
  await expect(page.getByText('marie.l@example.com')).toBeVisible()
})

test('le bouton « Copier la ligne en INSERT » occupe toute la largeur', async ({ page }) => {
  const bouton = page.getByRole('button', { name: /Copier la ligne en INSERT/ })
  await expect(bouton).toBeVisible()

  const mesures = await page.evaluate(() => {
    const panneau = document.querySelector('[aria-label="Détail de la ligne 1"]')
    const corps = panneau?.querySelector('[class*="corps"]')
    const b = panneau?.querySelector('[class*="copier"]')
    if (!corps || !b) return null
    return {
      corps: Math.round(corps.clientWidth),
      bouton: Math.round(b.getBoundingClientRect().width),
      hauteur: Math.round(b.getBoundingClientRect().height),
    }
  })
  // Le padding du corps est déjà retiré par `clientWidth` du conteneur en `flex-direction:
  // column` : le bouton doit donc l'occuper entièrement.
  expect(mesures?.bouton).toBe((mesures?.corps ?? 0) - 22)
  // 27 px déclarés + 2 de bordure, `content-box` comme partout dans ce projet.
  expect(mesures?.hauteur).toBe(29)
})

test('les trois onglets rendent trois contenus distincts', async ({ page }) => {
  const panneau = page.getByLabel('Détail de la ligne 1')

  await expect(panneau.locator('dl')).toBeVisible()

  await page.getByRole('tab', { name: 'JSON' }).click()
  await expect(panneau.locator('pre')).toContainText('"total_cents"')
  await expect(panneau.locator('dl')).toHaveCount(0)

  // Le JSON est **coloré** : quatre couleurs du handoff, dont les jetons existaient depuis `02`
  // sans avoir jamais servi. Une clé et une chaîne ne doivent pas se rendre pareil.
  const couleurs = await page.evaluate(() => {
    const pre = document.querySelector('[aria-label^="Détail de la ligne"] pre')
    const spans = [...(pre?.querySelectorAll('span') ?? [])]
    const cle = spans.find((s) => s.textContent?.startsWith('"id"'))
    const nombre = spans.find((s) => s.textContent === '184220')
    if (!cle || !nombre) return null
    return { cle: getComputedStyle(cle).color, nombre: getComputedStyle(nombre).color }
  })
  expect(couleurs?.cle).not.toBe(couleurs?.nombre)

  await page.getByRole('tab', { name: 'Liens' }).click()
  await expect(panneau.getByText('user_id → users.id')).toBeVisible()
  await expect(panneau.locator('pre')).toHaveCount(0)
})

test('le bouton de copie du JSON ne recouvre ni le texte ni la barre de défilement', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'JSON' }).click()
  const bouton = page.getByRole('button', { name: 'Copier le JSON de la ligne' })
  await expect(bouton).toBeVisible()

  const mesures = await page.evaluate(() => {
    const bouton = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'Copier le JSON de la ligne',
    )
    const bloc = document.querySelector('[aria-label="Détail de la ligne 1"] pre')
    if (!bouton || !bloc) return null
    const boite = bouton.getBoundingClientRect()
    const dessus = document.elementFromPoint(boite.x + boite.width / 2, boite.y + boite.height / 2)
    return {
      // **Le point, pas le rectangle.** Un bouton posé sur du texte peut avoir les bonnes coordonnées
      // et se retrouver *sous* le bloc : c'est la leçon de la gouttière de `11b`, où une mesure de
      // position validait un élément inatteignable.
      cliquable: bouton.contains(dessus) || dessus === bouton,
      // Il reste à l'intérieur du panneau, et à l'écart du bord droit où se posent les curseurs de
      // défilement — huit pixels, sinon c'est le curseur qu'on attrape en visant le bouton.
      ecartDuBordDroit: Math.round(bloc.getBoundingClientRect().right - boite.right),
      opaque: getComputedStyle(bouton).backgroundColor,
    }
  })

  expect(mesures?.cliquable).toBe(true)
  expect(mesures?.ecartDuBordDroit).toBeGreaterThanOrEqual(8)
  // Opaque : posé **sur** du texte, un fond translucide laisse lire des accolades au travers de
  // l'icône.
  expect(mesures?.opaque).not.toBe('rgba(0, 0, 0, 0)')
})
