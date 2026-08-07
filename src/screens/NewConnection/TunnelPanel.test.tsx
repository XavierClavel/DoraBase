import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { NewConnection } from './NewConnection'

function monter(onBrowseKey?: () => Promise<string | null>) {
  return render(
    <>
      <Sprite />
      <NewConnection onClose={() => {}} onBrowseKey={onBrowseKey ?? (async () => null)} />
    </>,
  )
}

/**
 * Déplie le panneau et rend son conteneur.
 *
 * Les requêtes doivent y être **restreintes** : « Port » désigne deux champs dans `A2`, celui
 * de la base et celui du bastion. Chercher globalement échoue sur « Found multiple elements »,
 * ce qui est le bon comportement de la bibliothèque et un rappel utile.
 */
async function deplier() {
  const entete = screen.getByRole('button', { name: /Proxy \/ tunnel/ })
  await userEvent.click(entete)
  const panneau = entete.closest('section')
  if (!panneau) throw new Error('le panneau doit être une <section>')
  return within(panneau)
}

test('le panneau est replié à l’ouverture', () => {
  monter()
  // Le mockup le montre déplié, mais il y montre aussi un tunnel configuré. Pour une
  // connexion neuve, déplier cinq champs vides pousse vers le bas ce qu'il faut remplir
  // d'abord.
  expect(screen.getByRole('button', { name: /Proxy \/ tunnel/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect(screen.queryByLabelText('Hôte du bastion')).not.toBeInTheDocument()
})

test('déplié, les cinq champs du handoff sont là', async () => {
  monter()
  const panneau = await deplier()
  for (const nom of ['Type', 'Hôte du bastion', 'Port', 'Utilisateur', 'Clé privée']) {
    expect(panneau.getByLabelText(nom)).toBeInTheDocument()
  }
})

test('le sélecteur de type ne propose que SSH', async () => {
  monter()
  await deplier()
  const options = screen
    .getByRole('combobox', { name: 'Type' })
    .querySelectorAll<HTMLOptionElement>('option')
  // `05a` modélise `TunnelKind` en énumération d'un seul membre, et le mockup ne montre que
  // « SSH ». Le champ est rendu quand même : le mockup le montre, et un second type viendra.
  expect([...options].map((o) => o.value)).toEqual(['ssh'])
})

test('le port du bastion est prérempli à 22, celui de la base à 5432', async () => {
  monter()
  const panneau = await deplier()
  // 22 est le port de SSH ; 5432 celui de PostgreSQL. Deux champs « Port » distincts, et les
  // confondre ferait tenter la base sur le port du bastion.
  expect(panneau.getByLabelText('Port')).toHaveValue('22')
  expect(screen.getAllByLabelText('Port').map((p) => (p as HTMLInputElement).value)).toEqual([
    '5432',
    '22',
  ])
})

// --- Le badge suit la présence du tunnel, dans les deux sens ---

test('sans tunnel, aucun badge « SSH activé »', () => {
  monter()
  expect(screen.queryByText('SSH activé')).not.toBeInTheDocument()
})

test('saisir un bastion crée le tunnel et fait apparaître le badge', async () => {
  monter()
  const panneau = await deplier()
  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'bastion.example')
  // Saisir un bastion *est* la déclaration qu'on en veut un ; une case à cocher de plus
  // serait une étape que le handoff ne maquette pas.
  expect(screen.getByText('SSH activé')).toBeInTheDocument()
})

// --- Le port local est affiché, jamais saisi ---

test('le port local est un <output>, pas un champ de saisie', async () => {
  monter()
  const panneau = await deplier()
  const local = panneau.getByLabelText('Port local mappé')
  // `<output>` = « le résultat d'un calcul de l'application ». Ni éditable ni focalisable par
  // nature, ce qui est plus solide qu'un `aria-disabled` qui l'affirme — et il est *labelable*,
  // donc un vrai `<label for>` le nomme là où un `aria-label` sur un `<div>` serait ignoré.
  expect(local.tagName).toBe('OUTPUT')
})

test('le port local n’est pas dans l’ordre de tabulation', async () => {
  monter()
  const panneau = await deplier()
  const local = panneau.getByLabelText('Port local mappé')
  // Vingt-cinq tabulations : plus que le formulaire n'a de contrôles, donc la boucle en fait
  // le tour complet. Un `<output>` n'y entre jamais.
  for (let i = 0; i < 25; i++) {
    await userEvent.tab()
    expect(local).not.toHaveFocus()
  }
})

test('sans tunnel ouvert, le port local affiche « auto » sans numéro', async () => {
  monter()
  const panneau = await deplier()
  // Inventer un numéro avant l'ouverture serait un mensonge, et « auto (0) » serait pire.
  expect(panneau.getByLabelText('Port local mappé')).toHaveTextContent(/^auto$/)
})

// --- « Parcourir… » ---

test('« Parcourir… » met le chemin choisi dans le champ', async () => {
  monter(async () => '/Users/moi/.ssh/id_ed25519')
  await deplier()
  await userEvent.click(screen.getByRole('button', { name: 'Parcourir…' }))
  expect(screen.getByLabelText('Clé privée')).toHaveValue('/Users/moi/.ssh/id_ed25519')
})

test('annuler le sélecteur n’écrase pas ce qui était saisi', async () => {
  monter(async () => null)
  await deplier()
  const champ = screen.getByLabelText('Clé privée')
  await userEvent.type(champ, '~/.ssh/deja_saisi')

  await userEvent.click(screen.getByRole('button', { name: 'Parcourir…' }))

  // `null` = annulation. Écraser le chemin serait une perte, et c'est le défaut naturel
  // d'un `onChange` appelé sans vérifier.
  expect(champ).toHaveValue('~/.ssh/deja_saisi')
})

test('le chemin reste modifiable à la main après un choix', async () => {
  monter(async () => '/tmp/cle')
  await deplier()
  await userEvent.click(screen.getByRole('button', { name: 'Parcourir…' }))
  const champ = screen.getByLabelText('Clé privée')
  await userEvent.clear(champ)
  await userEvent.type(champ, '~/.ssh/autre')
  expect(champ).toHaveValue('~/.ssh/autre')
})

// --- Replier ---

test('replier retire les champs du DOM, donc du parcours clavier', async () => {
  monter()
  await deplier()
  expect(screen.getByLabelText('Hôte du bastion')).toBeInTheDocument()
  await deplier()
  expect(screen.queryByLabelText('Hôte du bastion')).not.toBeInTheDocument()
})

test('replier ne perd pas ce qui a été saisi', async () => {
  monter()
  const panneau = await deplier()
  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'bastion.example')
  await deplier()
  await deplier()
  // L'état vit dans le brouillon, pas dans le DOM du panneau : replier par curiosité ne doit
  // pas coûter la saisie.
  expect(screen.getByLabelText('Hôte du bastion')).toHaveValue('bastion.example')
})
