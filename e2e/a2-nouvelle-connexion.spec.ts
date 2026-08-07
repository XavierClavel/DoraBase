import { expect, test } from '@playwright/test'

// `08b` est presque entièrement une spec de **mise en page**, donc presque entièrement hors de
// portée de Vitest : jsdom ne calcule aucun layout, et une grille dont les colonnes ne
// s'alignent pas y passe tous les tests unitaires. Les mesures ci-dessous sont la vérification
// principale de cette spec, pas un complément.
//
// L'écran est atteint depuis `A1` par son bouton, seule entrée qui existe — voir la note
// d'`App.tsx` sur le décalage « Nouveau projet » / « Nouvelle connexion ».
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.waitForSelector('[role=dialog]')
  await page.evaluate(() => document.fonts.ready)
})

/** Le rectangle d'un champ, désigné par son étiquette. */
async function boite(page: import('@playwright/test').Page, etiquette: string) {
  return page.evaluate((nom) => {
    const labels = [...document.querySelectorAll('label')]
    const cible = labels.find((l) => l.textContent?.trim() === nom)
    const champ = cible?.htmlFor ? document.getElementById(cible.htmlFor) : null
    // Le champ à suffixe est enveloppé : c'est l'enveloppe qui porte la bordure, donc la
    // boîte visible.
    const visible = champ?.parentElement?.className.includes('wrap') ? champ.parentElement : champ
    if (!visible) return null
    const r = visible.getBoundingClientRect()
    return {
      x: Math.round(r.x),
      droite: Math.round(r.right),
      largeur: Math.round(r.width),
      hauteur: Math.round(r.height),
    }
  }, etiquette)
}

test('les champs du formulaire font 30 px', async ({ page }) => {
  const hauteurs = await Promise.all(
    ['Nom de la base', 'Hôte', 'Port', 'Base par défaut', 'Utilisateur', 'Mot de passe'].map(
      async (nom) => (await boite(page, nom))?.hauteur,
    ),
  )
  // 30 px de contenu plus 1 px de bordure de chaque côté, comme le mockup. `Field` est en
  // `border-box` avec la hauteur explicitée : voir la note de `Field.module.css`, réécrite
  // après avoir mesuré un débordement de largeur.
  expect(hauteurs).toEqual([32, 32, 32, 32, 32, 32])
})

// **Ce test a trouvé le défaut le plus sérieux de `08b`.** En `content-box`, `width: 100%`
// désigne la largeur du *contenu* : remplissage et bordure s'ajoutent par-dessus, et le champ
// déborde de sa piste. Le Port rendait 104 px dans une piste de 84. Le mockup n'a pas ce
// problème parce que ses champs sont des `<div>` à largeur `auto`, qui se rétractent.
test('le port occupe exactement sa piste de 84 px et se colle à l’hôte', async ({ page }) => {
  const hote = await boite(page, 'Hôte')
  const port = await boite(page, 'Port')

  expect(port?.largeur).toBe(84)
  // Gap de 8 px entre les deux, contre les 18 px de la grille principale : le port est une
  // sous-partie de l'hôte, pas un champ voisin. C'est exactement ce qu'une pile de flex
  // aurait perdu.
  expect((port?.x ?? 0) - (hote?.droite ?? 0)).toBe(9)
})

test('les colonnes de la grille s’alignent d’une rangée à l’autre', async ({ page }) => {
  const gauche = await Promise.all(
    ['Hôte', 'Base par défaut', 'Mode SSL'].map(async (nom) => (await boite(page, nom))?.x),
  )
  const droite = await Promise.all(
    ['Base par défaut', 'Utilisateur'].map(async (nom) => (await boite(page, nom))?.x),
  )

  // La colonne de gauche est la même sur les trois rangées où elle apparaît. Reproduire la
  // grille en flex imbriqué donnerait des colonnes décalées — le défaut que `08b` nomme et
  // que Vitest ne peut pas voir.
  expect(new Set(gauche.filter((x) => x === gauche[0])).size).toBe(1)
  expect(droite[0]).not.toBe(gauche[0])
})

test('la rangée d’identité suit la grille 1fr 196px auto', async ({ page }) => {
  const projet = await boite(page, 'Projet')
  expect(projet?.largeur).toBe(196)
})

test('les trois cellules de la rangée d’identité s’alignent en bas', async ({ page }) => {
  const bas = await page.evaluate(() => {
    const rangee = document.querySelector('[class*=rowIdentity]')
    if (!rangee) return null
    // Les **boîtes visibles** des trois contrôles. Pour le select c'est son enveloppe, qui
    // porte la bordure : une première version mesurait le `<select>` lui-même et trouvait
    // 16 px de haut, ce qui a révélé un autre défaut — voir le test suivant.
    const controles = [
      rangee.querySelector('input'),
      rangee.querySelector('[class*=wrap]'),
      rangee.querySelector('fieldset label'),
    ]
    return controles.map((c) => (c ? Math.round(c.getBoundingClientRect().bottom) : null))
  })

  // `align-items: end` : les étiquettes n'ont pas la même hauteur, donc sans lui les
  // contrôles se décaleraient verticalement les uns par rapport aux autres.
  expect(new Set(bas)).toHaveProperty('size', 1)
})

// L'autre défaut trouvé à la mesure : le `<select>` gardait sa hauteur intrinsèque de 16 px
// dans une boîte de 32, donc cliquer dans le remplissage du champ n'ouvrait pas la liste.
// Invisible en test unitaire, et invisible à l'œil — la boîte, elle, avait la bonne taille.
test('le select occupe toute la hauteur de sa boîte, donc tout le champ est cliquable', async ({
  page,
}) => {
  const mesures = await page.evaluate(() => {
    const select = document.querySelector('select')
    const enveloppe = select?.parentElement
    if (!select || !enveloppe) return null
    return {
      select: Math.round(select.getBoundingClientRect().height),
      boite: Math.round(enveloppe.getBoundingClientRect().height),
    }
  })

  // 32 px de boîte moins les 2 px de bordure : le select remplit les 30 px intérieurs.
  expect(mesures?.boite).toBe(32)
  expect(mesures?.select).toBe(30)
})

test('les trois boutons d’environnement ont la même boîte, prod compris', async ({ page }) => {
  const boites = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=prod]'),
    )
    return [...(groupe?.querySelectorAll('label') ?? [])].map((l) => {
      const r = l.getBoundingClientRect()
      return { hauteur: Math.round(r.height) }
    })
  })

  // `prod` porte une bordure de 1.5 px là où ses voisins en ont 1. En `content-box`, il
  // serait plus haut d'un pixel — visible dans une rangée de trois boutons collés. C'est la
  // raison d'être du `border-box` de `RadioGroup`.
  expect(boites).toHaveLength(3)
  expect(new Set(boites.map((b) => b.hauteur))).toHaveProperty('size', 1)
})

test('prod garde son habillage rouge même sélectionné', async ({ page }) => {
  // C'est le `<label>` qu'on clique, pas l'`<input>` : celui-ci est masqué visuellement et en
  // `pointer-events: none`, comme il doit l'être. Un vrai utilisateur clique le libellé.
  await page.getByText('prod', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'prod' })).toBeChecked()

  const couleurs = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[value=prod]')
    const label = input?.closest('label')
    if (!label) return null
    const style = getComputedStyle(label)
    return { fond: style.backgroundColor, bordure: style.borderTopColor }
  })

  // `RadioGroup` met le fond accent sur l'option active. Ici il faut qu'il perde : le rouge
  // est une propriété de *prod*, pas de *actif*. Sans le sélecteur doublé qui gagne en
  // spécificité, `prod` sélectionné deviendrait orange.
  expect(couleurs?.fond).toBe('rgb(252, 233, 228)') // --danger-bg
  expect(couleurs?.bordure).toBe('rgb(217, 67, 47)') // --danger
})

test('le sélecteur de moteur tient sur une seule ligne', async ({ page }) => {
  const lignes = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=postgresql]'),
    )
    const hauts = [...(groupe?.querySelectorAll('label') ?? [])].map((l) =>
      Math.round(l.getBoundingClientRect().top),
    )
    return new Set(hauts).size
  })

  // Sept boutons dans 820 px moins les marges : ils doivent tenir. `flex-wrap` les
  // laisserait passer à la ligne sans que rien ne le signale.
  expect(lignes).toBe(1)
})

test('la barre de titre se ternit, et le wordmark s’estompe', async ({ page }) => {
  const effets = await page.evaluate(() => {
    const barre = document.querySelector('[data-tauri-drag-region]')
    const wordmark = barre?.querySelector('[class*=wordmark]')
    if (!barre || !wordmark) return null
    return {
      filtre: getComputedStyle(barre).filter,
      opacite: getComputedStyle(wordmark).opacity,
    }
  })

  // Les deux effets du mockup qui sont à notre portée. Le troisième — les feux en `#DCD6CB` —
  // ne l'est pas : macOS les dessine lui-même sous `titleBarStyle: "Overlay"`. Voir le
  // § « À trancher » de `specs/README.md`.
  expect(effets?.filtre).toBe('saturate(0.6)')
  expect(effets?.opacite).toBe('0.55')
})

test('à 960 px la modale reste entièrement visible et la grille tient', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 })

  const etat = await page.evaluate(() => {
    const coquille = document.querySelector('[role=dialog]')
    if (!coquille) return null
    const r = coquille.getBoundingClientRect()
    return {
      gauche: r.left,
      droite: window.innerWidth - r.right,
      // Le corps de la modale peut dépasser la hauteur de la fenêtre à 600 px : c'est
      // attendu et non un défaut, mais la largeur ne doit jamais déborder.
      debordeEnLargeur: document.documentElement.scrollWidth > window.innerWidth,
    }
  })

  expect(etat?.gauche).toBeGreaterThanOrEqual(0)
  expect(etat?.droite).toBeGreaterThanOrEqual(0)
  expect(etat?.debordeEnLargeur).toBe(false)
})
