import { expect, test } from '@playwright/test'

test('A1 est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a1-accueil.png', { fullPage: true })
})

// La modale de `A2` par-dessus `A1`, capturée comme référence de la même façon. Elle inclut
// la barre de titre ternie derrière, qui fait partie de l'écran.
//
// **Ces captures montrent l'état « aucun projet »**, celui d'une application neuve — et non celui
// du mockup, qui montre un `Select` rempli. L'écart existait avant `08f` (le sélecteur disait
// « Aucun projet ») ; depuis, il porte en plus le champ « Nom du nouveau projet », que le handoff
// ne maquette pas. Les références ont donc été **régénérées délibérément** le 10 août 2026 : une
// capture qu'on rafraîchit sans le dire cesse d'être une référence.
//
// **Les trois feux ne sont pas dans la capture** : ils sont dessinés par macOS par-dessus la
// fenêtre, hors du DOM et hors de portée de Playwright comme du CSS. Le mockup les grise ;
// nous ne pouvons pas. Voir `specs/README.md` § « À trancher ».
test('A2 est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.waitForSelector('[role=dialog]')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a2-nouvelle-connexion.png', { fullPage: true })
})

// Le panneau proxy / tunnel déplié et renseigné, comme le mockup le montre. Capturé
// séparément parce que `A2` s'ouvre panneau replié : les deux états méritent une référence.
test('A2 avec le panneau tunnel est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Proxy \/ tunnel/ }).click()
  await page.getByLabel('Hôte du bastion').fill('bastion.exemple.net')
  await page.getByLabel('Clé privée').fill('~/.ssh/id_ed25519')
  // Le focus reste sur le dernier champ rempli, et son anneau entrerait dans la référence :
  // celle-ci dépendrait alors de l'ordre de remplissage. Un `blur` la rend déterministe.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a2-tunnel.png', { fullPage: true })
})

// `A3` — la sous-modale d'échec.
//
// Le message d'erreur est **rendu déterministe**, et c'est délibéré : sans cela, l'échec réel du
// pont dans le navigateur de Playwright inscrirait « Cannot read properties of undefined » dans
// la référence, qui casserait à la prochaine montée de version de Tauri ou du navigateur — pour
// une raison qui n'a rien à voir avec l'écran. Le chemin d'échec *réel* est couvert par les
// tests de `a2-nouvelle-connexion.spec.ts`, qui n'assènent pas le texte.
//
// Le message posé ici est celui de `06e` pour un hôte absent de `known_hosts` : le cas où la
// distinction « ça dit la manœuvre » compte le plus.
test('A3 est conforme à la référence', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: () =>
          Promise.reject({
            code: null,
            position: null,
            message:
              'le bastion bastion.exemple.net n’est pas dans ~/.ssh/known_hosts : DoraBase refuse de s’y connecter sans l’avoir déjà vu. Lancez « ssh bastion.exemple.net » une fois pour enregistrer sa clé, puis réessayez',
          }),
        transformCallback: (f: unknown) => f,
      },
      configurable: true,
    })
  })
  await page.goto('/')
  await page
    .getByRole('button', { name: /Nouveau projet/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Tester la connexion/ }).click()
  await page.waitForSelector('[role=dialog][aria-label="Connexion impossible"]')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a3-echec.png', { fullPage: true })
})
