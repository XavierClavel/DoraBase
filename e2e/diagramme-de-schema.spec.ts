import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

/**
 * Le diagramme de structure d'un schéma (3 septembre 2026).
 *
 * # Ce que ce niveau garde, et qu'aucun autre ne peut garder
 *
 * `disposition.test.ts` vérifie la géométrie **calculée**, `DiagramView.test.tsx` le contenu et les
 * gestes, `Workbench.test.tsx` l'assemblage. Deux faits leur échappent tous les trois, parce que
 * jsdom ne calcule aucune mise en page (règle n° 9) :
 *
 * 1. **que le rendu tombe là où le calcul l'a mis.** Les hauteurs viennent de `disposition.ts` et
 *    sont posées en style *inline* par le composant : si les deux se désaccordaient, les flèches
 *    arriveraient à côté des lignes qu'elles désignent, et rien ne le dirait — le DOM serait juste,
 *    et seul l'œil verrait le décalage ;
 * 2. **que la toile défile vraiment**, plutôt que de déborder de son cadre. C'est le défaut n° 35 par
 *    un autre bout, et la seule mesure qui en décide est celle d'un vrai navigateur.
 */
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.getByRole('treeitem', { name: 'public' }).dblclick()
  // **Le survol est obligatoire** : le « … » d'une ligne est en `visibility: hidden` hors survol, et
  // Playwright refuse de cliquer un élément invisible — l'attente expirerait sans rien dire d'utile.
  await page.getByRole('treeitem', { name: 'public' }).hover()
  await page.getByRole('button', { name: 'Actions de public' }).click()
  await page.getByRole('button', { name: 'Diagramme du schéma' }).click()
  // Les structures arrivent **une par une** : attendre la dernière boîte, et non un délai.
  await page.getByRole('button', { name: /^users ·/ }).waitFor()
  await page.evaluate(() => document.fonts.ready)
})

test('le diagramme dessine les tables du schéma et leurs clés', async ({ page }) => {
  await expect(page.getByRole('tab', { name: /public/ })).toHaveAttribute('aria-selected', 'true')

  // Les six tables du décor `?demo` — les vues en sont écartées, une vue n'ayant pas de clé
  // étrangère à montrer.
  for (const table of [
    'users',
    'orders',
    'order_items',
    'inventory_movements',
    'shipment_batches',
    'pricing_rules',
    'audit_events',
  ]) {
    await expect(page.getByRole('button', { name: new RegExp(`^${table} ·`) })).toHaveCount(1)
  }
  await expect(page.getByRole('button', { name: /^orders_daily/ })).toHaveCount(0)

  // La barre d'état, et le nombre qui manquerait : `audit_events.snapshot_id` vise
  // `archive.snapshots`, dont la boîte n'existe pas — le taire ferait lire le dessin comme complet.
  const pied = page.getByRole('status', { name: 'Résumé du diagramme' })
  await expect(pied).toContainText('7 tables')
  await expect(pied).toContainText('6 liens')
  await expect(pied).toContainText('1 hors du schéma')
})

test('une flèche arrive au pixel où sa ligne est rendue', async ({ page }) => {
  /*
   * **Le fait que ce fichier existe pour garder.**
   *
   * `disposition` ancre le lien `orders_user_id_fkey` au centre de la ligne `user_id` de `orders`,
   * et au centre de la ligne `id` de `users`. Les hauteurs qui produisent ces centres — en-tête et
   * ligne — sont **exportées** par le module de calcul et posées en style *inline* par le composant,
   * précisément pour qu'il n'y ait qu'une valeur. Ce test est ce qui le vérifie : une seconde valeur
   * dans la CSS aurait décalé toutes les flèches sans faire rougir un seul test unitaire.
   *
   * **La tolérance est d'un demi-pixel, et c'est un correctif.** Elle valait un pixel, et le
   * sabotage l'a dénoncée : rendre au flux la bordure de la boîte décale les lignes d'exactement un
   * pixel, ce qu'une tolérance d'un pixel laisse passer. Or les cotes sont entières de bout en bout
   * — hauteurs, positions, coordonnées du tracé —, donc l'égalité est exacte et le demi-pixel ne
   * couvre plus qu'un éventuel arrondi de `getBoundingClientRect`. C'est la règle n° 18 : un test
   * qui mesure un ordre de grandeur ne garde pas une cote.
   */
  const mesures = await page.evaluate(() => {
    const boite = (table: string) =>
      document.querySelector(`[data-boite="${table}"]`) as HTMLElement | null
    const ligne = (table: string, colonne: string) =>
      boite(table)?.querySelector(`[data-colonne="${colonne}"]`) as HTMLElement | null
    const centre = (element: HTMLElement | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return rect.top + rect.height / 2
    }
    // Les deux bouts d'un tracé : ses **deux premiers** nombres et ses **deux derniers**, quel que
    // soit ce qu'il y a entre. Le compte, lui, varie — un lien droit porte deux points, un coude
    // arrondi en porte six — et une version de ce test l'avait figé à huit, la longueur d'une
    // courbe de Bézier. Elle ne mesurait donc plus rien le jour où les courbes sont devenues des
    // coudes : `filter` vidait la liste, et `some` sur une liste vide est faux… donc le test
    // rougissait. Un compte figé aurait aussi bien pu la laisser verte.
    const chemins = [...document.querySelectorAll('[data-liens] path[d]')]
      .map((path) => path.getAttribute('d') ?? '')
      .map((d) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))
      .filter((nombres) => nombres.length >= 4)
      .map((nombres) => ({
        depart: nombres[1] as number,
        arrivee: nombres[nombres.length - 1] as number,
      }))
    const toile = document.querySelector('[data-liens]')?.getBoundingClientRect()
    return {
      chemins,
      // Le décalage entre les coordonnées du calcul et celles de la fenêtre.
      origine: toile ? toile.top : null,
      fk: centre(ligne('orders', 'user_id')),
      cible: centre(ligne('users', 'id')),
      // Le contrôle négatif du décor : les deux ancres sont à des hauteurs différentes **dans leur
      // boîte**, donc une inversion des deux bouts ne pourrait pas passer inaperçue.
      rangFk: [...(boite('orders')?.querySelectorAll('[data-colonne]') ?? [])].findIndex(
        (element) => element.getAttribute('data-colonne') === 'user_id',
      ),
      rangCible: [...(boite('users')?.querySelectorAll('[data-colonne]') ?? [])].findIndex(
        (element) => element.getAttribute('data-colonne') === 'id',
      ),
    }
  })

  expect(mesures.origine).not.toBeNull()
  expect(mesures.fk).not.toBeNull()
  expect(mesures.cible).not.toBeNull()
  expect(mesures.rangFk).not.toBe(mesures.rangCible)

  const origine = mesures.origine as number
  const depart = (mesures.fk as number) - origine
  const arrivee = (mesures.cible as number) - origine
  // L'un des tracés du dessin part de la ligne `user_id` et arrive sur la ligne `id`. On le
  // retrouve par ses deux ordonnées plutôt que par un ordre dans le DOM, qui n'est pas une garantie.
  // La prémisse : il y a bien des tracés à examiner. Sans elle, une extraction devenue muette
  // rendrait ce test faux pour la mauvaise raison.
  expect(mesures.chemins.length).toBeGreaterThan(0)
  const trouve = mesures.chemins.some(
    (bouts) => Math.abs(bouts.depart - depart) < 0.5 && Math.abs(bouts.arrivee - arrivee) < 0.5,
  )
  expect(
    trouve,
    `aucun tracé ne va de ${depart} à ${arrivee} ; tracés vus : ${JSON.stringify(mesures.chemins)}`,
  ).toBe(true)
})

test('les tables se rangent de gauche à droite, dans le sens des références', async ({ page }) => {
  const abscisses = await page.evaluate(() =>
    Object.fromEntries(
      ['inventory_movements', 'order_items', 'orders', 'users'].map((table) => [
        table,
        document.querySelector(`[data-boite="${table}"]`)?.getBoundingClientRect().left ?? null,
      ]),
    ),
  )

  // `inventory_movements → order_items → orders → users` : une table est à gauche de celles qu'elle
  // référence, donc la chaîne se lit comme la phrase. C'est un ordre **strict** : deux tables à la
  // même abscisse voudraient dire que le calcul des couches n'a rien classé.
  expect(abscisses.inventory_movements).toBeLessThan(abscisses.order_items as number)
  expect(abscisses.order_items).toBeLessThan(abscisses.orders as number)
  expect(abscisses.orders).toBeLessThan(abscisses.users as number)
})

test('la toile défile, elle ne déborde pas de son cadre', async ({ page }) => {
  // **Le débordement est provoqué, pas espéré.** À l'échelle 1 le dessin du décor tient à peu près
  // dans le centre : un test qui compterait sur son débordement mesurerait la largeur de la fenêtre
  // du jour. Deux crans de zoom le rendent forcément plus large que son cadre, et c'est là que la
  // question se pose — le dessin doit se **parcourir**, pas être rogné en silence.
  await page.getByRole('button', { name: 'Agrandir' }).click()
  await page.getByRole('button', { name: 'Agrandir' }).click()
  await expect(page.getByRole('button', { name: /^Échelle 150 %/ })).toBeVisible()

  const mesures = await page.evaluate(() => {
    // `data-toile` plutôt qu'une remontée d'ancêtres : celle-ci se cassait au premier `div`
    // intercalé, et un test qui suit la forme du DOM mesure la forme du DOM.
    const zone = document.querySelector('[data-toile]') as HTMLElement | null
    if (!zone) return null
    const deborde = zone.scrollWidth > zone.clientWidth
    zone.scrollLeft = 400
    return {
      deborde,
      defile: zone.scrollLeft,
      largeurDeLaRacine: document.documentElement.scrollWidth,
      largeurVisible: document.documentElement.clientWidth,
    }
  })

  expect(mesures).not.toBeNull()
  const vu = mesures as {
    deborde: boolean
    defile: number
    largeurDeLaRacine: number
    largeurVisible: number
  }
  // La prémisse, dite plutôt que supposée : sans débordement, « ça défile » n'a rien à vérifier.
  expect(vu.deborde).toBe(true)
  // Un `scrollLeft` qui resterait à zéro dirait que la zone ne défile pas — donc que le dessin est
  // rogné, ce qui est le défaut n° 35 par un autre bout.
  expect(vu.defile).toBeGreaterThan(0)
  // **Et la racine ne défile jamais** (règle n° 10) : c'est la zone du diagramme qui absorbe la
  // largeur, pas la fenêtre.
  expect(vu.largeurDeLaRacine).toBe(vu.largeurVisible)
})

test('le zoom agrandit le dessin, sans le déformer', async ({ page }) => {
  const mesure = () =>
    page.evaluate(() => {
      const boite = document.querySelector('[data-boite="users"]')?.getBoundingClientRect()
      return boite ? { largeur: boite.width, hauteur: boite.height } : null
    })

  const cent = await mesure()
  await page.getByRole('button', { name: 'Agrandir' }).click()
  await expect(page.getByRole('button', { name: /^Échelle 125 %/ })).toBeVisible()
  const cent25 = await mesure()

  expect(cent).not.toBeNull()
  expect(cent25).not.toBeNull()
  const avant = cent as { largeur: number; hauteur: number }
  const apres = cent25 as { largeur: number; hauteur: number }
  // Une **échelle**, donc les deux dimensions dans le même rapport : un zoom qui n'agirait que sur
  // la largeur étirerait le dessin, ce que `transform: scale` ne fait pas — et c'est bien la raison
  // pour laquelle le zoom est une transformation et non un recalcul des cotes.
  expect(apres.largeur / avant.largeur).toBeCloseTo(1.25, 2)
  expect(apres.hauteur / avant.hauteur).toBeCloseTo(1.25, 2)
})

test('l’interrupteur « Toutes les colonnes » ouvre ce que l’aperçu résume', async ({ page }) => {
  // `audit_events` porte cinq colonnes dont trois clés : l'aperçu les montre toutes, ce qui ne
  // prouverait rien. `orders` en porte neuf dans le décor, donc elle résume.
  await expect(page.getByText('+ 1 autre')).toHaveCount(1)
  await page.getByRole('switch', { name: 'Toutes les colonnes' }).click()
  await expect(page.getByRole('switch', { name: 'Toutes les colonnes' })).toBeChecked()
  await expect(page.getByText(/autre/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^orders · 9 colonnes/ })).toBeVisible()
})

test('un double-clic sur une boîte ouvre la table, et le diagramme reste', async ({ page }) => {
  await page.getByRole('button', { name: /^orders ·/ }).dblclick()

  await expect(page.getByRole('tab', { name: /^orders/ })).toHaveAttribute('aria-selected', 'true')
  // **C'est toute la raison d'un onglet plutôt qu'une vue de table** : le diagramme parle du schéma,
  // donc il survit à l'ouverture des tables qu'il montre.
  await expect(page.getByRole('tab', { name: /public/ })).toBeVisible()
  await page.getByRole('tab', { name: /public/ }).click()
  await expect(page.getByRole('button', { name: /^users ·/ })).toBeVisible()
})

test('aucun nom ni aucun type n’est coupé sous le plafond', async ({ page }) => {
  /*
   * **Le juge des constantes de largeur**, comme le test de bout en bout d'`ajustement.ts` l'est des
   * siennes. La largeur d'une boîte est un **calcul** — un compte de caractères multiplié par
   * l'avance du mono, plus ce que la feuille de style consomme hors texte — et rien dans ce calcul
   * ne sait ce que le navigateur rend vraiment.
   *
   * C'est ce test qui manquait : la première version comptait 30 px de chrome par ligne là où la CSS
   * en consomme 36, et les six pixels manquants coupaient **tous** les `timestamptz` du décor. Vu à
   * l'œil sur une capture, invisible à la suite entière — jsdom ne calcule aucune mise en page, et le
   * calcul se croyait juste.
   *
   * « Sous le plafond » est la nuance qui compte : au-delà de `LARGEUR_BOITE_MAX`, l'ellipse est le
   * comportement **voulu** — une boîte assez large pour un `character varying(255)[]` pousserait
   * tout le reste du graphe hors de l'écran. Le test regarde donc les boîtes que le plafond n'a pas
   * bornées.
   */
  const coupes = () =>
    page.evaluate(() => {
      // Le plafond de `disposition.ts`. Une boîte qui l'atteint a le droit de couper.
      const PLAFOND = 268
      const tronque = (element: Element | null | undefined) =>
        element ? element.scrollWidth - element.clientWidth : 0
      const vues: string[] = []
      for (const boite of document.querySelectorAll<HTMLElement>('[data-boite]')) {
        if (Math.round(boite.getBoundingClientRect().width) >= PLAFOND) continue
        const table = boite.dataset.boite ?? '?'
        const tete = boite.firstElementChild?.querySelector('span')
        if (tronque(tete) > 0) vues.push(`${table} : en-tête coupé de ${tronque(tete)} px`)
        for (const ligne of boite.querySelectorAll<HTMLElement>('[data-colonne]')) {
          const spans = [...ligne.querySelectorAll('span')]
          const perdu = Math.max(tronque(spans[0]), tronque(spans[1]))
          if (perdu > 0) vues.push(`${table}.${ligne.dataset.colonne} : coupé de ${perdu} px`)
        }
      }
      return vues
    })

  expect(await coupes(), 'en mode « Clés »').toEqual([])

  // **Et en « Toutes »**, où les colonnes masquées reparaissent : ce sont souvent les plus longues,
  // et le mode par défaut ne les aurait jamais mesurées.
  await page.getByRole('switch', { name: 'Toutes les colonnes' }).click()
  await expect(page.getByRole('button', { name: /^orders · 9 colonnes/ })).toBeVisible()
  expect(await coupes(), 'en mode « Toutes »').toEqual([])
})

test('la recherche amène la table trouvée à l’écran', async ({ page }) => {
  /*
   * **Ce qu'aucun test unitaire ne peut voir.** `Entrée` amène la correspondance à l'écran par
   * `scrollIntoView`, qui n'existe pas sans mise en page (règle n° 9) — jsdom en reçoit un
   * complément vide, et Vitest se contente de vérifier que la table est *désignée*. Que la vue se
   * **déplace** ne se mesure que dans un navigateur.
   */
  const champ = page.getByRole('textbox', { name: /Chercher une table ou une colonne/ })

  // Deux crans de zoom, pour que le dessin dépasse largement son cadre : sans débordement il n'y a
  // rien à faire défiler, et le test se vérifierait lui-même.
  await page.getByRole('button', { name: 'Agrandir' }).click()
  await page.getByRole('button', { name: 'Agrandir' }).click()
  const depart = await page
    .locator('[data-toile]')
    .evaluate((zone) => ({ x: zone.scrollLeft, y: zone.scrollTop }))

  await champ.fill('users')
  // Le compte répond avant qu'on appuie : c'est lui qui dit s'il y a quelque part où aller.
  await expect(page.getByText('1 trouvée')).toBeVisible()
  // La frappe seule **ne déplace pas** : elle marque. Déplacer sous les doigts de qui tape serait
  // désorientant sur une toile de plusieurs milliers de pixels.
  expect(
    await page.locator('[data-toile]').evaluate((zone) => ({
      x: zone.scrollLeft,
      y: zone.scrollTop,
    })),
  ).toEqual(depart)

  await champ.press('Enter')
  // **La table trouvée est à l'écran**, et non seulement quelque part dans la toile. La mesure
  // porte sur le recouvrement des deux rectangles : c'est la seule qui dise « visible » plutôt que
  // « présent dans la mise en page ».
  const dansLaVue = await page.evaluate(() => {
    const zone = document.querySelector('[data-toile]')?.getBoundingClientRect()
    const boite = document.querySelector('[data-boite="users"]')?.getBoundingClientRect()
    if (!zone || !boite) return null
    return (
      boite.left >= zone.left &&
      boite.right <= zone.right &&
      boite.top >= zone.top &&
      boite.bottom <= zone.bottom
    )
  })
  expect(dansLaVue).toBe(true)
  // Et elle est désignée : ses liens et les colonnes de ses clés s'allument, ce qui est la raison
  // d'y être allé.
  await expect(page.getByRole('button', { name: /^users ·/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('la recherche éteint ce qu’elle ne désigne pas, et le dit quand elle ne trouve rien', async ({
  page,
}) => {
  const champ = page.getByRole('textbox', { name: /Chercher/ })

  // Une colonne, pas seulement une table : `account_id` n'existe dans aucun nom de table du décor.
  await champ.fill('user_id')
  await expect(page.getByText('1 trouvée')).toBeVisible()
  const eteintes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-boite]')]
        .filter((boite) => (boite as HTMLElement).className.includes('boiteEteinte'))
        .map((boite) => boite.getAttribute('data-boite'))
        .sort(),
    )
  // Six des sept tables s'effacent ; `orders` porte `user_id` et reste.
  expect((await eteintes()).length).toBe(6)

  await champ.fill('zzzz')
  await expect(page.getByText('aucune')).toBeVisible()
  expect((await eteintes()).length).toBe(7)

  // Vider le champ rend le dessin entier : une recherche abandonnée ne laisse pas de trace.
  await champ.fill('')
  expect(await eteintes()).toEqual([])
})
