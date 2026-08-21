import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { choisirDansLaListe, optionsDeLaListe } from '../../ui/Select/pourLesTests'
import { NewConnection } from './NewConnection'

function monter(
  onBrowseKey?: () => Promise<string | null>,
  onBrowseCredentials?: () => Promise<string | null>,
) {
  return render(
    <>
      <Sprite />
      <NewConnection
        onClose={() => {}}
        onBrowseKey={onBrowseKey ?? (async () => null)}
        onBrowseCredentials={onBrowseCredentials ?? (async () => null)}
      />
    </>,
  )
}

/** Déplie le panneau et bascule son sélecteur « Type » sur la sorte demandée. */
async function choisirLeType(libelle: 'SSH' | 'Cloud SQL') {
  const panneau = await deplier()
  await choisirDansLaListe('Type', libelle)
  return panneau
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

test('le sélecteur de type propose les deux sortes', async () => {
  monter()
  await deplier()
  // `05d` donne deux sortes à `Proxy`, `06g` sait ouvrir la seconde : le sélecteur devient un
  // vrai choix. Cloud SQL n'est pas dans le handoff — voir `specs/README.md` § À trancher.
  expect(await optionsDeLaListe('Type')).toEqual(['SSH', 'Cloud SQL'])
})

test('le visage Cloud SQL montre ses deux champs, et aucun champ de bastion', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')

  expect(panneau.getByLabelText('Instance')).toBeInTheDocument()
  expect(panneau.getByLabelText('Compte de service')).toBeInTheDocument()
  // L'autre moitié du critère, et la plus importante : les champs de l'autre sorte ne sont pas
  // seulement vides, ils sont **absents**. Un champ masqué en CSS resterait dans l'arbre
  // d'accessibilité et serait annoncé.
  for (const nom of ['Hôte du bastion', 'Utilisateur', 'Clé privée']) {
    expect(panneau.queryByLabelText(nom)).not.toBeInTheDocument()
  }
})

test('le visage SSH ne montre aucun champ Cloud SQL', async () => {
  monter()
  const panneau = await deplier()
  for (const nom of ['Instance', 'Compte de service']) {
    expect(panneau.queryByLabelText(nom)).not.toBeInTheDocument()
  }
})

test('le port local mappé est commun aux deux visages', async () => {
  monter()
  // Un seul dépliage : `deplier` **bascule** l'en-tête, donc l'appeler deux fois refermerait le
  // panneau. Le sélecteur est actionné directement sur le panneau déjà ouvert.
  const panneau = await deplier()
  expect(panneau.getByLabelText('Port local mappé')).toHaveTextContent('auto')

  await choisirDansLaListe('Type', 'Cloud SQL')
  // Le seul champ qui ne bouge pas est le seul qui est commun aux deux sortes — c'est ce que
  // `05d` exprime en sortant `localPort` de l'énumération.
  expect(panneau.getByLabelText('Port local mappé')).toHaveTextContent('auto')
})

test('le libellé d’aide du compte de service est annoncé, pas seulement affiché', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')
  const champ = panneau.getByLabelText('Compte de service')
  const decrit = champ.getAttribute('aria-describedby')
  expect(decrit).toBeTruthy()
  // Un texte simplement posé à côté du champ n'est **pas** annoncé par un lecteur d'écran. Le
  // lien est ce qui fait la différence entre « le vide est une valeur » compris, et un champ
  // qui a l'air oublié.
  const aide = document.getElementById(decrit as string)?.textContent
  expect(aide).toMatch(/identifiants par défaut/i)
  // **La commande entière** (`06i`) : « identifiants par défaut » seul laisse deviner
  // comment on les installe, et `gcloud auth login` — la commande voisine, que tout le monde
  // essaie d'abord — n'alimente que le CLI, pas les applications. Le libellé doit porter
  // celle qui marche.
  expect(aide).toContain('gcloud auth application-default login')
})

test('changer de type efface les champs de l’autre sorte', async () => {
  monter()
  const panneau = await deplier()
  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'bastion.internal')
  expect(panneau.getByLabelText('Hôte du bastion')).toHaveValue('bastion.internal')

  await choisirDansLaListe('Type', 'Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Instance'), 'acme:europe-west1:analytics')

  await choisirDansLaListe('Type', 'SSH')
  // **Une perte de saisie visible, et assumée.** `05d` a fait de `Proxy` une union, donc `08e`
  // ne peut pas convertir un brouillon portant un bastion **et** une instance. Garder les
  // champs « au cas où » obligerait la conversion à deviner.
  expect(panneau.getByLabelText('Hôte du bastion')).toHaveValue('')

  await choisirDansLaListe('Type', 'Cloud SQL')
  expect(panneau.getByLabelText('Instance')).toHaveValue('')
})

test('le badge nomme la sorte, et suit la présence du proxy', async () => {
  monter()
  const panneau = await deplier()
  // Sans champ touché, rien n'est déclaré : pas de badge. Changer le Type ne déclare rien non
  // plus — faire apparaître « Cloud SQL activé » sur une instance vide serait une fausse
  // déclaration.
  expect(panneau.queryByText(/activé/)).not.toBeInTheDocument()

  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'b')
  expect(panneau.getByText('SSH activé')).toBeInTheDocument()

  await choisirDansLaListe('Type', 'Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Instance'), 'p:r:i')
  // Nommer la sorte est ce qui permet de lire l'état du panneau **replié**, où les champs ne
  // sont plus visibles.
  expect(panneau.getByText('Cloud SQL activé')).toBeInTheDocument()
})

test('changer le type sans rien saisir ne déclare aucun proxy', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')
  // Choisir une sorte n'est pas déclarer un proxy : `06b` refuse une variante déclarant un
  // proxy qu'on n'a pas ouvert, et une instance vide n'ouvrirait rien.
  expect(panneau.queryByText(/activé/)).not.toBeInTheDocument()
})

test('« Parcourir… » remplit le champ de compte de service', async () => {
  monter(undefined, async () => '/Users/dora/sa.json')
  const panneau = await choisirLeType('Cloud SQL')
  await userEvent.click(panneau.getByRole('button', { name: 'Parcourir…' }))
  expect(panneau.getByLabelText('Compte de service')).toHaveValue('/Users/dora/sa.json')
})

test('annuler le sélecteur de compte de service n’efface pas le chemin saisi', async () => {
  monter(undefined, async () => null)
  const panneau = await choisirLeType('Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Compte de service'), '/deja/sa.json')
  await userEvent.click(panneau.getByRole('button', { name: 'Parcourir…' }))
  // `null` = annulation. Écraser le chemin déjà saisi serait une perte — même règle que `08c`
  // applique à la clé privée.
  expect(panneau.getByLabelText('Compte de service')).toHaveValue('/deja/sa.json')
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
