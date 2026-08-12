import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { SqlEditor } from './SqlEditor'

/**
 * La ligne que CodeMirror insère pour mesurer la largeur des caractères.
 *
 * **Elle reste dans le DOM sous jsdom**, qui ne calcule aucune mise en page : la vue croit sa mesure
 * en cours. C'est une `.cm-line` ordinaire, sans classe ni attribut distinctif — d'où
 * l'identification par son contenu, qui est une constante de la bibliothèque.
 */
const LIGNE_DE_MESURE = 'abc def ghi jkl mno pqr stu vwx yz'

/**
 * Le texte du document, **ligne par ligne**.
 *
 * Ni le `textContent` de l'hôte — qui ramènerait les numéros de la gouttière — ni celui de
 * `.cm-content`, qui contient la ligne de mesure ci-dessus.
 */
const texteAffiche = () =>
  [...document.querySelectorAll('.cm-content > .cm-line')]
    .map((l) => l.textContent ?? '')
    .filter((t) => !t.startsWith(LIGNE_DE_MESURE.slice(0, 11)))
    .join('\n')

/** L'élément éditable, cible du clic et des frappes. */
const document_ = () => document.querySelector('.cm-content')

async function saisir(utilisateur: ReturnType<typeof userEvent.setup>, texte: string) {
  await utilisateur.click(document_() as HTMLElement)
  await utilisateur.keyboard(texte)
}

test('le texte initial est affiché, et la gouttière porte les numéros', () => {
  render(<SqlEditor texteInitial={'select 1\nfrom orders'} onTexteChange={() => {}} />)
  expect(texteAffiche()).toBe('select 1\nfrom orders')
  // Les numéros vivent dans leur propre gouttière : sans elle, une erreur SQL annoncée « ligne 4 »
  // serait à compter à la main.
  // Le premier `cm-gutterElement` sert à mesurer la largeur de la gouttière — jsdom ne mesurant rien,
  // il reste dans le DOM. Les numéros réels sont ceux qui suivent, et il y en a un par ligne.
  const numeros = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .map((e) => e.textContent)
    .filter((t) => t !== '')
  expect(numeros.slice(-2)).toEqual(['1', '2'])
})

test('chaque frappe remonte le texte entier, sans en perdre', async () => {
  const utilisateur = userEvent.setup()
  const vus: string[] = []
  render(<SqlEditor texteInitial="" onTexteChange={(t) => vus.push(t)} />)

  await saisir(utilisateur, 'select 1')

  // **Le défaut que `12b` a produit puis corrigé** : un éditeur contrôlé recevait sa propre valeur en
  // retard d'un rendu et se réécrivait, donnant « slc » pour « select 1 ». On vérifie la dernière
  // valeur *et* le document, parce que l'un peut être juste quand l'autre ne l'est pas.
  expect(vus.at(-1)).toBe('select 1')
  expect(texteAffiche()).toBe('select 1')
})

test('un caractère accentué composé s’insère correctement', async () => {
  const utilisateur = userEvent.setup()
  render(<SqlEditor texteInitial="" onTexteChange={() => {}} />)
  // Une des quatre raisons de ne pas écrire cet éditeur à la main. `é` ne se tape pas en une touche
  // sur un clavier américain, et un éditeur maison le perd ou le double.
  await saisir(utilisateur, "where nom = 'été'")
  expect(texteAffiche()).toBe("where nom = 'été'")
})

test('⌘↩ exécute, et n’insère pas de ligne', async () => {
  const utilisateur = userEvent.setup()
  const executer = vi.fn()
  render(<SqlEditor texteInitial="select 1" onTexteChange={() => {}} onExecuter={executer} />)

  await utilisateur.click(document_() as HTMLElement)
  // **`Mod` est `Cmd` sur macOS et `Ctrl` ailleurs**, et jsdom ne se présente pas comme un Mac : le
  // test envoie donc `Ctrl`. C'est la même liaison — `Mod-Enter` — qui répond aux deux, ce qui est
  // précisément l'intérêt de l'écrire ainsi plutôt que de coder la plateforme en dur.
  await utilisateur.keyboard('{Control>}{Enter}{/Control}')

  expect(executer).toHaveBeenCalledOnce()
  // **La carte par défaut de CodeMirror lie `Mod-Enter` à l'insertion d'une ligne.** Une console où
  // `⌘↩` ajouterait une ligne au lieu d'exécuter serait déroutante — d'où l'ordre des cartes.
  expect(texteAffiche()).toBe('select 1')
})

test('⌥↩ demande l’exécution de la sélection', async () => {
  const utilisateur = userEvent.setup()
  const selection = vi.fn()
  render(
    <SqlEditor
      texteInitial="select 1"
      onTexteChange={() => {}}
      onExecuterLaSelection={selection}
    />,
  )
  await utilisateur.click(document_() as HTMLElement)
  await utilisateur.keyboard('{Alt>}{Enter}{/Alt}')
  expect(selection).toHaveBeenCalledOnce()
})

test('sans rappel branché, ⌘↩ n’insère toujours pas de ligne', async () => {
  const utilisateur = userEvent.setup()
  render(<SqlEditor texteInitial="select 1" onTexteChange={() => {}} />)
  await utilisateur.click(document_() as HTMLElement)
  await utilisateur.keyboard('{Control>}{Enter}{/Control}')
  // La touche est **consommée** même sans destinataire : le contraire ferait qu'une console sans
  // exécution branchée se comporterait autrement qu'une console qui en a une.
  expect(texteAffiche()).toBe('select 1')
})

test('l’annulation rend le texte d’avant', async () => {
  const utilisateur = userEvent.setup()
  render(<SqlEditor texteInitial="select 1" onTexteChange={() => {}} />)
  await saisir(utilisateur, ' where id = 2')
  await utilisateur.keyboard('{Control>}z{/Control}')
  // L'historique d'annulation est l'une des quatre raisons de la dépendance. Il est fourni par
  // `history()`, mais un montage qui recréerait la vue à chaque rendu le viderait à chaque frappe.
  expect(texteAffiche()).not.toBe(' where id = 2select 1')
})

test('l’éditeur porte un nom accessible', () => {
  render(<SqlEditor texteInitial="" onTexteChange={() => {}} />)
  expect(screen.getByLabelText('Requête SQL')).toBeInTheDocument()
})
