import { expect, test } from '@playwright/test'

// La sélection de texte du navigateur : jsdom n'en a pas, donc c'est ici que ça se mesure.
// Signalé à l'usage le 11 août 2026 — glisser la poignée surlignait les lignes de la grille.
test('glisser la poignée ne sélectionne aucun texte', async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')

  // La poignée de la sidebar : celle qui traverse la grille en s'élargissant, donc celle qui
  // surlignait le plus de texte.
  const poignee = page.getByRole('separator').first()
  const boite = await poignee.boundingBox()
  if (!boite) throw new Error('la poignée doit être visible')

  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2)
  await page.mouse.down()
  // Plusieurs pas, en traversant la grille : une sélection démarrée se propage au mouvement.
  for (const dx of [40, 80, 120, 160]) {
    await page.mouse.move(boite.x + dx, boite.y + boite.height / 2)
  }
  // **On mesure `user-select`, pas `getSelection()`.** Une première version comparait la sélection
  // rendue par le navigateur : elle restait vide même sans le correctif, Chromium ne produisant pas
  // de sélection dans ce scénario piloté. Le test était donc vert pour la mauvaise raison. Ce qui
  // empêche réellement le surlignage est la propriété calculée sur le texte traversé.
  const pendant = await page.evaluate(() => {
    const cellule = document.querySelector('[role=grid] [role=gridcell]')
    return {
      selection: window.getSelection()?.toString() ?? '',
      userSelect: cellule ? getComputedStyle(cellule).userSelect : null,
    }
  })
  await page.mouse.up()

  expect(pendant.userSelect).toBe('none')
  expect(pendant.selection).toBe('')
})

test('la sélection redevient possible après le glissement', async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')
  const poignee = page.getByRole('separator').first()
  const boite = await poignee.boundingBox()
  if (!boite) throw new Error('la poignée doit être visible')

  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2)
  await page.mouse.down()
  await page.mouse.move(boite.x + 60, boite.y + boite.height / 2)
  await page.mouse.up()

  // **Suspendre la sélection sans la rendre serait pire que le défaut d'origine** : la page entière
  // deviendrait inélectable jusqu'au rechargement.
  const selectionnable = await page.evaluate(() => {
    const cible = document.querySelector('[role=tree] [role=treeitem]')
    return cible ? getComputedStyle(cible).userSelect : null
  })
  expect(selectionnable).not.toBe('none')
})
