import { expect, test } from '@playwright/test'

// Ces trois faits sont des propriétés de **mise en page**, que Vitest ne peut pas vérifier :
// jsdom n'implémente aucun calcul de layout, donc y mesurer une hauteur ou une largeur
// renvoie toujours zéro. Les deux défauts qu'ils verrouillent ont été trouvés à la mesure
// dans un navigateur, alors que la suite unitaire était verte :
//
//   1. la racine de `SplitPane`, conteneur flex de niveau bloc, prenait la hauteur de son
//      contenu (15 px mesurés dans une boîte de 180) au lieu de remplir sa boîte ;
//   2. l'onglet actif de `TabStrip` sortait 5 px trop large, la croix en bouton frère
//      répétant le padding de 12 px du bord au lieu du gap de 7 px du mockup.
//
// La galerie est le seul point de montage de ces primitives à ce stade ; elle n'existe
// qu'en développement, ce que `pnpm dev` fournit à Playwright.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[role=separator]')
  await page.evaluate(() => document.fonts.ready)
})

test('SplitPane remplit la hauteur de son conteneur', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const demo = document.querySelector('[class*=splitDemo]')
    const hauteur = (el: Element | null) =>
      el === null ? null : Math.round(el.getBoundingClientRect().height)
    return {
      // 180 px déclarés plus 1 px de filet de chaque côté.
      conteneur: hauteur(demo),
      zones: [...document.querySelectorAll('[class*=splitZone]')].map(hauteur),
      poignees: [...document.querySelectorAll('[role=separator]')].map(hauteur),
    }
  })

  expect(mesures.conteneur).toBe(182)
  // Trois zones, deux poignées : la disposition à trois zones de A4, obtenue par
  // imbrication. Toutes doivent occuper les 180 px intérieurs.
  expect(mesures.zones).toEqual([180, 180, 180])
  expect(mesures.poignees).toEqual([180, 180])
})

test("l'onglet actif de TabStrip est conforme au mockup", async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const bande = document.querySelector('[role=tablist]')
    const actif = document.querySelector('[data-active="true"]')
    if (bande === null || actif === null) throw new Error('bande ou onglet actif introuvable')

    const bouton = actif.querySelector('[role=tab]')
    const libelle = bouton?.querySelector('span')
    const croix = actif.querySelector('button[aria-label^=Fermer] svg')
    if (bouton === null || libelle == null || croix === null) {
      throw new Error('bouton, libellé ou croix introuvable')
    }

    const arrondi = (valeur: number) => Math.round(valeur * 10) / 10
    return {
      bandeHauteur: arrondi(bande.getBoundingClientRect().height),
      ongletLargeur: arrondi(actif.getBoundingClientRect().width),
      fond: getComputedStyle(bouton).backgroundColor,
      traitSuperieur: getComputedStyle(actif).borderTopColor,
      ecartLibelleCroix: arrondi(
        croix.getBoundingClientRect().left - libelle.getBoundingClientRect().right,
      ),
    }
  })

  // 34 px déclarés plus 1 px de filet bas : le mockup rend 35, en `content-box`.
  expect(mesures.bandeHauteur).toBe(35)
  // Largeur relevée sur l'onglet `orders` du mockup, à police et libellé identiques.
  expect(mesures.ongletLargeur).toBe(98.3)
  // `--paper` (#FBF7EF), pas `--paper-bright` (#FFFDF8).
  expect(mesures.fond).toBe('rgb(251, 247, 239)')
  // Le trait suit la famille d'onglet : accent pour une table, pas le vert de son icône.
  expect(mesures.traitSuperieur).toBe('rgb(242, 101, 58)')
  expect(mesures.ecartLibelleCroix).toBe(7)
})
