import { expect, test } from '@playwright/test'

// **Ce test part de `/`, pas de `?gallery`.** C'est le point de `10b` : `A4` était vérifié pièce
// par pièce en galerie et n'avait jamais été vu entier dans l'application. Un écran qu'on ne
// peut atteindre qu'en galerie n'est pas livré.
//
// `?demo` fournit des données figées, faute de pont Tauri sous Chromium — même montage à deux
// conditions que la galerie, donc absent du bundle de production.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  await page.evaluate(() => document.fonts.ready)
})

test('la coquille a les dimensions du mockup', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const barre = document.querySelector('[data-tauri-drag-region]')
    // Le panneau de gauche du `SplitPane` extérieur : c'est lui qui porte la largeur, la
    // sidebar étant en variante `fill`. Le mesurer sur la sidebar elle-même mesurerait une
    // largeur qu'elle ne décide plus.
    const separateurs = [...document.querySelectorAll('[role=separator]')]
    const sidebar = separateurs[0]?.previousElementSibling?.getBoundingClientRect()
    const bande = document.querySelector('[role=tablist]')?.parentElement?.parentElement
    return {
      // La hauteur **calculée**, pas le rectangle : celui-ci inclut le filet bas et rendrait 41
      // là où la déclaration — et le mockup — disent 40.
      titre: barre ? getComputedStyle(barre).height : null,
      sidebar: sidebar ? Math.round(sidebar.width) : null,
      // Comme la barre de titre : la hauteur calculée, le filet bas en plus dans le rectangle.
      bande: bande ? getComputedStyle(bande).height : null,
      poignees: [...document.querySelectorAll('[role=separator]')].map((p) =>
        Math.round(p.getBoundingClientRect().width),
      ),
    }
  })

  expect(mesures.titre).toBe('40px')
  expect(mesures.sidebar).toBe(212)
  expect(mesures.bande).toBe('34px')
  // Deux poignées de 5 px : sidebar | centre, et centre | panneau de détail.
  expect(mesures.poignees).toEqual([5, 5])
})

test('ouvrir une table depuis l’arbre ouvre un onglet, et la sidebar liste ses colonnes', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()

  await expect(page.getByRole('tab', { name: /orders/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Colonnes de orders')).toBeVisible()
  // Dans la **sidebar** : depuis `10c`, le même nom apparaît aussi en en-tête de la grille.
  await expect(page.locator('section').getByText('total_cents')).toBeVisible()
})

test('les trois colonnes se partagent la largeur, et la grille en garde l’essentiel', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')

  // **Le défaut que ce test verrouille** : le `SplitPane` ne dimensionnait que son panneau de
  // gauche, donc le centre recevait 296 px et la grille tombait à **zéro** pixel de large. Aucun
  // test ne mesurait le centre — chacun vérifiait la colonne qui l'intéressait.
  const mesures = await page.evaluate(() => {
    const separateurs = [...document.querySelectorAll('[role=separator]')]
    const grille = document.querySelector('[role=grid]')
    const panneau = document.querySelector('aside[aria-label^="Détail de la ligne"]')
    return {
      sidebar: Math.round(
        separateurs[0]?.previousElementSibling?.getBoundingClientRect().width ?? 0,
      ),
      grille: Math.round(grille?.getBoundingClientRect().width ?? 0),
      panneau: Math.round(panneau?.getBoundingClientRect().width ?? 0),
      fenetre: window.innerWidth,
    }
  })

  expect(mesures.sidebar).toBe(212)
  expect(mesures.panneau).toBe(296)
  // Le centre prend tout le reste : la fenêtre moins les deux colonnes, les deux poignées et les
  // filets. Une valeur exacte serait fragile ; ce qui compte est qu'elle soit large.
  expect(mesures.grille).toBeGreaterThan(700)
})

test('la barre d’état court sur toute la largeur, sous les trois colonnes', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=status]')

  const mesures = await page.evaluate(() => {
    const barre = document.querySelector('[role=status]')?.getBoundingClientRect()
    const panneau = document
      .querySelector('aside[aria-label^="Détail de la ligne"]')
      ?.getBoundingClientRect()
    return {
      largeur: Math.round(barre?.width ?? 0),
      fenetre: window.innerWidth,
      // La barre est **sous** le panneau droit, pas à côté : c'est ce que le mockup montre.
      sousLePanneau: (barre?.top ?? 0) >= (panneau?.bottom ?? Number.POSITIVE_INFINITY) - 1,
    }
  })
  expect(mesures.largeur).toBe(mesures.fenetre)
  expect(mesures.sousLePanneau).toBe(true)
})

test('avec beaucoup d’onglets, la bande défile et ne recouvre pas « Données »', async ({
  page,
}) => {
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()

  // Ouvrir toutes les tables du schéma : assez pour déborder de la bande.
  for (const nom of [
    /^orders 1\.9/,
    /flyway_schema_history/,
    /catalogue_session/,
    /intervals_connection/,
    /prescribed_session/,
    /order_items/,
    /^users/,
  ]) {
    await page.getByRole('treeitem', { name: nom }).click()
  }
  await expect(page.getByRole('tab')).toHaveCount(7)

  const recouvrement = await page.evaluate(() => {
    const bande = document.querySelector('[role=tablist]')
    const vues = document.querySelector('[aria-current="page"]')
    const enveloppe = bande?.parentElement
    if (!bande || !vues || !enveloppe) return null

    // **Le recouvrement se mesure au point, pas au rectangle.** `getBoundingClientRect` rend la
    // géométrie réelle d'un élément même découpé par un `overflow`, et l'enveloppe, elle, reste
    // toujours dans ses bornes : deux premières versions de ce test étaient vertes sans le
    // correctif. Ce qui compte est **ce qui se trouve sous le pixel** où « Données » s'affiche.
    const boite = vues.getBoundingClientRect()
    const dessus = document.elementFromPoint(
      Math.round(boite.left + boite.width / 2),
      Math.round(boite.top + boite.height / 2),
    )

    return {
      recouvertParUnOnglet: bande.contains(dessus),
      // Le cas est bien exercé : sans débordement, il n'y a rien à recouvrir.
      deborde: bande.scrollWidth > enveloppe.clientWidth,
    }
  })

  expect(recouvrement?.deborde).toBe(true)
  expect(recouvrement?.recouvertParUnOnglet).toBe(false)
  await expect(page.getByText('Données')).toBeVisible()
})

test('fermer le dernier onglet laisse l’écran de travail debout', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.getByRole('button', { name: 'Fermer orders' }).click()

  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})
