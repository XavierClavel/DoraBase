import { expect, test } from '@playwright/test'

// Les faits vérifiés ici sont des propriétés de **mise en page et de superposition**, hors de
// portée de Vitest : jsdom ne calcule aucun layout et n'a pas de pile de superposition, donc
// y mesurer une largeur ou vérifier qu'un voile recouvre quelque chose renvoie zéro ou rien.
//
// `08a` les nomme explicitement : la superposition, la taille de la coquille et le centrage
// de la sous-modale.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-depth]')
  await page.evaluate(() => document.fonts.ready)
})

async function ouvrirA2(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Ouvrir la modale A2' }).click()
  await page.waitForSelector('[role=dialog]')
}

test('la coquille de A2 fait 820 px et reste alignée en haut à 34 px', async ({ page }) => {
  await ouvrirA2(page)

  const mesures = await page.evaluate(() => {
    const coquille = document.querySelector('[role=dialog]')
    if (!coquille) return null
    const boite = coquille.getBoundingClientRect()
    return { largeur: Math.round(boite.width), haut: Math.round(boite.top) }
  })

  // 820 px de contenu plus 1 px de bordure de chaque côté : le mockup déclare
  // `width:820px` sans `box-sizing`, donc en `content-box`.
  expect(mesures?.largeur).toBe(822)
  // `A2` aligne la modale en haut à 34 px — **pas** centrée verticalement. C'est le genre
  // d'écart qu'une relecture de CSS laisse passer et qu'une mesure attrape.
  expect(mesures?.haut).toBe(34)
})

test('le voile recouvre toute la fenêtre', async ({ page }) => {
  await ouvrirA2(page)

  const couvre = await page.evaluate(() => {
    const voile = document.querySelector('[data-testid=veil]')
    if (!voile) return null
    const boite = voile.getBoundingClientRect()
    return (
      Math.round(boite.width) === window.innerWidth &&
      Math.round(boite.height) === window.innerHeight
    )
  })

  expect(couvre).toBe(true)
})

// Le fait qui justifie de ne pas employer `<dialog>` : `A3` superpose **deux** voiles, et la
// pile de superposition (top layer) du natif ne les compose pas.
test('la sous-modale de A3 se superpose à la modale, et son voile est plus opaque', async ({
  page,
}) => {
  await ouvrirA2(page)
  // Depuis A2, par « Tester la connexion » : c'est le vrai parcours de A3, et un bouton de
  // la galerie serait de toute façon derrière le voile de A2.
  await page.getByRole('button', { name: 'Tester la connexion' }).click()
  await page.waitForSelector('[role=dialog][aria-label="Connexion impossible"]')

  const mesures = await page.evaluate(() => {
    const voiles = [...document.querySelectorAll('[data-testid=veil]')]
    if (voiles.length !== 2) return { nombre: voiles.length }
    const zIndex = voiles.map((v) => Number(getComputedStyle(v).zIndex))
    const opacites = voiles.map((v) => {
      const fond = getComputedStyle(v).backgroundColor
      const alpha = fond.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/)
      return alpha ? Number(alpha[1]) : 1
    })
    const sous = document.querySelector('[role=dialog][aria-label="Connexion impossible"]')
    return {
      nombre: voiles.length,
      zIndex,
      opacites,
      largeurSous: sous ? Math.round(sous.getBoundingClientRect().width) : null,
    }
  })

  expect(mesures.nombre).toBe(2)
  // Le second voile passe devant le premier.
  expect(mesures.zIndex?.[1]).toBeGreaterThan(mesures.zIndex?.[0] as number)
  // Et il est plus opaque : .45 contre .28, relevé sur le mockup.
  expect(mesures.opacites?.[0]).toBeCloseTo(0.28, 2)
  expect(mesures.opacites?.[1]).toBeCloseTo(0.45, 2)
  // 436 px plus les deux bordures.
  expect(mesures.largeurSous).toBe(438)
})

test('la modale de 820 px tient dans la fenêtre minimale de 960 px', async ({ page }) => {
  // `tauri.conf.json` déclare `minWidth: 960`. Une modale qui déborde y serait tronquée,
  // et rien dans la suite unitaire ne le dirait.
  await page.setViewportSize({ width: 960, height: 600 })
  await ouvrirA2(page)

  const debordement = await page.evaluate(() => {
    const coquille = document.querySelector('[role=dialog]')
    if (!coquille) return null
    const boite = coquille.getBoundingClientRect()
    return {
      gauche: boite.left,
      droite: window.innerWidth - boite.right,
      largeur: Math.round(boite.width),
    }
  })

  expect(debordement?.gauche).toBeGreaterThanOrEqual(0)
  expect(debordement?.droite).toBeGreaterThanOrEqual(0)
  expect(debordement?.largeur).toBe(822)
})

test('les boutons radio font 30 px, y compris celui à bordure de 1.5 px', async ({ page }) => {
  const hauteurs = await page.evaluate(() => {
    const groupes = [...document.querySelectorAll('fieldset[class*=root]')]
    return groupes.flatMap((g) =>
      [...g.querySelectorAll('label')].map((l) => Math.round(l.getBoundingClientRect().height)),
    )
  })

  // `border-box` sur les options : sans lui, l'habillage `prod` de `08b` — bordure de
  // 1.5 px là où les autres en ont 1 — rendrait ce bouton plus haut et plus large que ses
  // voisins d'une rangée de trois.
  expect(hauteurs.length).toBeGreaterThan(0)
  expect(new Set(hauteurs)).toEqual(new Set([30]))
})

test('replier le panneau retire ses champs du calcul de mise en page', async ({ page }) => {
  const entete = page.getByRole('button', { name: /Proxy \/ tunnel/ })
  const avant = await page.evaluate(() => {
    const panneau = document.querySelector('section[class*=root]:has([class*=header])')
    return panneau ? Math.round(panneau.getBoundingClientRect().height) : null
  })

  await entete.click()

  const apres = await page.evaluate(() => {
    const panneau = document.querySelector('section[class*=root]:has([class*=header])')
    return panneau ? Math.round(panneau.getBoundingClientRect().height) : null
  })

  // Le retrait du DOM, vérifié en unitaire, doit se traduire par une hauteur qui **tombe** —
  // sinon le contenu était seulement invisible, et le piège de focus de `Modal` continuerait
  // à compter ses champs.
  expect(avant).toBeGreaterThan(apres as number)
  // 34 px d'en-tête (`--h-bar`, en `content-box`) plus les deux bordures de l'encadré. Le
  // filet sous l'en-tête ne compte pas : il n'est posé que déplié, où il sépare de quelque
  // chose. Une première version attendait 35 en oubliant les bordures de l'encadré — la
  // mesure a corrigé l'arithmétique.
  expect(apres).toBe(36)
})
