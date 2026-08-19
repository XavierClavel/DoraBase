import { expect, test } from '@playwright/test'

// Les mesures de `24b` : une hauteur de bande, une absence de cible cliquable, un rôle. Des propriétés
// calculées ou de mise en page, donc hors de portée de jsdom — qui ne calcule aucune géométrie.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=stepper-un]')
  await page.evaluate(() => document.fonts.ready)
})

test('la bande fait 35 px rendus, filet compris', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const bande = document.querySelector('[data-testid=stepper-un] ol') as HTMLElement
    const style = getComputedStyle(bande)
    return {
      rendue: Math.round(bande.getBoundingClientRect().height),
      declaree: style.height,
      filet: style.borderBottomWidth,
      // **Aucun `overflow` déclaré, et c'est délibéré** : le pixel du filet en `content-box`
      // deviendrait sinon une barre de défilement fantôme — le défaut n° 69, à la lettre.
      debordement: style.overflow,
    }
  })
  // 34 px de contenu plus le filet : la grammaire de `TabStrip`, à laquelle la bande appartient.
  expect(mesures.declaree).toBe('34px')
  expect(mesures.filet).toBe('1px')
  expect(mesures.rendue).toBe(35)
  expect(mesures.debordement).toBe('visible')
})

test('rien n’y est cliquable, et le curseur le dit', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const bande = document.querySelector('[data-testid=stepper-un] ol') as HTMLElement
    const etapes = [...bande.querySelectorAll('li')]
    return {
      // Le garde de l'ensemble vide (défaut n° 72) : compter avant d'affirmer une absence.
      etapes: etapes.length,
      cibles: bande.querySelectorAll('button, a, [role=button], [tabindex]').length,
      curseurs: etapes.map((etape) => getComputedStyle(etape).cursor),
    }
  })
  expect(mesures.etapes).toBe(2)
  expect(mesures.cibles).toBe(0)
  // **Jamais `pointer`** : c'est la marque que ce produit pose sur ce qui se clique, et son absence
  // est le message. La valeur est `default` et non `auto` parce que le chrome entier l'est depuis la
  // règle de `reset.css` — une flèche au-dessus de ce qui ne s'édite pas. L'assertion porte donc sur
  // la propriété qui compte, et sur la valeur exacte pour qu'un changement se voie.
  expect(mesures.curseurs.some((curseur) => curseur === 'pointer')).toBe(false)
  expect(mesures.curseurs).toEqual(['default', 'default'])
})

test('le survol ne change rien — ni fond, ni encre, ni ombre', async ({ page }) => {
  const etape = page.locator('[data-testid=stepper-un] li').first()
  const styleDe = () =>
    page.evaluate(() => {
      const li = document.querySelector('[data-testid=stepper-un] li') as HTMLElement
      const pastille = li.querySelector('span') as HTMLElement
      return {
        fond: getComputedStyle(pastille).backgroundColor,
        encre: getComputedStyle(li).color,
        ombre: getComputedStyle(pastille).boxShadow,
      }
    })

  const repos = await styleDe()
  await etape.hover()
  // **La propriété, non la déclaration.** Vérifier l'absence d'une règle `:hover` dans la feuille
  // dirait que le CSS ne la contient pas ; ceci dit que le survol ne produit rien.
  expect(await styleDe()).toEqual(repos)
})

test('la bande est une liste, pas une bande d’onglets', async ({ page }) => {
  const bande = page.locator('[data-testid=stepper-un] ol')
  await expect(bande).toHaveAttribute('aria-label', 'Progression')
  expect(await page.locator('[data-testid=stepper-un] [role=tablist]').count()).toBe(0)

  // Une seule étape courante, et son texte accessible porte la phrase que la couleur ne dit pas.
  const courantes = page.locator('[data-testid=stepper-deux] [aria-current="step"]')
  await expect(courantes).toHaveCount(1)
  await expect(courantes).toContainText('Étape 2 sur 2, en cours')
})

test('la phrase de l’état est masquée à l’œil, jamais à la voix', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const phrase = [...document.querySelectorAll('[data-testid=stepper-un] li span')].find((span) =>
      /Étape 1 sur 2/.test(span.textContent ?? ''),
    ) as HTMLElement
    if (!phrase) return null
    const boite = phrase.getBoundingClientRect()
    return {
      affichage: getComputedStyle(phrase).display,
      largeur: Math.round(boite.width),
      hauteur: Math.round(boite.height),
    }
  })
  // `clip-path` sur un pixel, **et non `display: none`** : celui-ci la retirerait de l'arbre
  // d'accessibilité, donc du seul endroit où elle sert.
  expect(mesures?.affichage).not.toBe('none')
  expect(mesures?.largeur).toBe(1)
  expect(mesures?.hauteur).toBe(1)
})
