import { expect, type Page, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// Les teintes, le coin ambre et les hauteurs sont de la mise en page : hors de portée de Vitest.
// `11b` les nomme.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
})

/** Modifie la deuxième ligne de `status`, et attend que la modification soit retenue. */
async function modifier(page: Page) {
  // **La démo n'ouvre plus l'édition par un drapeau** : c'est `⌘E` qui l'ouvre, comme pour
  // l'utilisateur. Un décor déjà en édition n'aurait jamais montré que la bascule marche.
  await page.keyboard.press('Meta+e')
  await page.getByRole('button', { name: 'Modifier status' }).nth(1).click()
  const champ = page.getByLabel('Nouvelle valeur')
  await champ.fill('shipped')
  await champ.press('Enter')
  // **Le bandeau de `11b` n'existe plus** : c'est le panneau de `11c` qui paraît à la première
  // modification, et c'est donc lui qui atteste qu'elle est retenue. Attendre ici, et non mesurer
  // sèchement après la frappe : la teinte et le coin de la cellule arrivent au rendu suivant.
  await page.waitForSelector('[aria-label="Modifications en attente de la table"]')
}

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

test('l’encadré ambre borde la case, pas le texte', async ({ page }) => {
  await modifier(page)

  const boites = await page.evaluate(() => {
    const cellule = document.querySelector('[role=grid] [class*=cellModified]')
    const ligne = cellule?.closest('[role=row]')
    if (!cellule || !ligne) return null
    const boiteCellule = cellule.getBoundingClientRect()
    // La boîte du **texte lui-même**, mesurée par un `Range` : `getBoundingClientRect` sur la
    // cellule rendrait la case, qui est justement ce dont on veut la distinguer.
    const plage = document.createRange()
    plage.selectNodeContents(cellule)
    const boiteTexte = plage.getBoundingClientRect()
    return {
      cellule: boiteCellule.height,
      ligne: ligne.getBoundingClientRect().height,
      ecartDeCentre:
        boiteTexte.height > 0
          ? (boiteTexte.top + boiteTexte.bottom) / 2 - (boiteCellule.top + boiteCellule.bottom) / 2
          : null,
    }
  })

  // **Le fond et le liseré d'une cellule sont ceux de la case, pas de la boîte du texte.** `.row`
  // centrait ses cellules, qui prenaient donc la hauteur de leur contenu : l'encadré paraissait
  // collé aux caractères. Un pixel d'écart est le filet de la ligne.
  expect(boites?.cellule).toBeCloseTo((boites?.ligne ?? 0) - 1, 0)
  // **Et le texte reste centré dedans.** Étirer les cellules retire au flux le soin de le centrer :
  // c'est la hauteur de ligne qui s'en charge, et ce test est la seule chose qui l'empêche de
  // retomber en haut de la case — un correctif de hauteur qui décale tous les textes de la grille
  // d'un cran serait un défaut bien pire que celui qu'il répare.
  expect(Math.abs(boites?.ecartDeCentre ?? 99)).toBeLessThanOrEqual(1)
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

// **« L'indicateur » et non « la pastille »** : `ProjectPill` est devenue `SelectionIndicator`
// (`25b`), ce n'est plus une boîte, et ce n'est plus un contrôle. Le point et le badge, eux, sont
// exactement ceux du mockup de `A6` — c'est la seule chose que ce test ait jamais mesurée, et le
// sélecteur les trouve toujours par leur classe dans la barre.
test('l’indicateur de la barre porte le badge ÉDITION et son point ambre', async ({ page }) => {
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
  // **Le badge est un texte, plus le nom accessible d'un bouton** (`25b`) : il vivait dans la pastille,
  // qui était un `<button>` — d'où l'ancien `getByRole('button', { name: /Édition/ })`. L'indicateur
  // n'a aucun élément focalisable, donc c'est le contenu de la barre qui porte le badge. Et le compte
  // masqué visuellement l'accompagne : `09d` interdit que la couleur du point porte seule.
  await expect(page.locator('[data-tauri-drag-region]')).toContainText('Édition')
  await expect(page.locator('[data-tauri-drag-region]')).toContainText('1 modification en attente')
})
