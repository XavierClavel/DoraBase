import { expect, test } from '@playwright/test'

// La rangée de 24 px, l'absence de cadre, le centrage et la stabilité de la barre quand le centre est
// vide sont des propriétés de **mise en page** : jsdom n'en calcule aucune. `09c` les nommait comme sa
// vérification principale, et `25b` les déplace du sélecteur vers l'indicateur.
//
// **Cinq tests de ce fichier ont disparu avec les contrôles qu'ils mesuraient** (`25b`) : les deux
// boîtes de 24 px, l'écart de 8 px puis « le sélecteur à droite du centre », le champ de 19 px, la
// liste de 17 px dans ce champ, et le point de prod pris dans le champ de la liste. Le sélecteur
// d'environnement et le menu de la pastille n'existent plus — l'environnement se choisit dans l'arbre,
// où `25a` en fait un palier. Ce qui reste à mesurer est un indicateur **passif**, et c'est ce que ce
// fichier fait désormais.
test.beforeEach(async ({ page }) => {
  await page.goto('/?gallery')
  await page.waitForSelector('[data-testid=titlebar-a4]')
  await page.evaluate(() => document.fonts.ready)
})

/**
 * L'indicateur, désigné par sa **place** : l'unique enfant du centre de la barre.
 *
 * **Et non par un rôle ARIA : il n'en porte aucun** (`SelectionIndicator`). `role="status"` est une
 * région live, ce qui est le pire choix ici — la sélection changeant à chaque flèche dans l'arbre, un
 * lecteur d'écran couvrirait l'annonce de la ligne parcourue. `role="group"` a été essayé puis
 * écarté, ARIA le destinant à un ensemble de contrôles ; cette zone n'est que du texte. Il ne reste
 * donc rien à viser qu'une position, et `.center` de `TitleBar` n'a qu'un enfant.
 */
const CENTRE = '[data-tauri-drag-region] [class*="center"]'

/** L'indicateur de la barre du décor principal — projet, environnement « coulisses », fil d'Ariane. */
const indicateur = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid=titlebar-a4] [class*="center"] > *')

/** L'indicateur d'un décor désigné par le libellé de son environnement. */
const indicateurDe = (page: import('@playwright/test').Page, environnement: string) =>
  page.locator(`${CENTRE} > *`).filter({ hasText: environnement })

test('l’indicateur tient dans la rangée de 24 px du mockup', async ({ page }) => {
  // **Les deux boîtes de 24 px du mockup n'en font plus qu'une**, et elle n'est plus une boîte : la
  // hauteur, elle, reste celle du handoff — c'est la bande sur laquelle le wordmark et les icônes
  // d'action s'alignent, et la changer décalerait toute la barre.
  await expect(indicateur(page)).toHaveCSS('height', '24px')
})

test('le centre ne porte ni cadre, ni fond, ni contrôle', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const barre = document.querySelector('[data-testid=titlebar-a4]')
    const zone = barre?.querySelector('[class*="center"]')?.firstElementChild
    if (!barre || !zone) return null
    const s = getComputedStyle(zone)
    return {
      bordures: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      fond: s.backgroundColor,
      ombre: s.boxShadow,
      // Le sélecteur était un `role="combobox"` ; il ne doit plus rien en rester dans la barre.
      listes: barre.querySelectorAll('[role=combobox]').length,
    }
  })
  // **Un encadré sur fond de barre est une affordance**, et cette boîte *a été* un bouton pendant
  // tout le développement : la garder inviterait au clic qu'elle a longtemps accepté. C'est
  // l'argument que ce dépôt a déjà retenu en `24` contre un `Chip` inerte pour la cellule « Projet ».
  expect(mesures?.bordures).toEqual(['0px', '0px', '0px', '0px'])
  expect(mesures?.fond).toBe('rgba(0, 0, 0, 0)')
  expect(mesures?.ombre).toBe('none')
  expect(mesures?.listes).toBe(0)
})

test('aucun élément focalisable au centre, donc toute la zone est glissable', async ({ page }) => {
  const focalisables = await page.evaluate(() => {
    // La zone centrale : le parent direct de l'indicateur, `.center` de `TitleBar`.
    const centre = document
      .querySelector('[data-testid=titlebar-a4]')
      ?.querySelector('[class*="center"]')
    if (!centre) return null
    // La liste que `window/scripts/drag.js` considère comme bloquante : dès qu'un de ces éléments se
    // trouve sur le chemin, le glissement de fenêtre s'arrête. Aucun ici, donc `deep` glisse partout
    // au centre — la barre gagne en préhension sans qu'on l'ait demandé (`25b`).
    return [
      ...centre.querySelectorAll(
        'button, select, input, textarea, a[href], [tabindex], [role=combobox]',
      ),
    ].map((element) => element.tagName)
  })
  expect(focalisables).toEqual([])
})

// Le mockup enveloppe le centre dans un `flex:1; justify-content:center`. Sans cela, l'indicateur
// collerait au logo et se déplacerait avec la longueur du fil d'Ariane.
//
// **Le centrage est celui de l'espace restant, pas de la barre entière** — et c'est aussi ce que
// fait le mockup. Une première version du test comparait le centre du contenu à la demi-largeur de
// la barre : elle mesurait une chose que ni le mockup ni notre barre ne font, la barre réservant en
// plus 78 px à gauche pour les feux de macOS.
test('le contenu est centré dans sa zone, pas collé au logo', async ({ page }) => {
  const ecart = await page.evaluate(() => {
    const centre = document
      .querySelector('[data-testid=titlebar-a4]')
      ?.querySelector('[class*="center"]')
    const zone = centre?.firstElementChild
    if (!zone || !centre) return null
    const a = zone.getBoundingClientRect()
    const b = centre.getBoundingClientRect()
    return Math.round(Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)))
  })
  expect(ecart).toBeLessThanOrEqual(2)
})

/**
 * Le badge `PROD` suit le **drapeau**, jamais le libellé (`23g`) ni la couleur déclarée.
 *
 * C'est un ajout de `25b`, assumé : ni la pastille ni le sélecteur ne l'avaient. Mais le sélecteur
 * partant, plus rien dans la barre ne dirait « vous écrivez en production » au moment où `11d`
 * applique ses garde-fous — et `23g` accroche ces garde-fous à ce drapeau précis.
 */
test('le badge PROD suit le drapeau de l’environnement, et lui seul', async ({ page }) => {
  // Le décor marque « vitrine » production, et laisse « coulisses » ordinaire : un écran qui relirait
  // un trio `prod` / `staging` / `dev` en dur ne badgerait ni l'une ni l'autre.
  await expect(indicateurDe(page, 'vitrine')).toContainText('PROD')
  await expect(indicateur(page)).not.toContainText('PROD')

  // **`PROD` seul est un sigle**, et la pastille de couleur est `aria-hidden` : sans le texte masqué
  // visuellement, rien n'annoncerait en clair qu'on regarde une production (`09d`).
  await expect(indicateurDe(page, 'vitrine')).toContainText('environnement de production')
})

test('le libellé d’environnement s’affiche tel qu’il est déclaré, sans capitales', async ({
  page,
}) => {
  const libelle = await page.evaluate(() => {
    const zone = document
      .querySelector('[data-testid=titlebar-a4]')
      ?.querySelector('[class*="center"]')
    const span = [...(zone?.querySelectorAll('span') ?? [])].find(
      (element) => element.textContent === 'coulisses',
    )
    return span
      ? { texte: span.textContent, transformation: getComputedStyle(span).textTransform }
      : null
  })
  // Depuis `23a` le libellé est renommable : c'est une chaîne de l'utilisateur, et « Pré-production »
  // ne doit pas devenir « PRÉ-PRODUCTION ». Le seul mot en capitales reste `PROD`, parce que c'est une
  // catégorie et non un nom — et l'étiquette « ENV » du sélecteur est partie avec lui : sans
  // commutateur, il n'y a plus rien à étiqueter.
  expect(libelle).toEqual({ texte: 'coulisses', transformation: 'none' })
})

test('la pastille porte la couleur déclarée de l’environnement', async ({ page }) => {
  const couleur = await page.evaluate(() => {
    const zone = [...document.querySelectorAll('[data-tauri-drag-region] [class*="center"]')].find(
      (centre) => centre.textContent?.includes('vitrine'),
    )
    // La pastille est le `span` qui précède le libellé, et sa couleur est posée **en style en ligne**
    // depuis la table de jetons : trois règles CSS par identifiant redeviendraient le trio en dur que
    // `23a` a fait disparaître.
    const pastille = [...(zone?.querySelectorAll('span') ?? [])].find(
      (element) => element.style.background !== '',
    )
    return pastille ? getComputedStyle(pastille).backgroundColor : null
  })
  // Un environnement de production doit se reconnaître d'un écran à l'autre : c'est la couleur du
  // danger, celle de son bouton dans `A2`.
  expect(couleur).toBe('rgb(217, 67, 47)')
})

/**
 * Le parcours clavier de la barre : **un seul arrêt**, les préférences.
 *
 * Il en comptait quatre — la pastille, le sélecteur et les deux icônes —, puis deux, puis un depuis
 * le retrait du bouton de console (26 août 2026), qui n'ouvrait rien.
 *
 * **Mesuré sur `/?demo` et non sur la galerie**, et ce n'est pas un détour : en galerie la barre est
 * montée sans `onOpenPreferences`, donc son engrenage est *désactivé avec sa raison* (`09f`) — un
 * bouton désactivé n'est pas un arrêt de tabulation, et le compte y vaudrait un. C'est l'état du
 * décor, pas celui du produit.
 */
test('le parcours clavier de la barre compte un arrêt', async ({ page }) => {
  await page.goto('/?demo')
  await page.waitForSelector('[role=tree]')

  const arrets: (string | null)[] = []
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Tab')
    arrets.push(
      await page.evaluate(() => {
        const actif = document.activeElement
        const barre = document.querySelector('[data-tauri-drag-region]')
        if (!actif || !barre?.contains(actif)) return 'hors de la barre'
        return actif.getAttribute('aria-label')
      }),
    )
  }
  expect(arrets).toEqual(['Préférences', 'hors de la barre'])
})

/**
 * Rien de sélectionné : aucune empreinte réservée.
 *
 * `.center` vide a une hauteur de zéro sans rien déplacer. Ce n'est pas un état à inventer — c'est
 * celui que `A1` montre déjà dans le handoff. Une boîte fantôme n'achèterait aucune stabilité, et une
 * boîte vide bordée au centre d'une barre se lirait comme un champ à remplir.
 */
test('un centre vide ne déplace ni le wordmark ni les actions', async ({ page }) => {
  const mesures = await page.evaluate(() => {
    const releve = (testid: string) => {
      const barre = document.querySelector(`[data-testid=${testid}]`)?.firstElementChild
      if (!barre) return null
      const b = barre.getBoundingClientRect()
      const wordmark = barre.firstElementChild?.getBoundingClientRect()
      const actions = barre.lastElementChild?.getBoundingClientRect()
      if (!wordmark || !actions) return null
      // Des écarts aux bords, et non des abscisses : les deux décors sont dans deux `Sub` distincts,
      // donc à deux ordonnées et potentiellement à deux largeurs. Ce qui doit être identique est la
      // place que le wordmark et les actions prennent **dans** la barre.
      return {
        hauteur: Math.round(b.height),
        wordmark: Math.round(wordmark.left - b.left),
        largeurWordmark: Math.round(wordmark.width),
        actions: Math.round(b.right - actions.right),
        largeurActions: Math.round(actions.width),
      }
    }
    return { plein: releve('titlebar-a4'), vide: releve('titlebar-vide') }
  })

  expect(mesures.vide).not.toBeNull()
  expect(mesures.vide).toEqual(mesures.plein)
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
    // contrôles de la barre : sans cela, cliquer l'engrenage déplacerait la fenêtre. Il n'en reste
    // que dans la rangée d'actions, le centre n'en ayant plus aucun (`25b`).
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
