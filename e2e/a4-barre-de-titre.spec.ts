import { expect, test } from '@playwright/test'

// Les deux boîtes séparées de 8 px, leurs hauteurs et le centrage sont des propriétés de **mise
// en page** : jsdom n'en calcule aucune. `09c` les nomme comme sa vérification principale.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=titlebar-a4]')
  await page.evaluate(() => document.fonts.ready)
})

async function boites(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const barre = document.querySelector('[data-testid=titlebar-a4]')
    if (!barre) return null
    const pastille = barre.querySelector('button')
    // La seconde boîte est celle qui contient le sélecteur.
    const env = barre.querySelector('select')?.closest('div')
    if (!pastille || !env) return null
    const a = pastille.getBoundingClientRect()
    const b = env.getBoundingClientRect()
    return {
      hauteurPastille: Math.round(a.height),
      hauteurEnv: Math.round(b.height),
      ecart: Math.round(b.left - a.right),
      // Le centre du contenu, comparé au centre de **sa zone** — pas de la barre entière.
      centreContenu: Math.round((a.left + b.right) / 2),
      centreZone: (() => {
        // La zone centrale : le parent direct de la pastille, `.center` de `TitleBar`.
        const zone = pastille.parentElement
        if (!zone) return null
        const r = zone.getBoundingClientRect()
        return Math.round(r.left + r.width / 2)
      })(),
    }
  })
}

// **Le fait que `09c` nomme en premier.** Les fondre donnerait un bandeau unique, où
// l'environnement se lirait comme une propriété du fil d'Ariane plutôt que comme un commutateur.
test('les deux boîtes sont distinctes, séparées de 8 px', async ({ page }) => {
  const m = await boites(page)
  expect(m?.ecart).toBe(8)
})

test('les deux boîtes font 24 px', async ({ page }) => {
  const m = await boites(page)
  expect(m?.hauteurPastille).toBe(24)
  expect(m?.hauteurEnv).toBe(24)
})

// Le mockup enveloppe le centre dans un `flex:1; justify-content:center`. Sans cela, la pastille
// collerait au logo et se déplacerait avec la longueur du fil d'Ariane.
//
// **Le centrage est celui de l'espace restant, pas de la barre entière** — et c'est aussi ce que
// fait le mockup. Une première version du test comparait le centre du contenu à la demi-largeur
// de la barre : elle mesurait une chose que ni le mockup ni notre barre ne font, la barre
// réservant en plus 78 px à gauche pour les feux de macOS.
test('le contenu est centré dans sa zone, pas collé au logo', async ({ page }) => {
  const m = await boites(page)
  expect(Math.abs((m?.centreContenu ?? 0) - (m?.centreZone ?? 0))).toBeLessThanOrEqual(2)
})

test('le champ d’environnement fait 19 px dans sa boîte de 24', async ({ page }) => {
  const hauteur = await page.evaluate(() => {
    const champ = document
      .querySelector('[data-testid=titlebar-a4]')
      ?.querySelector('select')?.parentElement
    return champ ? Math.round(champ.getBoundingClientRect().height) : null
  })
  expect(hauteur).toBe(19)
})

test('le select occupe toute la hauteur de son champ, donc tout est cliquable', async ({
  page,
}) => {
  // Le défaut trouvé en `08b` sur `Select` : un `<select>` garde sa hauteur intrinsèque dans un
  // conteneur flex, et cliquer dans le remplissage n'ouvre pas la liste.
  const m = await page.evaluate(() => {
    const select = document.querySelector('[data-testid=titlebar-a4]')?.querySelector('select')
    const champ = select?.parentElement
    if (!select || !champ) return null
    return {
      select: Math.round(select.getBoundingClientRect().height),
      champ: Math.round(champ.getBoundingClientRect().height),
    }
  })
  // 19 px de boîte moins les 2 px de bordure.
  expect(m?.select).toBe(17)
  expect(m?.champ).toBe(19)
})

test('le point de prod porte la couleur du danger, celle de son bouton dans A2', async ({
  page,
}) => {
  const couleur = await page.evaluate(() => {
    const point = document
      .querySelector('[data-testid=titlebar-a4]')
      ?.querySelector('[data-environment]')
    return point ? getComputedStyle(point).backgroundColor : null
  })
  // Un environnement de production doit se reconnaître d'un écran à l'autre.
  expect(couleur).toBe('rgb(217, 67, 47)')
})

test('le fil d’Ariane est en mono, le nom du projet en Nunito', async ({ page }) => {
  const polices = await page.evaluate(() => {
    const barre = document.querySelector('[data-testid=titlebar-a4]')
    const fil = [...(barre?.querySelectorAll('span') ?? [])].find((s) =>
      s.textContent?.includes('analytics · public'),
    )
    const nom = [...(barre?.querySelectorAll('span') ?? [])].find(
      (s) => s.textContent === 'Atelier Nord',
    )
    return {
      fil: fil ? getComputedStyle(fil).fontFamily : null,
      nom: nom ? getComputedStyle(nom).fontFamily : null,
    }
  })
  // La règle du produit depuis `08b` : ce que l'utilisateur transcrit littéralement est en mono.
  // Un nom de schéma est une valeur technique ; un nom de projet, non.
  expect(polices.fil).toContain('JetBrains Mono')
  expect(polices.nom).toContain('Nunito')
})

test('un nom de projet long ne pousse pas les actions hors de la barre', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 })
  const deborde = await page.evaluate(() => {
    const barre = document.querySelector('[data-testid=titlebar-a4]')?.firstElementChild
    if (!barre) return null
    const actions = barre.lastElementChild
    return actions
      ? actions.getBoundingClientRect().right > barre.getBoundingClientRect().right
      : null
  })
  expect(deborde).toBe(false)
})

/**
 * Le contrat de glissement de la fenêtre.
 *
 * **Playwright ne peut pas glisser une fenêtre native** — il pilote Chromium, où le pont Tauri ne
 * répond pas. Ce qu'il peut vérifier, et ce qui a manqué : la **valeur** de l'attribut, et que les
 * contrôles de la barre restent des éléments cliquables.
 *
 * Le script de Tauri (`window/scripts/drag.js`) traite l'attribut nu comme « clics directs
 * seulement » : la barre étant couverte par ses enfants, seule la bande de fond répondait.
 * `deep` étend le glissement au sous-arbre, et tout élément cliquable sur le chemin le bloque.
 */
test('la barre de titre est glissable en profondeur, et ses contrôles bloquent le glissement', async ({
  page,
}) => {
  const contrat = await page.evaluate(() => {
    const barre = document.querySelector('[data-tauri-drag-region]')
    if (!barre) return null
    // Les éléments que `drag.js` considère cliquables — donc bloquants — doivent couvrir les
    // contrôles de la barre : sans cela, cliquer la pastille projet déplacerait la fenêtre.
    const controles = [...barre.querySelectorAll('button, select')]
    return {
      valeur: barre.getAttribute('data-tauri-drag-region'),
      // Aucun contrôle ne doit porter l'attribut : il ferait de lui une zone de glissement, et le
      // clic cesserait d'activer le contrôle.
      controlesSansAttribut: controles.every((c) => !c.hasAttribute('data-tauri-drag-region')),
      auMoinsUnControle: controles.length > 0,
    }
  })

  expect(contrat?.valeur).toBe('deep')
  expect(contrat?.controlesSansAttribut).toBe(true)
  expect(contrat?.auMoinsUnControle).toBe(true)
})
