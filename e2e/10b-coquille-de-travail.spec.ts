import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement, ouvrirUneConsole } from './pourLesTests'

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
  // **Un clic avant de mesurer, et c'est la coquille elle-même qui le demande** : sans sélection, le
  // corps ne montre ni bande d'onglets ni colonne de droite — donc ni la seconde poignée, ni la
  // hauteur de bande que ce test vérifie. Cliquer le projet suffit à donner un sujet à l'écran.
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
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
      // La zone attrapable, elle, déborde : c'est un pseudo-élément, donc invisible aux mesures de
      // boîte. Elle se constate au point (voir la spec du séparateur dans `geometrie-reelle`).
      saisie: [...document.querySelectorAll('[role=separator]')].map((p) => {
        const boite = p.getBoundingClientRect()
        const gauche = document.elementFromPoint(boite.left - 2, boite.top + 40)
        const droite = document.elementFromPoint(boite.right + 2, boite.top + 40)
        return [p.contains(gauche) || gauche === p, p.contains(droite) || droite === p]
      }),
    }
  })

  expect(mesures.titre).toBe('40px')
  // **228 et non 212, et c'est le cinquième palier de l'arbre qui les demande** (`25a`). La taille par
  // défaut du `SplitPane` suit la colonne de `A4`, passée de 252 à 268 px de contenu : le palier le
  // plus profond y a gagné les 16 px que son indentation lui prenait. Le plancher suit aussi — 196 au
  // lieu de 180 — parce qu'à 180 un objet du palier 4 laisse cinq caractères, formellement correct et
  // illisible.
  expect(mesures.sidebar).toBe(228)
  expect(mesures.bande).toBe('34px')
  // **Deux poignées d'un pixel, et non de cinq.** Elles en faisaient cinq, transparents : entre une
  // sidebar en `--paper-alt` et un centre en `--paper`, ces cinq pixels dessinaient une bande claire
  // avec le trait perdu au milieu. La poignée **est** le trait désormais, et ce qu'on attrape déborde
  // sans rien occuper.
  expect(mesures.poignees).toEqual([1, 1])
  // Trois pixels de part et d'autre restent attrapables : viser un trait d'un pixel relèverait de
  // l'adresse.
  expect(mesures.saisie).toEqual([
    [true, true],
    [true, true],
  ])
})

test('ouvrir une table depuis l’arbre ouvre un onglet, et la sidebar liste ses colonnes', async ({
  page,
}) => {
  await deplierUnEnvironnement(page)
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
  await deplierUnEnvironnement(page)
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
    // **La colonne de droite se mesure par sa poignée**, comme la sidebar juste au-dessus : depuis
    // `22`, son cadre est une mise en page sans nom accessible — et le panneau de ligne qu'elle
    // contenait n'existe pas tant qu'aucune ligne n'est sélectionnée.
    return {
      sidebar: Math.round(
        separateurs[0]?.previousElementSibling?.getBoundingClientRect().width ?? 0,
      ),
      grille: Math.round(grille?.getBoundingClientRect().width ?? 0),
      panneau: Math.round(separateurs[1]?.nextElementSibling?.getBoundingClientRect().width ?? 0),
      fenetre: window.innerWidth,
    }
  })

  expect(mesures.sidebar).toBe(228)
  expect(mesures.panneau).toBe(296)
  // Le centre prend tout le reste : la fenêtre moins les deux colonnes, les deux poignées et les
  // filets. Une valeur exacte serait fragile ; ce qui compte est qu'elle soit large.
  expect(mesures.grille).toBeGreaterThan(700)
})

test('la barre d’état court sur toute la largeur, sous les trois colonnes', async ({ page }) => {
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=status]')

  const mesures = await page.evaluate(() => {
    const barre = document.querySelector('[role=status]')?.getBoundingClientRect()
    const separateurs = [...document.querySelectorAll('[role=separator]')]
    const panneau = separateurs[1]?.nextElementSibling?.getBoundingClientRect()
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

test('avec beaucoup d’onglets, la bande défile et le couple de vues reste atteignable', async ({
  page,
}) => {
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()

  // Ouvrir toutes les tables du schéma : assez pour déborder de la bande.
  for (const nom of [
    /^orders 1\.9/,
    /shipment_batches/,
    /inventory_movements/,
    /pricing_rules/,
    /audit_events/,
    /order_items/,
    /^users/,
  ]) {
    await page.getByRole('treeitem', { name: nom }).click()
  }
  // **Puis trois consoles, et c'est un fait sur la largeur.** Sept onglets débordaient de la bande
  // tant que le couple « Données / Structure » lui prenait 180 px sur la droite ; depuis `22`, la
  // bande occupe toute la largeur du centre et sept onglets y tiennent. Le cas à exercer étant le
  // débordement, il faut donc de quoi déborder — sans quoi ce test se vérifierait lui-même.
  for (let i = 0; i < 3; i++) {
    await ouvrirUneConsole(page, 'analytics')
  }
  await expect(page.getByRole('tab')).toHaveCount(10)
  // Une console masque le couple (décision de `12a`) : on revient sur une table pour le mesurer.
  await page.getByRole('tab', { name: /orders/ }).click()

  const mesures = await page.evaluate(() => {
    const bande = document.querySelector('[role=tablist]')
    const enveloppe = bande?.parentElement
    const vues = [...document.querySelectorAll('button')].find(
      (bouton) => bouton.textContent?.trim() === 'Données',
    )
    if (!bande || !enveloppe || !vues) return null

    // **Le recouvrement se mesure au point, pas au rectangle.** `getBoundingClientRect` rend la
    // géométrie réelle d'un élément même découpé par un `overflow` : deux premières versions de ce
    // test étaient vertes sans le correctif. Ce qui compte est **ce qui se trouve sous le pixel** où
    // « Données » s'affiche.
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

  // **Ce que ce test verrouillait, et ce qu'il verrouille maintenant.** « Données » était à droite de
  // la bande d'onglets, et sept onglets ouverts passaient **par-dessus** — `TabStrip` portait
  // `flex: none`, juste dans son contexte et faux dans celui-là. Depuis `22`, le couple est dans une
  // autre colonne : le recouvrement est devenu structurellement impossible, et ce test le constate
  // plutôt que de disparaître — c'est la garantie qui compte, pas le mécanisme qui la tenait.
  expect(mesures?.deborde).toBe(true)
  expect(mesures?.recouvertParUnOnglet).toBe(false)
  await expect(page.getByRole('button', { name: 'Données' })).toBeVisible()
})

test('fermer le dernier onglet laisse l’écran de travail debout', async ({ page }) => {
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.getByRole('button', { name: 'Fermer orders' }).click()

  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
})

// **L'état vide du corps, mesuré là où il se voit.** jsdom dit que le texte est présent ; il ne dit
// pas que le corps n'a plus qu'une seule poignée, ni que le message occupe la place que le centre et
// la colonne de droite se partageaient.
test('sans sélection, le corps n’a qu’une poignée et montre le message', async ({ page }) => {
  await expect(page.getByText('Sélectionner une entité pour commencer')).toBeVisible()
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.locator('[role=separator]')).toHaveCount(1)

  const mesures = await page.evaluate(() => {
    const separateur = document.querySelector('[role=separator]')
    const zone = separateur?.nextElementSibling?.getBoundingClientRect()
    return { zone: Math.round(zone?.width ?? 0), fenetre: window.innerWidth }
  })
  // Tout ce qui reste après la sidebar et sa poignée : la zone vide n'est pas un panneau parmi
  // d'autres, elle est le corps entier.
  expect(mesures.zone).toBe(mesures.fenetre - 228 - 1)

  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await expect(page.getByText('Sélectionner une entité pour commencer')).toHaveCount(0)
  await expect(page.locator('[role=separator]')).toHaveCount(2)
})
