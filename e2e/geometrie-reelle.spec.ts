import { expect, test } from '@playwright/test'

// Ce que **l'application réelle** a montré, et que les tests de fidélité n'avaient pas vu.
//
// # Pourquoi une spec à part
//
// Le 18 août 2026, une capture de l'application lancée a fait apparaître neuf défauts de mise en page
// dans une interface dont chaque écran avait pourtant sa spec verte. Ils se ressemblent tous : chacun
// est une **conséquence de composition** — une primitive correcte dans sa vitrine, fausse quand un
// voisin décide sa largeur ou quand macOS décide d'afficher ses barres de défilement.
//
// Les specs par écran vérifient qu'un écran ressemble à son mockup. Celle-ci vérifie ce qui n'appartient
// à aucun écran : que rien ne sort de la fenêtre, que ce qui doit défiler défile, et que ce qui a été
// rendu discret l'est resté. Les mesures viennent de la capture, pas d'une intuition.
//
// 1360 × 814 : la taille de la fenêtre sur la capture.

test.use({ viewport: { width: 1360, height: 814 } })

async function ouvrirUneTable(page: import('@playwright/test').Page) {
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /^analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.getByRole('treeitem', { name: /^orders 1\.9/ }).click()
  await page.waitForSelector('[role=grid]')
  await page.evaluate(() => document.fonts.ready)
}

test('rien ne dépasse le bord droit de la fenêtre', async ({ page }) => {
  await ouvrirUneTable(page)

  const hors = await page.evaluate(() => {
    const limite = window.innerWidth
    /**
     * Un ancêtre qui défile horizontalement **autorise** le débordement : c'est même sa raison d'être.
     *
     * Sans ce filtre, l'assertion comptait les 113 éléments d'une grille de neuf colonnes plus large
     * que sa fenêtre — un état parfaitement sain, qui n'a rien à voir avec le défaut visé. Elle
     * passait tant que le décor de démo tenait dans la largeur, et une colonne ajoutée pour une autre
     * mesure l'a fait basculer : **une assertion qui dépend d'une propriété accidentelle du décor
     * finit par se déclencher sur autre chose que ce qu'elle garde.**
     */
    const dansUnDefilement = (element: Element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(parent).overflowX)) return true
      }
      return false
    }
    // Tout élément dont la boîte franchit le bord droit, avec son nom de classe : c'est ainsi que les
    // quatre coupables d'origine ont été trouvés, et c'est la mesure qui les empêche de revenir.
    return [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > limite + 1)
      .filter((element) => !dansUnDefilement(element))
      .map((element) => `${element.tagName}.${element.className}`)
  })
  // La cause de la coupure du bord droit n'était pas un seul élément mais **une chaîne d'un pixel** :
  // une variante `width: 100%` qui ajoutait son filet aux 100 %, puis un bouton de pied de sidebar de
  // 6 px de trop, puis un panneau de détail figé à la mesure du mockup (300 px) dans un panneau
  // redimensionnable de 296. Chacun poussait le suivant. Le projet n'a **pas** de `box-sizing: border-box`
  // global — c'est une décision documentée dans `reset.css` — donc chaque primitive doit déclarer la
  // sienne, et cette assertion est ce qui dit qu'une nouvelle l'a oublié.
  expect(hors).toEqual([])
})

test('aucun élément à `width: 100%` ne déborde de la boîte qui le contient', async ({ page }) => {
  await ouvrirUneTable(page)

  const debordants = await page.evaluate(() => {
    // Le motif exact du défaut : une largeur de 100 %, plus une bordure ou un remplissage, dans une
    // primitive qui n'a pas déclaré `border-box`. On ne teste donc pas tous les éléments — seulement
    // ceux qui portent ce motif, où le débordement est **forcément** un oubli et jamais une intention.
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        if (getComputedStyle(element).boxSizing !== 'content-box') return false
        const parent = element.parentElement
        if (!parent) return false
        const styleDuParent = getComputedStyle(parent)
        if (styleDuParent.overflowX !== 'visible') return false
        // Le bord droit **utile** du parent : sa boîte moins son remplissage et son filet, c'est-à-dire
        // la ligne que `width: 100%` prétend justement atteindre sans la franchir.
        const bordUtile =
          parent.getBoundingClientRect().right -
          Number.parseFloat(styleDuParent.paddingRight || '0') -
          Number.parseFloat(styleDuParent.borderRightWidth || '0')
        return element.getBoundingClientRect().right > bordUtile + 0.5
      })
      .map((element) => `${element.tagName}.${element.className}`)
  })
  // Le bouton « Nouvelle console » sortait de la colonne de 2 px, et l'assertion du bord de fenêtre ne
  // le voyait pas : un débordement **à l'intérieur** d'un panneau reste dans la fenêtre. Sa cause est
  // la plus discrète de la série — `box-sizing: content-box` posé pour une raison juste, la hauteur du
  // handoff qui désigne le contenu, mais `box-sizing` ne se règle pas par axe et la largeur valait
  // 100 %. La réponse est de convertir la valeur, pas de changer le modèle de boîte.
  expect(debordants).toEqual([])
})

test('la racine ne défile pas horizontalement', async ({ page }) => {
  await ouvrirUneTable(page)
  const debordement = await page.evaluate(() => {
    const racine = document.getElementById('root') ?? document.body
    return racine.scrollWidth - racine.clientWidth
  })
  // Mesure complémentaire de la précédente : un enfant peut être coupé par un ancêtre en `overflow:
  // hidden` — sa boîte reste dans la fenêtre, mais la trame est fausse. `scrollWidth` le voit.
  expect(debordement).toBeLessThanOrEqual(0)
})

test('aucun conteneur défilant ne rebondit aux extrémités', async ({ page }) => {
  await ouvrirUneTable(page)

  const rebondissants = await page.evaluate(() => {
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const defile = /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY)
        return defile && style.overscrollBehavior !== 'none'
      })
      .map((element) => `${element.tagName}.${element.className}`)
  })
  // **Une vérification de déclaration, et elle est assumée comme telle.** Le rebond élastique est un
  // comportement de WKWebView : Chromium ne le rend pas, donc il n'y a rien à mesurer géométriquement
  // — c'est le même mur que la discrétion des barres de défilement (`DEFAUTS.md` n° 73), et il est dit
  // plutôt que contourné par une fausse mesure. Ce que ce test attrape est réel malgré tout : le
  // prochain panneau défilant qui redéclare `overscroll-behavior` pour son compte, ou une régression
  // de la règle universelle de `reset.css`. Quatorze feuilles déclarent un débordement aujourd'hui ;
  // les nommer une à une ici serait la quinzième à oublier.
  expect(rebondissants).toEqual([])
})

test('un défilement rapide ne laisse aucune bande vide', async ({ page }) => {
  await ouvrirUneTable(page)

  const mesures = await page.evaluate(async () => {
    const zone = document.querySelector('[role=grid] > [role=presentation]') as HTMLElement
    // Le vide **au-dessus et au-dessous** des lignes montées, dans la fenêtre visible. Une valeur
    // négative dit que les lignes dépassent de la fenêtre : c'est l'état sain, celui où l'overscan
    // travaille.
    const vide = () => {
      const fenetre = zone.getBoundingClientRect()
      const boites = [...zone.querySelectorAll('[role=row][aria-rowindex]')]
        .map((ligne) => ligne.getBoundingClientRect())
        .filter((boite) => boite.height > 0)
      return {
        enHaut: Math.round(Math.min(...boites.map((b) => b.top)) - fenetre.top),
        enBas: Math.round(fenetre.bottom - Math.max(...boites.map((b) => b.bottom))),
      }
    }

    // **Un lancer, trame par trame** : vingt sauts de 400 px, et on retient le pire vide observé. Le
    // geste réel du trackpad produit exactement cette suite — un `scroll` par trame, sans pause.
    let pire = { enHaut: 0, enBas: 0 }
    for (let trame = 0; trame < 20; trame++) {
      zone.scrollTop += 400
      await new Promise((resoudre) => requestAnimationFrame(() => resoudre(null)))
      const actuel = vide()
      pire = {
        enHaut: Math.max(pire.enHaut, actuel.enHaut),
        enBas: Math.max(pire.enBas, actuel.enBas),
      }
    }

    // Puis un saut brusque, le cas le plus dur : la barre de défilement traînée d'un bloc.
    zone.scrollTop = 6000
    await new Promise((resoudre) => requestAnimationFrame(() => resoudre(null)))
    return { pire, apresUnSaut: vide() }
  })

  // **La mesure porte sur une seule trame après le geste, et c'est tout le sujet.** Un `scroll` est un
  // événement *continu* pour React : la mise à jour qu'il déclenche est de priorité non urgente, donc
  // différable. Le temps qu'elle passe, la toile est à sa nouvelle position et les lignes montées sont
  // restées à l'ancienne — 265 px de blanc pendant un lancer, près de la hauteur entière de la fenêtre
  // après un saut. Attendre 300 ms avant de mesurer aurait tout montré vert : le défaut n'est pas que
  // l'affichage soit faux, c'est qu'il le soit **le temps d'une trame**.
  expect(mesures.pire.enBas).toBeLessThanOrEqual(0)
  expect(mesures.pire.enHaut).toBeLessThanOrEqual(0)
  expect(mesures.apresUnSaut.enBas).toBeLessThanOrEqual(0)
  expect(mesures.apresUnSaut.enHaut).toBeLessThanOrEqual(0)
})

test('les barres de défilement ne réservent aucune place', async ({ page }) => {
  await ouvrirUneTable(page)
  const gouttieres = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((element) => {
        const style = getComputedStyle(element)
        return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY)
      })
      .map((element) => ({
        classe: element.className,
        // La gouttière : ce que la barre native prend à la mise en page. Zéro, ou elle dessine une
        // colonne grise sur la trame et rogne le texte des cellules.
        verticale: (element as HTMLElement).offsetWidth - element.clientWidth,
        horizontale: (element as HTMLElement).offsetHeight - element.clientHeight,
      }))
      .filter((mesure) => mesure.verticale > 0 || mesure.horizontale > 0),
  )
  // Les barres natives sont masquées partout (`reset.css`) et celles du produit vivent dans une couche
  // `fixed`. **Styler `::-webkit-scrollbar` ne pouvait pas y arriver** : WebKit rend alors une barre
  // classique, permanente et qui réserve sa place — les deux exigences étaient contradictoires en CSS.
  expect(gouttieres).toEqual([])
})

test('un curseur paraît pendant le geste, sous l’en-tête collé, puis s’efface', async ({
  page,
}) => {
  await ouvrirUneTable(page)

  const curseurs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[class*="couche"] > div')].map((pouce) => ({
        classe: pouce.className,
        opacite: Number(getComputedStyle(pouce).opacity),
        haut: pouce.getBoundingClientRect().top,
      })),
    )

  // Au repos, aucun curseur n'existe même : ils sont créés au premier geste.
  expect(await curseurs()).toEqual([])

  await page.locator('[role=grid]').hover()
  await page.mouse.wheel(0, 300)
  await expect.poll(async () => (await curseurs()).length).toBeGreaterThan(0)
  // **Le retour en haut de course est posé, non demandé à la molette.** Une roulette rend la main
  // avant que le défilement ne soit arrivé, et la mesure qui suit lisait alors un curseur en pleine
  // course — le test passait seul et échouait dans la suite parallèle, ce qui est la signature d'une
  // attente implicite. Deux trames pour laisser l'événement `scroll` replacer le curseur.
  const mesures = await page.evaluate(async () => {
    const zone = document.querySelector('[role=grid] > [role=presentation]') as HTMLElement
    zone.scrollTop = 0
    await new Promise((resoudre) => requestAnimationFrame(() => resoudre(null)))
    await new Promise((resoudre) => requestAnimationFrame(() => resoudre(null)))
    const pouce = document.querySelector('[class*="vertical"]')?.getBoundingClientRect()
    const entete = document.querySelector('[class*="head"]')?.getBoundingClientRect()
    const premiereLigne = document
      .querySelector('[role=row][aria-rowindex="3"]')
      ?.getBoundingClientRect()
    return {
      pouce: pouce?.top ?? null,
      entete: entete?.bottom ?? null,
      ligne: premiereLigne?.top ?? null,
      defilement: zone.scrollTop,
    }
  })
  // Le garde de la mesure : elle ne vaut qu'en haut de course.
  expect(mesures.defilement).toBe(0)
  // **En haut de course, le curseur commence à la première ligne de données**, pas au-dessus. Sa piste
  // exclut ce qui est collé en haut de la zone — l'en-tête des colonnes et la ligne de filtres. Sans
  // cela, il décrivait un contenu commençant plus haut qu'il ne commence. Signalé le 19 août 2026.
  expect(mesures).toMatchObject({
    pouce: expect.any(Number),
    entete: expect.any(Number),
    ligne: expect.any(Number),
  })
  expect(Math.round(mesures.pouce as number)).toBe(Math.round(mesures.entete as number))
  expect(Math.round(mesures.pouce as number)).toBe(Math.round(mesures.ligne as number))

  // Puis il s'efface, la rémanence passée. C'est la seconde exigence : visible **pendant** le geste.
  await expect
    .poll(async () => (await curseurs()).every((c) => c.opacite === 0), { timeout: 4000 })
    .toBe(true)
})

test('la grille défile horizontalement au lieu d’écraser ses colonnes', async ({ page }) => {
  await ouvrirUneTable(page)

  // **Ni l'élément `role=grid`, ni son parent** : `VirtualGrid` (`10a`) place le débordement sur une
  // enveloppe interne en `role="presentation"`, parce qu'un `role=grid` attend des `rowgroup` pour
  // enfants. C'est cette enveloppe qui défile, et donc elle qu'il faut mesurer.
  const avant = await page.evaluate(() => {
    const zone = document.querySelector('[role=grid] > [role=presentation]')
    if (!zone) return null
    return { debordement: zone.scrollWidth - zone.clientWidth, gauche: zone.scrollLeft }
  })
  // Dix-huit colonnes dans une colonne centrale de 842 px : il **doit** y avoir de quoi défiler. Sans
  // conteneur défilable, `table-layout: fixed` répartissait la largeur disponible entre les dix-huit et
  // écrasait chaque colonne à une trentaine de pixels — les valeurs devenaient illisibles, et la
  // molette n'avait rien à faire défiler puisque rien ne débordait.
  expect(avant?.debordement).toBeGreaterThan(0)

  // Le geste réel : molette horizontale, ou ⇧ + molette, que WebKit traduit en `deltaX`.
  await page.locator('[role=grid]').hover()
  await page.mouse.wheel(240, 0)
  // **`poll` et non une lecture directe** : le défilement à la molette est appliqué par le
  // compositeur, pas dans la foulée de l'événement. Une mesure immédiate lit `0` alors que le geste a
  // bien porté — et ce test-là a d'abord échoué pour cette raison, ce qui aurait fait corriger un code
  // correct.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('[role=grid] > [role=presentation]')?.scrollLeft ?? null,
      ),
    )
    // **Le geste, pas une propriété CSS.** Vérifier `overflow-x: auto` dirait que la déclaration est
    // là ; ceci dit que la molette déplace vraiment le contenu.
    .toBeGreaterThan(0)
})

test('la bande d’onglets défile sans montrer de barre', async ({ page }) => {
  await ouvrirUneTable(page)
  const bande = await page.evaluate(() => {
    // Sélection par classe : la bande de `10b` **n'a pas** de `role=tablist`, et c'est délibéré —
    // ses onglets ne commutent pas des panneaux d'une même page, ils portent des tables ouvertes.
    const strip = document.querySelector('[class*="strip"]')
    if (!strip) return null
    const style = getComputedStyle(strip)
    return {
      // **Le débordement vertical, et non l'épaisseur d'une barre.** Chromium sans tête rend des barres
      // en survol, qui n'occupent aucune place : mesurer leur épaisseur ici ne prouverait rien, et un
      // sabotage laissait effectivement le test vert. Ce qui se mesure des deux côtés, c'est la cause —
      // un pixel de contenu de trop dans une enveloppe qui, en posant `overflow-x: auto`, a rendu son
      // axe vertical défilable sans le demander.
      debordementVertical: strip.scrollHeight - strip.clientHeight,
      defilable: style.overflowX,
      confine: style.overflowY,
    }
  })
  expect(bande?.defilable).toBe('auto')
  expect(bande?.confine).toBe('hidden')
  expect(bande?.debordementVertical).toBeLessThanOrEqual(0)
})

test('la barre de fil d’Ariane contient son contrôle segmenté, même à l’étroit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 700 })
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /^analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.waitForSelector('nav[aria-label]')
  await page.evaluate(() => document.fonts.ready)

  const mesures = await page.evaluate(() => {
    const fil = document.querySelector('nav[aria-label^="Chemin"]')
    const barre = fil?.parentElement
    const segmente = barre?.querySelector('fieldset')
    if (!barre || !segmente) return null
    const b = barre.getBoundingClientRect()
    const s = segmente.getBoundingClientRect()
    const remplissage = Number.parseFloat(getComputedStyle(barre).paddingRight)
    return {
      dansLaBarre: s.right <= b.right - remplissage + 1,
      remplissage,
      // Le contrôle garde sa largeur : c'est le seul élément de la rangée dont un pixel manquant rend
      // une cible incliquable.
      largeurDuControle: Math.round(s.width),
      dansLaFenetre: s.right <= window.innerWidth,
    }
  })
  // 960 est la largeur minimale déclarée du produit. À cette largeur, la rangée demandait 649 px pour
  // trois éléments fixes dans une colonne centrale de 442 : le contrôle « Tables / Vues / Fonctions /
  // Index », dernier de la rangée, sortait par la droite. Ce qui cède est décidé — le fil se tronque,
  // le champ se rétrécit, le contrôle jamais.
  expect(mesures?.dansLaFenetre).toBe(true)
  expect(mesures?.dansLaBarre).toBe(true)
  expect(mesures?.remplissage).toBeGreaterThan(0)
  expect(mesures?.largeurDuControle).toBe(269)
})

test('le séparateur est un trait d’un pixel, et une barre au survol', async ({ page }) => {
  await ouvrirUneTable(page)
  const poignee = page.locator('[role=separator]').first()

  const trait = await page.evaluate(() => {
    const separateur = document.querySelector('[role=separator]') as HTMLElement
    return {
      // **La poignée est le trait.** Elle faisait 5 px transparents autour d'un trait de 1 : entre une
      // sidebar en `--paper-alt` et un centre en `--paper`, ces 5 px dessinaient une bande claire.
      largeur: Math.round(separateur.getBoundingClientRect().width),
      fond: getComputedStyle(separateur).backgroundColor,
      // La barre du survol est un `::after` en débord : invisible aux mesures de boîte, donc elle ne
      // déplace pas les panneaux quand elle paraît.
      barreAuRepos: Number(getComputedStyle(separateur, '::after').opacity),
    }
  })
  expect(trait.largeur).toBe(1)
  expect(trait.fond).not.toBe('rgba(0, 0, 0, 0)')
  expect(trait.barreAuRepos).toBe(0)

  // **`mouse.move` et non `hover()`.** Sur un élément d'un pixel de large, les vérifications
  // d'actionnabilité de Playwright n'aboutissent pas — elles exigent que l'élément *lui-même* soit
  // sous le point, et le débord attrapable est un pseudo-élément. Ce que ce test veut est le geste ;
  // la preuve que la zone est bien attrapable de part et d'autre est dans `10b`, au point.
  const boite = await poignee.boundingBox()
  if (!boite) throw new Error('la poignée doit être visible')
  await page.mouse.move(boite.x + boite.width / 2, boite.y + 40)
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          getComputedStyle(document.querySelector('[role=separator]') as Element, '::after')
            .opacity,
        ),
      ),
    )
    .toBe(1)

  // Et les panneaux n'ont pas bougé d'un pixel : c'est ce que le débord garantit.
  const apres = await page.evaluate(() =>
    Math.round(
      (
        document.querySelector('[role=separator]')?.previousElementSibling as HTMLElement
      ).getBoundingClientRect().width,
    ),
  )
  expect(apres).toBe(212)
})

test('les libellés des actions du panneau tiennent dans leur bouton', async ({ page }) => {
  // **La vue schéma avec un objet sélectionné, et non une table ouverte.** Les actions du panneau de
  // détail n'existent que là : une table ouverte laisse la place au panneau de ligne. La première
  // version de ce test ouvrait une table, ne trouvait donc aucun de ces boutons, et **passait sur un
  // ensemble vide** — un sabotage l'a laissé vert, ce qui est la seule façon de s'en apercevoir.
  await page.goto('/?demo')
  await page.getByRole('treeitem', { name: /Atelier Nord/ }).click()
  await page.getByRole('treeitem', { name: /^analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  await page.waitForSelector('nav[aria-label]')
  await page.getByRole('row').nth(1).click()
  await page.evaluate(() => document.fonts.ready)

  const boutons = await page.evaluate(
    () =>
      [...document.querySelectorAll('button')].filter((bouton) =>
        /SELECT dans console/.test(bouton.textContent ?? ''),
      ).length,
  )
  // Le garde-fou de l'ensemble vide : si ce bouton disparaît ou change de libellé, ce test doit le
  // dire, pas se taire.
  expect(boutons).toBe(1)

  const debordements = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((bouton) => bouton.scrollHeight > bouton.clientHeight)
      .map((bouton) => ({
        texte: bouton.textContent?.trim(),
        contenu: bouton.clientHeight,
        reel: bouton.scrollHeight,
      })),
  )
  // « SELECT dans console » demande 118 px de texte dans un bouton qui en offre 104 : il passait donc à
  // la ligne, et deux lignes à l'interligne par défaut débordaient d'un bouton de 28 px. **Le mockup
  // porte exactement le même défaut** — mêmes colonnes, même corps, même libellé — donc la fidélité ne
  // pouvait pas trancher. C'est une mesure que le handoff n'avait pas faite.
  expect(debordements).toEqual([])
})

test('rien ne se sélectionne, sauf ce qui s’édite', async ({ page }) => {
  await ouvrirUneTable(page)

  const chrome = await page.evaluate(() => {
    const selecteurs = [
      '[role=treeitem]',
      '[role=tab]',
      '[role=columnheader]',
      '[role=row] [class*="td"]',
      'button',
      '[role=combobox]',
    ]
    // **Les absents sont écartés, et l'assertion vérifie qu'il en reste.** La liste contenait `label`,
    // qui n'existe plus dans cet écran depuis que les listes déroulantes ne sont pas des contrôles
    // natifs : `getComputedStyle(null)` levait une exception, et un test qui explose ne dit rien de ce
    // qu'il mesurait.
    const presents = selecteurs
      .map((selecteur) => ({ selecteur, element: document.querySelector(selecteur) }))
      .filter(
        (entree): entree is { selecteur: string; element: Element } => entree.element !== null,
      )
    return presents.map(({ selecteur, element }) => ({
      selecteur,
      selection: getComputedStyle(element).userSelect,
      curseur: getComputedStyle(element).cursor,
    }))
  })
  // Le garde de l'ensemble vide : la leçon du n° 72.
  expect(chrome.length).toBeGreaterThanOrEqual(5)
  // Glisser sur un libellé, un onglet, une ligne d'arbre ou une cellule ne surligne plus rien : dans
  // une application de bureau, le texte de l'interface n'est pas du contenu.
  expect(chrome.filter((mesure) => mesure.selection !== 'none')).toEqual([])
  // Et le curseur en I disparaît avec : il annonçait une saisie là où il n'y en a pas.
  expect(chrome.filter((mesure) => mesure.curseur === 'text')).toEqual([])

  // **La limite : ce qui s'édite, et rien d'autre.** Une première version épargnait aussi les blocs de
  // données — `pre`, `code` — au motif qu'un DDL doit pouvoir se copier à la souris. À l'usage, ces
  // blocs *sont* l'interface, et la copie ne dépend plus d'eux : chacun a son bouton, et un champ du
  // panneau se copie au clic droit. Une saisie, elle, ne s'édite pas sans caret.
  await page.getByRole('grid').getByRole('row').nth(2).click()
  await page.getByRole('tab', { name: 'JSON' }).click()
  const donnees = await page.evaluate(() => {
    const bloc = document.querySelector('pre')
    const saisie = document.querySelector('input')
    return {
      bloc: bloc ? getComputedStyle(bloc).userSelect : null,
      saisie: saisie ? getComputedStyle(saisie).userSelect : null,
    }
  })
  expect(donnees.bloc).toBe('none')
  expect(donnees.saisie).toBe('text')

  // Et un vrai glissement sur un bloc de données ne surligne rien — la propriété, pas la déclaration.
  const bloc = page.locator('pre').first()
  const boite = await bloc.boundingBox()
  if (boite) {
    await page.mouse.move(boite.x + 8, boite.y + 6)
    await page.mouse.down()
    await page.mouse.move(boite.x + boite.width - 8, boite.y + boite.height - 6, { steps: 10 })
    await page.mouse.up()
  }
  expect(await page.evaluate(() => document.getSelection()?.toString() ?? '')).toBe('')
})
