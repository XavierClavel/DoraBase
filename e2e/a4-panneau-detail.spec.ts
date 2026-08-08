import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=detail-a4]')
  await page.evaluate(() => document.fonts.ready)
})

test('le panneau fait 300 px', async ({ page }) => {
  const largeur = await page.evaluate(() => {
    const p = document.querySelector('[data-testid=detail-a4] aside')
    return p ? Math.round(p.getBoundingClientRect().width) : null
  })
  expect(largeur).toBe(300)
})

test('les deux tuiles sont côte à côte sans débordement', async ({ page }) => {
  const m = await page.evaluate(() => {
    const panneau = document.querySelector('[data-testid=detail-a4] aside')
    const tuiles = [...(panneau?.querySelectorAll('[class*=tiles] > *') ?? [])]
    if (!panneau || tuiles.length !== 2) return null
    const [a, b] = tuiles.map((t) => t.getBoundingClientRect())
    return {
      memeLigne: Math.abs((a?.top ?? 0) - (b?.top ?? 0)) < 1,
      deborde: (b?.right ?? 0) > panneau.getBoundingClientRect().right,
      largeurs: [Math.round(a?.width ?? 0), Math.round(b?.width ?? 0)],
    }
  })
  expect(m?.memeLigne).toBe(true)
  expect(m?.deborde).toBe(false)
  // `1fr 1fr` : les deux tuiles partagent la largeur à parts égales.
  expect(m?.largeurs?.[0]).toBe(m?.largeurs?.[1])
})

test('la grille d’actions est bien 2×2', async ({ page }) => {
  const lignes = await page.evaluate(() => {
    const actions = document.querySelector('[data-testid=detail-a4] [class*=actions]')
    const hauts = [...(actions?.querySelectorAll('button') ?? [])].map((b) =>
      Math.round(b.getBoundingClientRect().top),
    )
    return new Set(hauts).size
  })
  expect(lignes).toBe(2)
})

test('les actions désactivées portent l’habillage du handoff et le bon curseur', async ({
  page,
}) => {
  const style = await page.evaluate(() => {
    const bouton = document.querySelector('[data-testid=detail-a4] button[aria-disabled=true]')
    if (!bouton) return null
    const s = getComputedStyle(bouton)
    return { fond: s.backgroundColor, texte: s.color, curseur: s.cursor }
  })
  // Le même habillage que le bouton désactivé de `A3` : `rgba(35,32,28,.14)` de fond,
  // `rgba(35,32,28,.4)` de texte. Un bouton accent qui ne répond pas aurait l'air cliquable.
  expect(style?.fond).toBe('rgba(35, 32, 28, 0.14)')
  expect(style?.texte).toBe('rgba(35, 32, 28, 0.4)')
  expect(style?.curseur).toBe('not-allowed')
})

// Un `disabled` retirerait le bouton du parcours clavier, et son infobulle deviendrait
// inatteignable — exactement là où elle est le plus utile.
test('une action indisponible reste focalisable et montre son infobulle', async ({ page }) => {
  const bouton = page.locator('[data-testid=detail-a4] button[aria-disabled=true]').first()
  await bouton.focus()
  await expect(page.getByRole('tooltip')).toHaveCount(1)
})

test('l’infobulle n’intercepte pas le pointeur', async ({ page }) => {
  // Le focus et la lecture sont **deux étapes** : React ne commet son rendu qu'après le
  // gestionnaire, donc lire le style dans le même `evaluate` que le `focus()` trouve un DOM où
  // l'infobulle n'existe pas encore. Une première version le faisait et rendait `null`.
  await page.locator('[data-testid=detail-a4] button[aria-disabled=true]').first().focus()
  await page.waitForSelector('[role=tooltip]')

  const pointeur = await page.evaluate(() => {
    const bulle = document.querySelector('[role=tooltip]')
    return bulle ? getComputedStyle(bulle).pointerEvents : null
  })
  // Sinon elle disparaîtrait au moment où le curseur l'atteint, et le survol clignoterait.
  expect(pointeur).toBe('none')
})

test('un nom d’objet long ne déborde pas de l’en-tête', async ({ page }) => {
  const deborde = await page.evaluate(() => {
    const panneau = document.querySelector('[data-testid=detail-a4] aside')
    const titre = panneau?.querySelector('[class*=title]')
    if (!panneau || !titre) return null
    return titre.getBoundingClientRect().right > panneau.getBoundingClientRect().right
  })
  expect(deborde).toBe(false)
})

test('les relations entrantes sont visuellement distinctes des sortantes', async ({ page }) => {
  const couleurs = await page.evaluate(() => {
    const panneau = document.querySelector('[data-testid=detail-a4] aside')
    const sortante = panneau?.querySelector('[class*=relation]:not([class*=Entrante])')
    const entrante = panneau?.querySelector('[class*=relationEntrante]')
    if (!sortante || !entrante) return null
    return {
      sortante: getComputedStyle(sortante).color,
      entrante: getComputedStyle(entrante).color,
    }
  })
  // Une sortante dit de quoi cette table dépend, une entrante qui dépend d'elle : les afficher
  // pareil ferait lire deux faits de même nature alors que l'un se lit dans l'autre sens.
  expect(couleurs?.sortante).not.toBe(couleurs?.entrante)
})
