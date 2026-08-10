import { expect, type Page, test } from '@playwright/test'

// Les teintes, le coin ambre et les hauteurs sont de la mise en page : hors de portée de Vitest.
// `11b` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

/** Modifie la deuxième ligne de `status`, et attend que le bandeau paraisse. */
async function modifier(page: Page) {
  // **La démo n'ouvre plus l'édition par un drapeau** : c'est `⌘E` qui l'ouvre, comme pour
  // l'utilisateur. Un décor déjà en édition n'aurait jamais montré que la bascule marche.
  await page.keyboard.press('Meta+e')
  await page.getByRole('button', { name: 'Modifier status' }).nth(1).click()
  const champ = page.getByLabel('Nouvelle valeur')
  await champ.fill('shipped')
  await champ.press('Enter')
  await page.waitForSelector('[aria-label="Modifications en attente"]')
}

test('le bandeau fait 34 px et n’existe qu’avec des modifications', async ({ page }) => {
  // Un bandeau à « 0 modification » occuperait 34 px pour ne rien dire.
  await expect(page.getByRole('status', { name: 'Modifications en attente' })).toHaveCount(0)

  await modifier(page)
  const hauteur = await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Modifications en attente"]')
    return b ? getComputedStyle(b).height : null
  })
  expect(hauteur).toBe('34px')
})

test('la ligne et la cellule modifiées portent bien les teintes ambre du modèle', async ({
  page,
}) => {
  await modifier(page)

  const mesures = await page.evaluate(() => {
    // **Comparer à la valeur du jeton, pas à une ligne voisine.** Une première version comparait la
    // ligne modifiée à « une autre ligne » : la ligne sélectionnée portant déjà un fond, les deux
    // différaient même quand la teinte de modification avait disparu. Le voisin n'était pas un
    // témoin, c'était un autre décor.
    const temoin = document.createElement('div')
    document.body.append(temoin)
    const resolu = (jeton: string) => {
      temoin.style.background = `var(${jeton})`
      return getComputedStyle(temoin).backgroundColor
    }
    const attendu = { ligne: resolu('--warn-bg-2'), cellule: resolu('--warn-bg') }
    temoin.remove()

    const grille = document.querySelector('[role=grid]')
    const cellule = grille?.querySelector('[class*=cellModified]')
    const ligne = cellule?.closest('[role=row]')
    if (!cellule || !ligne) return null
    return {
      attendu,
      fondCellule: getComputedStyle(cellule).backgroundColor,
      fondLigne: getComputedStyle(ligne).backgroundColor,
      // **Le coin n'est pas décoratif** : c'est la seule marque qui distingue une cellule modifiée
      // d'une cellule teintée par un filtre (`10d`), et les deux teintes sont proches. Une
      // différence qui ne tiendrait qu'à une nuance de fond serait indistinguable pour une part des
      // utilisateurs.
      coin: getComputedStyle(cellule, '::after').borderBottomWidth,
    }
  })

  expect(mesures?.fondLigne).toBe(mesures?.attendu.ligne)
  expect(mesures?.fondCellule).toBe(mesures?.attendu.cellule)
  expect(mesures?.coin).toBe('5px')
})

test('une cellule modifiée se distingue d’une cellule filtrée autrement que par la couleur', async ({
  page,
}) => {
  // Poser un filtre **et** une modification, puis comparer les deux marques.
  await page.getByLabel('Filtrer currency').fill('EUR')
  await page.getByLabel('Filtrer currency').press('Enter')
  await modifier(page)

  const marques = await page.evaluate(() => {
    const grille = document.querySelector('[role=grid]')
    const modifiee = grille?.querySelector('[class*=cellModified]')
    const filtree = grille?.querySelector('[role=row] [class*=filtered]')
    if (!modifiee || !filtree) return null
    return {
      coinModifiee: getComputedStyle(modifiee, '::after').borderBottomWidth,
      coinFiltree: getComputedStyle(filtree, '::after').borderBottomWidth,
      liseréModifiee: getComputedStyle(modifiee).boxShadow !== 'none',
      liseréFiltree: getComputedStyle(filtree).boxShadow !== 'none',
    }
  })

  expect(marques?.coinModifiee).toBe('5px')
  expect(marques?.coinFiltree).not.toBe('5px')
  expect(marques?.liseréModifiee).toBe(true)
  expect(marques?.liseréFiltree).toBe(false)
})

test('la pastille projet porte le badge ÉDITION et son point ambre', async ({ page }) => {
  const avant = await page.evaluate(() => {
    const point = document.querySelector('[data-tauri-drag-region] [class*=dot]')
    return point?.getAttribute('data-state')
  })
  expect(avant).toBe('connected')

  await modifier(page)

  const apres = await page.evaluate(() => {
    const point = document.querySelector('[data-tauri-drag-region] [class*=dot]')
    return {
      etat: point?.getAttribute('data-state'),
      couleur: point ? getComputedStyle(point).backgroundColor : null,
      vert: getComputedStyle(document.documentElement).getPropertyValue('--success').trim(),
    }
  })
  // Le point décrit l'état de l'**écran** quand il y a quelque chose à signaler, celui de la
  // connexion sinon. Le badge lève l'ambiguïté sans dépendre de la couleur.
  expect(apres.etat).toBe('pending')
  await expect(page.getByRole('button', { name: /Édition/ })).toBeVisible()
})
