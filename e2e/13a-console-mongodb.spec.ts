import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement, ouvrirUneConsole } from './pourLesTests'

// `A8` de bout en bout : la console mongo, l'arbre de documents, le schéma déduit. Des géométries et
// des couleurs, donc hors de portée de jsdom.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  // **La base documentaire du décor.** Le dialecte de la console se dérive de son moteur : c'est ce
  // chemin-là, et pas un réglage, qui ouvre une console mongo (`13a`).
  await page.getByRole('treeitem', { name: /^evenements/ }).click()
  await page.getByRole('treeitem', { name: 'atelier_journal' }).click()
  // La collection : c'est elle dont la sidebar montre le schéma déduit, et elle reste affichée
  // quand la console prend le centre.
  await page.getByRole('treeitem', { name: /^evenements .*k/ }).click()
  await ouvrirUneConsole(page, 'evenements')
  await page.waitForSelector('[aria-label="Commande MongoDB"]')
  await page.evaluate(() => document.fonts.ready)
})

test('la console mongo annonce sa langue, pas celle du voisin', async ({ page }) => {
  // Le nom accessible dit **quelle** langue : « Requête SQL » sur une console mongo annoncerait la
  // mauvaise à la voix.
  await expect(page.locator('[aria-label="Commande MongoDB"]')).toBeVisible()
  await expect(page.locator('[aria-label="Requête SQL"]')).toHaveCount(0)

  // « Expliquer » devient « explain() » : MongoDB n'a pas d'`EXPLAIN` séparé, et le mot que
  // l'utilisateur connaît est celui-là.
  await expect(page.getByRole('button', { name: 'explain()' })).toBeVisible()
  // Et la limite automatique nomme un `$limit`, pas une clause SQL qui n'existe pas.
  await expect(page.getByText('auto-$limit 1000')).toBeVisible()
})

test('l’autocomplétion SQL ne s’ouvre pas dans une console mongo', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.type('db.')
  await page.waitForTimeout(200)
  // **Rien plutôt qu'une devinette** (`12d`) : proposer `left join` dans un pipeline produirait une
  // commande en erreur que l'utilisateur croirait correcte.
  await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0)
})

test('le résultat est un arbre de documents, replié d’un cran', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.type('db.evenements.find({})')
  await page.getByRole('button', { name: /Exécuter/ }).click()

  // « Documents » et non « Résultat » : c'est ce que la vue contient.
  await expect(page.getByRole('radio', { name: /Documents/ })).toBeVisible()
  // Pas d'onglet « JSON » : la vue *est* du JSON, et deux onglets pour la même chose feraient
  // chercher la différence.
  await expect(page.getByRole('radio', { name: 'JSON' })).toHaveCount(0)

  // Deux documents, dépliés d'un cran : leurs clés se lisent, leurs sous-objets non.
  //
  // **Porté sur l'arbre, pas sur la page** : la sidebar affiche les mêmes noms de champs dans sa
  // section « Schéma déduit », et une assertion à l'échelle de la page compterait les deux.
  const arbre = page.getByRole('list', { name: 'Documents du résultat' })
  await expect(arbre.getByText('sorte', { exact: true })).toHaveCount(2)
  await expect(arbre.getByText('reseau', { exact: true })).toHaveCount(0)

  // Le pied compte des **documents**, pas des lignes.
  await expect(page.getByText(/2 docs/)).toBeVisible()
})

test('un nœud se déplie, et « Tout replier » le referme', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.type('db.evenements.find({})')
  await page.getByRole('button', { name: /Exécuter/ }).click()
  // **Porté sur l'arbre, pas sur la page** : la sidebar affiche les mêmes noms de champs dans sa
  // section « Schéma déduit », et une assertion à l'échelle de la page les compterait aussi.
  const arbre = page.getByRole('list', { name: 'Documents du résultat' })
  await expect(arbre.getByText('contexte', { exact: true }).first()).toBeVisible()

  await page
    .getByRole('button', { name: /^Déplier contexte/ })
    .first()
    .click()
  // Le sous-objet apparaît : c'est le premier composant du projet à porter un état d'ouverture par
  // nœud.
  await expect(arbre.getByText('agent', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Tout replier' }).click()
  await expect(arbre.getByText('agent', { exact: true })).toHaveCount(0)
  await expect(arbre.getByText('sorte', { exact: true })).toHaveCount(0)
})

test('un ObjectId et une date ne se colorent pas comme une chaîne', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.type('db.evenements.find({})')
  await page.getByRole('button', { name: /Exécuter/ }).click()
  await expect(page.getByText('64b7f9a2c3d4e5f60718293a')).toBeVisible()

  const teintes = await page.evaluate(() => {
    const couleurDe = (texte: string) => {
      const noeud = [...document.querySelectorAll('span')].find(
        (s) => s.textContent === texte && s.children.length === 0,
      )
      return noeud ? getComputedStyle(noeud).color : null
    }
    return {
      id: couleurDe('64b7f9a2c3d4e5f60718293a'),
      date: couleurDe('2026-08-11T09:12:00Z'),
      chaine: couleurDe('"connexion"'),
    }
  })

  // **Trois teintes distinctes.** Les fondre rendrait invisibles les deux genres que `13b` demande
  // de distinguer — et un identifiant lu comme une chaîne se recopie mal dans une requête.
  expect(teintes.id).not.toBeNull()
  expect(teintes.id).not.toBe(teintes.chaine)
  expect(teintes.date).not.toBe(teintes.chaine)
  expect(teintes.date).not.toBe(teintes.id)
})

test('la sidebar dit « Schéma déduit » et affiche les fréquences partielles', async ({ page }) => {
  // **Le mot le plus important de la section** (`13c`) : les champs viennent d'un échantillon, pas
  // d'un catalogue. Un titre « Colonnes de » laisserait croire à un schéma déclaré.
  await expect(page.getByText(/Schéma déduit de evenements/)).toBeVisible()

  // Deux champs sous 100 % du décor : la fréquence prend la place du type.
  await expect(page.getByText('98 %')).toBeVisible()
  await expect(page.getByText('61 %')).toBeVisible()
  // Et un champ complet garde son type : répéter « 100 % » partout noierait les deux qui comptent.
  await expect(page.getByText('objectId')).toBeVisible()
})

test('une console SQL et une console mongo cohabitent dans la même bande', async ({ page }) => {
  // La base PostgreSQL du décor, dans le même projet.
  await page.getByRole('treeitem', { name: /^analytics/ }).click()
  await page.getByRole('treeitem', { name: 'public' }).click()
  // **Sur `analytics`, et non sur la base mongo** : c'est une console *SQL* qu'on ajoute ici, et le
  // dialecte suit la connexion depuis laquelle on la crée.
  await ouvrirUneConsole(page, 'analytics')

  await expect(page.locator('[aria-label="Requête SQL"]')).toBeVisible()
  // Trois onglets : la collection ouverte par le `beforeEach`, sa console mongo, et celle-ci.
  await expect(page.getByRole('tab')).toHaveCount(3)
  // Le dialecte n'est pas une coordonnée : deux consoles se numérotent dans la même suite — mais
  // sur des bases différentes, chacune repart à 1.
  await expect(page.getByRole('tab', { name: /console 1/ })).toHaveCount(2)
})
