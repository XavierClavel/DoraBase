import { expect, test } from '@playwright/test'
import { deplierUnEnvironnement } from './pourLesTests'

// Les consoles persistées dans l'arborescence : de l'assemblage d'écran. Les règles — unicité du nom
// dans la connexion, reprise des requêtes de `12f` — sont couvertes côté Rust.
//
// **Ce fichier remplace la spec « Mes requêtes » de `12f`.** Le concept a été absorbé le 20 août
// 2026 : une console nommée sous sa connexion fait ce que faisait une requête enregistrée, et sait
// en plus sur quoi elle s'exécute.
test.beforeEach(async ({ page }) => {
  await page.goto('/?demo')
  await deplierUnEnvironnement(page)
  await page.getByRole('treeitem', { name: /analytics/ }).dblclick()
  await page.evaluate(() => document.fonts.ready)
})

test('les consoles de la connexion apparaissent sous elle dans l’arbre', async ({ page }) => {
  for (const nom of ['CA par jour', 'Top coupons', 'Paniers abandonnés']) {
    await expect(page.getByRole('treeitem', { name: new RegExp(nom) })).toBeVisible()
  }
})

test('les consoles sont sous la connexion, avant ses schémas', async ({ page }) => {
  // **L'ordre est une décision** : les consoles sont peu nombreuses et connues sans aller-retour,
  // là où les schémas peuvent en aligner des dizaines. Les mettre après les aurait noyées.
  const ordonnees = await page.evaluate(() => {
    const lignes = [...document.querySelectorAll('[role=treeitem]')].map(
      (ligne) => ligne.textContent ?? '',
    )
    const console = lignes.findIndex((texte) => texte.includes('CA par jour'))
    const schema = lignes.findIndex((texte) => texte.includes('public'))
    return console !== -1 && schema !== -1 && console < schema
  })
  expect(ordonnees).toBe(true)
})

test('cliquer une console l’ouvre sur son texte, sous son nom', async ({ page }) => {
  await page.getByRole('treeitem', { name: /CA par jour/ }).click()
  // L'onglet porte **le nom de la console**, non « console 1 » : c'est un objet, pas un brouillon.
  await expect(page.getByRole('tab', { name: /CA par jour/ })).toBeVisible()
  await expect(page.locator('.cm-content')).toContainText('date_trunc')
})

test('rouvrir une console réactive son onglet au lieu d’en empiler un second', async ({ page }) => {
  const ligne = page.getByRole('treeitem', { name: /CA par jour/ })
  await ligne.click()
  await page.waitForSelector('.cm-content')
  await ligne.click()
  // Une console désigne un objet unique : deux onglets sur le même texte divergeraient à la première
  // frappe. Un brouillon, lui, s'empile — c'est tout l'intérêt d'en ouvrir un second.
  await expect(page.getByRole('tab', { name: /CA par jour/ })).toHaveCount(1)
})

test('le menu « … » d’une console propose renommer et retirer', async ({ page }) => {
  await page.getByRole('treeitem', { name: /CA par jour/ }).hover()
  await page.getByRole('button', { name: 'Actions de CA par jour' }).click()

  const menu = page.getByRole('dialog', { name: 'Actions' })
  await expect(menu).toContainText('Renommer…')
  await expect(menu).toContainText('Retirer…')
  // Réellement visible, pas seulement présent — la leçon du défaut n° 35 : la sidebar défile, et un
  // `overflow` d'ancêtre découperait le panneau sans qu'aucune assertion de visibilité s'en aperçoive.
  const auPoint = await page.evaluate(() => {
    const panneau = document.querySelector('[role=dialog][aria-label=Actions]')
    const boite = panneau?.getBoundingClientRect()
    if (!panneau || !boite) return null
    return panneau.contains(document.elementFromPoint(boite.left + boite.width / 2, boite.top + 6))
  })
  expect(auPoint).toBe(true)
})

test('le menu « … » d’une connexion crée une console, sans rien demander', async ({ page }) => {
  await page
    .getByRole('treeitem', { name: /analytics/ })
    .first()
    .hover()
  await page.getByRole('button', { name: 'Actions de analytics' }).click()
  await page.getByRole('button', { name: /Nouvelle console/ }).click()

  // **Aucune modale** : nommer avant d'avoir écrit revient à demander un titre pour une page
  // blanche. La console prend le premier numéro libre et apparaît directement dans l'arbre.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('treeitem', { name: /console 1/ })).toBeVisible()
})

test('un double-clic renomme une console, et l’onglet ouvert suit', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Top coupons/ }).click()
  await page.waitForSelector('.cm-content')

  await page.getByRole('treeitem', { name: /Top coupons/ }).dblclick()
  const champ = page.getByLabel('Nouveau nom de Top coupons')
  await champ.fill('Coupons du mois')
  await champ.press('Enter')

  await expect(page.getByRole('treeitem', { name: /Coupons du mois/ })).toBeVisible()
  // **L'onglet suit** : le laisser porter l'ancien nom le ferait écrire dans une console qui
  // n'existe plus, et la frappe suivante serait refusée.
  await expect(page.getByRole('tab', { name: /Coupons du mois/ })).toBeVisible()
})

test('« Échap » abandonne un renommage commencé par erreur', async ({ page }) => {
  await page.getByRole('treeitem', { name: /Top coupons/ }).dblclick()
  const champ = page.getByLabel('Nouveau nom de Top coupons')
  await champ.fill('Perdu')
  await champ.press('Escape')

  await expect(page.getByRole('treeitem', { name: /Top coupons/ })).toBeVisible()
  await expect(page.getByRole('treeitem', { name: /Perdu/ })).toHaveCount(0)
})

test('le menu « … » d’une console renomme sur place, sans modale', async ({ page }) => {
  await page.getByRole('treeitem', { name: /CA par jour/ }).hover()
  await page.getByRole('button', { name: 'Actions de CA par jour' }).click()
  await page.getByRole('button', { name: 'Renommer…' }).click()

  // **Le même mécanisme que le double-clic** : l'entrée reste pour que le geste soit visible et
  // atteignable au clavier, mais elle ouvre le champ de la ligne, pas une fenêtre.
  await expect(page.getByLabel('Nouveau nom de CA par jour')).toBeFocused()
})
