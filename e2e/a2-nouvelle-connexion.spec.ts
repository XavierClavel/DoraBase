import { expect, test } from '@playwright/test'

// `08b` est presque entièrement une spec de **mise en page**, donc presque entièrement hors de
// portée de Vitest : jsdom ne calcule aucun layout, et une grille dont les colonnes ne
// s'alignent pas y passe tous les tests unitaires. Les mesures ci-dessous sont la vérification
// principale de cette spec, pas un complément.
//
// **L'écran est atteint par les deux étapes du parcours** (`24d`). Le bouton de `A1` ouvrait
// directement cette modale, du temps où elle savait créer un projet au passage (`08f`) ; il ouvre
// maintenant l'étape 1, et `A2` est l'étape 2. Le chemin a changé, les mesures non — et c'est
// précisément ce que ce passage vérifie en s'y rendant.
test.beforeEach(async ({ page }) => {
  // **Par la démo, où le parcours répond.** `create_project` est une commande Tauri : sur `/`, l'étape 1
  // refuse hors de la webview, et l'étape 2 — c'est-à-dire cet écran — serait inatteignable. La démo
  // fournit sa propre création (`24d`), donc les deux étapes s'enchaînent.
  await page.goto('/?demo')
  await page.getByRole('button', { name: /Nouveau projet/ }).click()
  // Étape 1 : un nom suffit, les environnements arrivant préremplis du trio de `23a`.
  await page.getByLabel('Nom du projet').fill('Atelier Nord')
  await page.getByRole('button', { name: /Continuer/ }).click()
  // Étape 2 : la modale de connexion, projet imposé.
  await page.waitForSelector('[data-testid=projet-impose]')
  await page.evaluate(() => document.fonts.ready)
})

/** Le rectangle d'un champ, désigné par son étiquette. */
async function boite(page: import('@playwright/test').Page, etiquette: string) {
  return page.evaluate((nom) => {
    // **Deux façons d'être étiqueté, depuis que les listes ne sont plus natives.** Un `<input>` garde
    // son `<label for>` ; une liste déroulante maison n'est pas un contrôle de formulaire, son
    // étiquette est un `<span>` qu'elle désigne par `aria-labelledby`. Chercher les `<label>` seuls
    // rendait `undefined` sur « Projet » et « Mode SSL », et trois mesures de grille avec.
    // **Trois façons d'être étiqueté.** Un `<input>` garde son `<label for>` ; une liste déroulante
    // maison désigne un `<span id>` par `aria-labelledby` (`23d`) ; et le constat de projet imposé
    // (`24c`) n'est ni l'un ni l'autre — c'est du texte sous un `div` d'étiquette. Le troisième
    // sélecteur le rattrape, sans quoi trois mesures de grille rendaient `undefined`.
    const etiquettes = [...document.querySelectorAll('label, span[id], [class*="label"]')]
    const cible = etiquettes.find((l) => l.textContent?.trim() === nom)
    const champ =
      cible instanceof HTMLLabelElement && cible.htmlFor
        ? document.getElementById(cible.htmlFor)
        : cible?.id
          ? document.querySelector(`[aria-labelledby="${cible.id}"]`)
          : (cible?.nextElementSibling ?? null)
    // Le champ à suffixe est enveloppé : c'est l'enveloppe qui porte la bordure, donc la
    // boîte visible.
    // L'enveloppe porte la bordure, donc la boîte visible. Pour une liste, le champ est le `button`
    // à l'intérieur de cette enveloppe, et la racine de `ListeDeroulante` s'interpose : on remonte
    // jusqu'à celle qui porte `wrap`.
    const visible =
      champ?.closest('[class*="wrap"]') ??
      (champ?.parentElement?.className.includes('wrap') ? champ.parentElement : champ)
    if (!visible) return null
    const r = visible.getBoundingClientRect()
    return {
      x: Math.round(r.x),
      droite: Math.round(r.right),
      largeur: Math.round(r.width),
      hauteur: Math.round(r.height),
    }
  }, etiquette)
}

test('les champs du formulaire font 30 px', async ({ page }) => {
  const hauteurs = await Promise.all(
    ['Nom de la base', 'Hôte', 'Port', 'Base par défaut', 'Utilisateur', 'Mot de passe'].map(
      async (nom) => (await boite(page, nom))?.hauteur,
    ),
  )
  // 30 px de contenu plus 1 px de bordure de chaque côté, comme le mockup. `Field` est en
  // `border-box` avec la hauteur explicitée : voir la note de `Field.module.css`, réécrite
  // après avoir mesuré un débordement de largeur.
  expect(hauteurs).toEqual([32, 32, 32, 32, 32, 32])
})

// **Ce test a trouvé le défaut le plus sérieux de `08b`.** En `content-box`, `width: 100%`
// désigne la largeur du *contenu* : remplissage et bordure s'ajoutent par-dessus, et le champ
// déborde de sa piste. Le Port rendait 104 px dans une piste de 84. Le mockup n'a pas ce
// problème parce que ses champs sont des `<div>` à largeur `auto`, qui se rétractent.
test('le port occupe exactement sa piste de 84 px et se colle à l’hôte', async ({ page }) => {
  const hote = await boite(page, 'Hôte')
  const port = await boite(page, 'Port')

  expect(port?.largeur).toBe(84)
  // Gap de 8 px entre les deux, contre les 18 px de la grille principale : le port est une
  // sous-partie de l'hôte, pas un champ voisin. C'est exactement ce qu'une pile de flex
  // aurait perdu.
  expect((port?.x ?? 0) - (hote?.droite ?? 0)).toBe(9)
})

test('les colonnes de la grille s’alignent d’une rangée à l’autre', async ({ page }) => {
  const gauche = await Promise.all(
    ['Hôte', 'Base par défaut', 'Mode SSL'].map(async (nom) => (await boite(page, nom))?.x),
  )
  const droite = await Promise.all(
    ['Base par défaut', 'Utilisateur'].map(async (nom) => (await boite(page, nom))?.x),
  )

  // La colonne de gauche est la même sur les trois rangées où elle apparaît. Reproduire la
  // grille en flex imbriqué donnerait des colonnes décalées — le défaut que `08b` nomme et
  // que Vitest ne peut pas voir.
  expect(new Set(gauche.filter((x) => x === gauche[0])).size).toBe(1)
  expect(droite[0]).not.toBe(gauche[0])
})

test('la rangée d’identité suit la grille 1fr 196px auto', async ({ page }) => {
  const projet = await boite(page, 'Projet')
  expect(projet?.largeur).toBe(196)
})

test('les trois cellules de la rangée d’identité s’alignent en bas', async ({ page }) => {
  const bas = await page.evaluate(() => {
    const rangee = document.querySelector('[class*=rowIdentity]')
    if (!rangee) return null
    // Les **boîtes visibles** des trois contrôles. Pour le select c'est son enveloppe, qui
    // porte la bordure : une première version mesurait le `<select>` lui-même et trouvait
    // 16 px de haut, ce qui a révélé un autre défaut — voir le test suivant.
    // **Le second contrôle est un constat à l'étape 2** (`24c`) : le sélecteur cède la place à du
    // texte étiqueté, qui n'a pas d'enveloppe `wrap`. On mesure donc celui des deux qui est là.
    const controles = [
      rangee.querySelector('input'),
      rangee.querySelector('[class*=wrap], [data-testid=projet-impose]'),
      rangee.querySelector('fieldset label'),
    ]
    return controles.map((c) => (c ? Math.round(c.getBoundingClientRect().bottom) : null))
  })

  // `align-items: end` : les étiquettes n'ont pas la même hauteur, donc sans lui les
  // contrôles se décaleraient verticalement les uns par rapport aux autres.
  expect(new Set(bas)).toHaveProperty('size', 1)
})

// L'autre défaut trouvé à la mesure : le `<select>` gardait sa hauteur intrinsèque de 16 px
// dans une boîte de 32, donc cliquer dans le remplissage du champ n'ouvrait pas la liste.
// Invisible en test unitaire, et invisible à l'œil — la boîte, elle, avait la bonne taille.
test('le select occupe toute la hauteur de sa boîte, donc tout le champ est cliquable', async ({
  page,
}) => {
  const mesures = await page.evaluate(() => {
    // **`[role=combobox]` et non `select`** : le natif est parti (aucun composant natif visible dans
    // ce produit). Le défaut que ce test garde, lui, n'a pas changé de nature — un champ qui ne
    // remplit pas sa boîte laisse du remplissage inerte au clic.
    const champ = document.querySelector('[role=combobox]')
    const enveloppe = champ?.closest('[class*="wrap"]')
    if (!champ || !enveloppe) return null
    return {
      select: Math.round(champ.getBoundingClientRect().height),
      boite: Math.round(enveloppe.getBoundingClientRect().height),
    }
  })

  // 32 px de boîte moins les 2 px de bordure : le select remplit les 30 px intérieurs.
  expect(mesures?.boite).toBe(32)
  expect(mesures?.select).toBe(30)
})

test('les trois boutons d’environnement ont la même boîte, prod compris', async ({ page }) => {
  const boites = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=prod]'),
    )
    return [...(groupe?.querySelectorAll('label') ?? [])].map((l) => {
      const r = l.getBoundingClientRect()
      return { hauteur: Math.round(r.height) }
    })
  })

  // `prod` porte une bordure de 1.5 px là où ses voisins en ont 1. En `content-box`, il
  // serait plus haut d'un pixel — visible dans une rangée de trois boutons collés. C'est la
  // raison d'être du `border-box` de `RadioGroup`.
  expect(boites).toHaveLength(3)
  expect(new Set(boites.map((b) => b.hauteur))).toHaveProperty('size', 1)
})

// **Portée à la modale.** Le décor est la démo depuis `24d`, et sa barre de titre porte un sélecteur
// d'environnement dont la valeur est aussi « prod » : une recherche à l'échelle de la page en trouve
// deux, et le mode strict de Playwright refuse — à juste titre.
test('prod garde son habillage rouge même sélectionné', async ({ page }) => {
  // C'est le `<label>` qu'on clique, pas l'`<input>` : celui-ci est masqué visuellement et en
  // `pointer-events: none`, comme il doit l'être. Un vrai utilisateur clique le libellé.
  const modale = page.getByRole('dialog')
  await modale.getByText('prod', { exact: true }).click()
  await expect(modale.getByRole('radio', { name: 'prod' })).toBeChecked()

  const couleurs = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[value=prod]')
    const label = input?.closest('label')
    if (!label) return null
    const style = getComputedStyle(label)
    return { fond: style.backgroundColor, bordure: style.borderTopColor }
  })

  // `RadioGroup` met le fond accent sur l'option active. Ici il faut qu'il perde : le rouge
  // est une propriété de *prod*, pas de *actif*. Sans le sélecteur doublé qui gagne en
  // spécificité, `prod` sélectionné deviendrait orange.
  expect(couleurs?.fond).toBe('rgb(252, 233, 228)') // --danger-bg
  expect(couleurs?.bordure).toBe('rgb(217, 67, 47)') // --danger
})

test('le sélecteur de moteur tient sur une seule ligne', async ({ page }) => {
  const lignes = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=postgresql]'),
    )
    const hauts = [...(groupe?.querySelectorAll('label') ?? [])].map((l) =>
      Math.round(l.getBoundingClientRect().top),
    )
    return new Set(hauts).size
  })

  // Sept boutons dans 820 px moins les marges : ils doivent tenir. `flex-wrap` les
  // laisserait passer à la ligne sans que rien ne le signale.
  expect(lignes).toBe(1)
})

// **Ce test a déménagé.** Il vérifiait que la barre de titre de `A1` se ternit derrière la modale ;
// depuis `24d`, le bouton de `A1` ouvre l'étape 1, et cette spec atteint `A2` par la démo — où il n'y a
// pas d'écran d'accueil à ternir. La propriété reste vraie et reste vérifiée : `a1.spec.ts` la mesure
// sur `A1`, qui est son écran.

test('à 960 px la modale reste entièrement visible et la grille tient', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 })

  const etat = await page.evaluate(() => {
    const coquille = document.querySelector('[role=dialog]')
    if (!coquille) return null
    const r = coquille.getBoundingClientRect()
    return {
      gauche: r.left,
      droite: window.innerWidth - r.right,
      // Le corps de la modale peut dépasser la hauteur de la fenêtre à 600 px : c'est
      // attendu et non un défaut, mais la largeur ne doit jamais déborder.
      debordeEnLargeur: document.documentElement.scrollWidth > window.innerWidth,
    }
  })

  expect(etat?.gauche).toBeGreaterThanOrEqual(0)
  expect(etat?.droite).toBeGreaterThanOrEqual(0)
  expect(etat?.debordeEnLargeur).toBe(false)
})

// --- Panneau proxy / tunnel (08c) -------------------------------------------------------

async function deplierTunnel(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Proxy \/ tunnel/ }).click()
  await page.waitForSelector('input[inputmode=numeric] >> nth=1')
}

test('les champs du panneau font 28 px, contre 30 pour le formulaire', async ({ page }) => {
  await deplierTunnel(page)

  const mesures = await page.evaluate(() => {
    const panneau = [...document.querySelectorAll('section')].find((s) =>
      s.textContent?.includes('Proxy / tunnel'),
    )
    if (!panneau) return null
    const hauteur = (el: Element | null) =>
      el ? Math.round(el.getBoundingClientRect().height) : null
    return {
      champs: [...panneau.querySelectorAll('input')].map((i) =>
        hauteur(i.parentElement?.className.includes('wrap') ? i.parentElement : i),
      ),
      // La boîte visible de la liste : son enveloppe `wrap`, qui porte la bordure. `[role=combobox]`
      // et non `select` — plus de composant natif dans ce produit.
      select: hauteur(panneau.querySelector('[role=combobox]')?.closest('[class*="wrap"]') ?? null),
      portLocal: hauteur(panneau.querySelector('output')),
    }
  })

  // 28 px de contenu plus les 2 px de bordure. Deux pixels de moins que le formulaire
  // principal : c'est ce qui donne au panneau son aspect de bloc secondaire, et l'aligner
  // sur 30 l'effacerait.
  expect(new Set(mesures?.champs)).toHaveProperty('size', 1)
  expect(mesures?.champs[0]).toBe(30)
  expect(mesures?.select).toBe(30)
  expect(mesures?.portLocal).toBe(30)
})

test('la grille du panneau suit 130px 1fr 84px 1fr', async ({ page }) => {
  await deplierTunnel(page)

  const largeurs = await page.evaluate(() => {
    const grille = document.querySelector('[class*=tunnelGrid]')
    if (!grille) return null
    return getComputedStyle(grille)
      .gridTemplateColumns.split(' ')
      .map((v) => Math.round(Number.parseFloat(v)))
  })

  // Rien de commun avec le `1fr 1fr` du formulaire principal : les factoriser serait une
  // abstraction fausse. Les deux `1fr` se partagent ce qui reste des 788 px intérieurs.
  expect(largeurs?.[0]).toBe(130)
  expect(largeurs?.[2]).toBe(84)
  expect(largeurs?.[1]).toBe(largeurs?.[3])
})

test('le port local mappé est en pointillés, seul du formulaire', async ({ page }) => {
  await deplierTunnel(page)

  const styles = await page.evaluate(() => {
    const local = document.querySelector('output')
    if (!local) return null
    const s = getComputedStyle(local)
    // Combien d'autres éléments du formulaire ont une bordure en pointillés ?
    const pointilles = [...document.querySelectorAll('[role=dialog] *')].filter(
      (el) => getComputedStyle(el).borderTopStyle === 'dashed',
    ).length
    return {
      style: s.borderTopStyle,
      largeur: Math.round(local.getBoundingClientRect().width),
      pointilles,
    }
  })

  expect(styles?.style).toBe('dashed')
  expect(styles?.largeur).toBe(220)
  // Le seul pointillé du handoff : s'il en apparaissait un second, c'est que quelqu'un a
  // réemployé la classe pour autre chose que « affiché, pas saisissable ».
  expect(styles?.pointilles).toBe(1)
})

test('le badge « SSH activé » apparaît quand un bastion est saisi', async ({ page }) => {
  await deplierTunnel(page)
  await expect(page.getByText('SSH activé')).toHaveCount(0)

  await page.getByLabel('Hôte du bastion').fill('bastion.example')
  await expect(page.getByText('SSH activé')).toHaveCount(1)
})

test('la modale reste dans la fenêtre avec le panneau déplié', async ({ page }) => {
  await deplierTunnel(page)

  const etat = await page.evaluate(() => ({
    debordeEnLargeur: document.documentElement.scrollWidth > window.innerWidth,
    hauteurModale: Math.round(
      document.querySelector('[role=dialog]')?.getBoundingClientRect().height ?? 0,
    ),
  }))

  // La hauteur peut dépasser la fenêtre à 600 px — c'est attendu et le mockup lui-même fait
  // 748 px de corps. La largeur, elle, ne doit jamais déborder.
  expect(etat.debordeEnLargeur).toBe(false)
  expect(etat.hauteurModale).toBeGreaterThan(500)
})

// **Ce test existe parce que le défaut s'est produit.** `.envOption` (ce fichier) et `.option`
// (`RadioGroup.module.css`) sont deux règles à une classe qui posent toutes deux `padding` et
// `font-size` sur les boutons d'environnement. Leur gagnant dépendait de l'ordre des feuilles
// dans le bundle : éditer `NewConnection.module.css` a suffi à l'inverser, et les boutons ont
// changé de largeur d'un build à l'autre. Une capture de référence l'a attrapé ; ce test le
// nomme, pour que la prochaine fois l'échec dise *quoi* est cassé.
test('les boutons d’environnement gardent leur remplissage propre, quel que soit l’ordre du CSS', async ({
  page,
}) => {
  const styles = await page.evaluate(() => {
    const groupe = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=prod]'),
    )
    const moteur = [...document.querySelectorAll('fieldset')].find((f) =>
      f.querySelector('input[value=postgresql]'),
    )
    const lire = (el: Element | null | undefined) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return { padding: s.paddingLeft, police: s.fontSize, rayon: s.borderTopLeftRadius }
    }
    return {
      env: lire(groupe?.querySelector('label')),
      moteur: lire(moteur?.querySelector('label')),
    }
  })

  // Les valeurs du mockup : 10px/11.5px/8px pour l'environnement, 12px/12px/9px pour le moteur.
  // Les uniformiser effacerait une intention du design.
  expect(styles.env).toEqual({ padding: '10px', police: '11.5px', rayon: '8px' })
  expect(styles.moteur).toEqual({ padding: '12px', police: '12px', rayon: '9px' })
})

// --- A3, la sous-modale d'échec (08d) ---------------------------------------------------

// Le pont IPC ne répond pas hors de la webview : dans le navigateur de Playwright, `invoke`
// rejette. C'est exactement ce qu'il faut pour atteindre `A3` — l'échec est réel, pas simulé,
// et son message est celui que le pont produit quand il n'existe pas.
async function provoquerUnEchec(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Tester la connexion/ }).click()
  await page.waitForSelector('[role=dialog][aria-label="Connexion impossible"]')
}

test('la sous-modale de A3 fait 436 px et se centre dans la fenêtre', async ({ page }) => {
  await provoquerUnEchec(page)

  const mesures = await page.evaluate(() => {
    const sous = document.querySelector('[role=dialog][aria-label="Connexion impossible"]')
    if (!sous) return null
    const r = sous.getBoundingClientRect()
    return {
      largeur: Math.round(r.width),
      // Centrée verticalement, contrairement à `A2` qui est alignée en haut à 34 px.
      centreeY: Math.abs(r.top + r.height / 2 - window.innerHeight / 2) < 2,
      centreeX: Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 2,
    }
  })

  expect(mesures?.largeur).toBe(438) // 436 px plus les deux bordures
  expect(mesures?.centreeY).toBe(true)
  expect(mesures?.centreeX).toBe(true)
})

test('la modale A2 n’est pas surlignée en rouge sous la sous-modale', async ({ page }) => {
  await provoquerUnEchec(page)

  const rouge = await page.evaluate(() => {
    const a2 = [...document.querySelectorAll('[role=dialog]')].find(
      (d) => d.getAttribute('aria-label') === 'Nouvelle connexion',
    )
    if (!a2) return null
    // Aucune bordure rouge dans A2 **sauf** celle de `prod`, qui est là de toute façon.
    return [...a2.querySelectorAll('input, select, [class*=wrap]')].filter((el) => {
      const c = getComputedStyle(el).borderTopColor
      return c === 'rgb(217, 67, 47)' || c === 'rgb(176, 51, 31)'
    }).length
  })

  // Le handoff insiste : « la modale sous-jacente n'est pas surlignée en rouge ». L'erreur ne
  // vit que dans la sous-modale et le message du pied.
  expect(rouge).toBe(0)
})

// Sans `SQLSTATE` ni tunnel, l'encart n'a rien à ajouter au texte explicatif : le rendre
// reviendrait à afficher le même paragraphe deux fois, en mono. L'échec du pont dans le
// navigateur de Playwright est justement de ce genre — local, sans code.
test('sans code ni tunnel, aucun encart de log dans A3', async ({ page }) => {
  await provoquerUnEchec(page)
  await expect(page.locator('[class*=failureLog]')).toHaveCount(0)
})

test('esc ferme la sous-modale sans fermer A2', async ({ page }) => {
  await provoquerUnEchec(page)
  await page.keyboard.press('Escape')

  await expect(page.locator('[role=dialog][aria-label="Connexion impossible"]')).toHaveCount(0)
  await expect(page.locator('[role=dialog][aria-label="Nouvelle connexion"]')).toHaveCount(1)
  // Le pied garde son état d'échec : c'est ce que le handoff montre.
  await expect(page.getByRole('button', { name: 'Retester' })).toHaveCount(1)
})

// --- Enregistrement (08e) ---------------------------------------------------------------

// Sans aucun projet, `A2` ne peut rien enregistrer : elle déclare une base *dans un projet
// existant*, et le handoff ne maquette pas le parcours d'un utilisateur qui n'en a aucun.
// Trou n°4, consigné au § « À trancher » de `specs/README.md`.
// **Ce test a disparu avec la sentinelle** (`24c`). Il vérifiait que sans projet, `A2` proposait
// « + Nouveau projet… » et attendait un nom avant d'activer « Enregistrer ». Cet écran ne crée plus de
// projet : la garantie a déménagé dans `NewProject.test.tsx`, où le nom vide désactive « Continuer » en
// disant pourquoi.

test('le bouton désactivé porte l’habillage du handoff, pas seulement l’attribut', async ({
  page,
}) => {
  // **L'état désactivé se produit, il ne s'attend plus.** Ce bouton était désactivé faute de nom de
  // projet — l'écran ouvrait sur « + Nouveau projet… » (`08f`). Depuis `24c`, l'étape 2 arrive avec un
  // projet : il est actif. La cause de désactivation qui reste est l'échec du test de connexion, et
  // c'est elle que ce test provoque — la commande Tauri ne répond pas hors de la webview.
  await page.getByRole('button', { name: /Tester la connexion/ }).click()
  await expect(page.getByRole('button', { name: /Enregistrer & ouvrir/ })).toBeDisabled()

  const styles = await page.evaluate(() => {
    const bouton = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Enregistrer'),
    )
    if (!bouton) return null
    const s = getComputedStyle(bouton)
    return { fond: s.backgroundColor, texte: s.color, curseur: s.cursor }
  })

  // Le handoff donne `rgba(35,32,28,.14)` de fond et `rgba(35,32,28,.4)` de texte pour l'état
  // désactivé de ce bouton (`A3` § pied). Un `disabled` sans habillage laisserait un bouton
  // accent qui a l'air cliquable.
  expect(styles?.fond).toBe('rgba(35, 32, 28, 0.14)')
  expect(styles?.texte).toBe('rgba(35, 32, 28, 0.4)')
  expect(styles?.curseur).toBe('not-allowed')
})
