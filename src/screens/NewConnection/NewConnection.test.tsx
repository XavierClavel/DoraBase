import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { ENGINE_ORDER, ENGINES } from './engines'
import { ENVIRONMENT_ORDER, SSL_MODE_ORDER } from './environments'
import { NewConnection } from './NewConnection'

function monter(projects: readonly { id: string; name: string }[] = []) {
  return render(
    <>
      <Sprite />
      <NewConnection onClose={() => {}} projects={projects} />
    </>,
  )
}

test('la modale s’annonce sous le titre du handoff', () => {
  monter()
  expect(screen.getByRole('dialog', { name: 'Nouvelle connexion' })).toBeInTheDocument()
})

// --- Sélecteur de moteur ---

test('les sept moteurs sont là, dans l’ordre du handoff', () => {
  monter()
  const radios = screen
    .getByRole('group', { name: 'Moteur' })
    .querySelectorAll<HTMLInputElement>('input[type=radio]')
  expect([...radios].map((r) => r.value)).toEqual([...ENGINE_ORDER])
})

// L'ordre n'est ni alphabétique ni celui du type Rust : il va du plus au moins courant.
test('PostgreSQL vient en premier et est choisi par défaut', () => {
  monter()
  expect(screen.getByRole('radio', { name: 'PostgreSQL' })).toBeChecked()
})

test('deux moteurs n’ont pas de monogramme', () => {
  // Vérifié sur le mockup : le `<span>` du monogramme est absent de Snowflake et BigQuery.
  // Ce n'est pas un oubli à combler.
  const sans = ENGINE_ORDER.filter((engine) => ENGINES[engine].monogram === undefined)
  expect(sans).toEqual(['snowflake', 'bigquery'])
})

test('les cinq monogrammes sont visibles, et hors du nom accessible', () => {
  monter()
  for (const engine of ENGINE_ORDER) {
    const { monogram, label } = ENGINES[engine]
    if (monogram) expect(screen.getByText(monogram)).toBeInTheDocument()
    // Le nom accessible est le seul libellé : le monogramme abrège un nom déjà présent.
    expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
  }
})

test('choisir un moteur sans adaptateur le dit, au lieu de le masquer', async () => {
  monter()
  expect(screen.queryByText(/adaptateur/)).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'MySQL' }))

  // Masquer les six autres moteurs ferait croire que le produit ne les prévoit pas ; les
  // laisser muets ferait croire que « Tester la connexion » est cassé.
  expect(screen.getByText(/MySQL n’a pas encore d’adaptateur/)).toBeInTheDocument()
})

// --- Les options viennent du modèle de `05a` ---

// Le mécanisme est **à la compilation** : `ENGINES`, `ENVIRONMENTS` et `SSL_MODES` sont typés
// `Record<T, …>`, donc ajouter une variante en Rust fait échouer `tsc` jusqu'à ce qu'elle soit
// traitée. Vérifié par sabotage (ajout d'un `SslMode` en Rust → erreur TS2741). Ces tests
// vérifient le complément que le type ne dit pas : que l'écran rend bien *toutes* les options.
test('les six modes SSL du modèle sont proposés', () => {
  monter()
  const options = screen
    .getByRole('combobox', { name: 'Mode SSL' })
    .querySelectorAll<HTMLOptionElement>('option')
  expect([...options].map((o) => o.value)).toEqual([...SSL_MODE_ORDER])
})

test('les trois variantes d’environnement du modèle sont proposées', () => {
  monter()
  const radios = screen
    .getByRole('group', { name: 'Variante d’environnement' })
    .querySelectorAll<HTMLInputElement>('input[type=radio]')
  expect([...radios].map((r) => r.value)).toEqual([...ENVIRONMENT_ORDER])
})

// --- Valeurs par défaut ---

test('le formulaire ouvre vide, pas rempli des valeurs du mockup', () => {
  monter()
  // Le mockup montre « analytics » et « db-analytics.internal » : c'est une illustration,
  // pas un état initial. Les y coller mettrait une fausse connexion sous les yeux de
  // l'utilisateur à chaque ouverture.
  expect(screen.getByLabelText('Nom de la base')).toHaveValue('')
  expect(screen.getByLabelText('Hôte')).toHaveValue('')
  expect(screen.getByLabelText('Utilisateur')).toHaveValue('')
})

test('les valeurs préremplies sont celles qui sont vraies dans presque tous les cas', () => {
  monter()
  expect(screen.getByLabelText('Port')).toHaveValue('5432')
  // `dev` et non `prod` : ouvrir sur prod serait une invitation à l'accident.
  expect(screen.getByRole('radio', { name: 'dev' })).toBeChecked()
  expect(screen.getByRole('combobox', { name: 'Mode SSL' })).toHaveValue('prefer')
})

test('« Ouvrir en lecture seule » est actif, « Se reconnecter » non', () => {
  monter()
  expect(screen.getByRole('switch', { name: 'Ouvrir en lecture seule' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  expect(screen.getByRole('switch', { name: 'Se reconnecter au démarrage' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

// --- Saisie ---

test('la saisie se voit', async () => {
  monter()
  const hote = screen.getByLabelText('Hôte')
  await userEvent.type(hote, 'db-analytics.internal')
  expect(hote).toHaveValue('db-analytics.internal')
})

test('le mot de passe est masqué, et l’œil le révèle', async () => {
  monter()
  const champ = screen.getByLabelText('Mot de passe')
  expect(champ).toHaveAttribute('type', 'password')

  await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
  expect(champ).toHaveAttribute('type', 'text')

  await userEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }))
  expect(champ).toHaveAttribute('type', 'password')
})

test('changer de moteur ne perd pas ce qui a été saisi', async () => {
  monter()
  await userEvent.type(screen.getByLabelText('Hôte'), 'db.internal')
  await userEvent.click(screen.getByRole('radio', { name: 'MySQL' }))
  // Le formulaire ne change pas selon le moteur (`06` n'a livré qu'un adaptateur), donc
  // remettre l'état à zéro ne serait qu'une perte pour l'utilisateur.
  expect(screen.getByLabelText('Hôte')).toHaveValue('db.internal')
})

// --- Projets ---

test('sans aucun projet, la création est proposée d’emblée', () => {
  monter()
  // **L'application neuve n'est plus une impasse** (`08f`) : `⌘N` mène ici, et le seul choix
  // possible est de créer un projet — donc son champ de nom est visible sans rien faire.
  expect(screen.getByRole('combobox', { name: 'Projet' })).toHaveTextContent(/Nouveau projet/)
  expect(screen.getByLabelText('Nom du nouveau projet')).toBeInTheDocument()
})

test('avec des projets, ils sont proposés, suivis de la création', () => {
  monter([
    { id: 'print', name: 'Atelier Nord' },
    { id: 'web', name: 'Atelier Sud' },
  ])
  const options = screen
    .getByRole('combobox', { name: 'Projet' })
    .querySelectorAll<HTMLOptionElement>('option')
  expect([...options].map((o) => o.textContent)).toEqual([
    'Atelier Nord',
    'Atelier Sud',
    '+ Nouveau projet…',
  ])
  // Le champ n'apparaît **que** sous la création : le rendre toujours, désactivé, ferait croire
  // qu'on peut renommer le projet choisi.
  expect(screen.queryByLabelText('Nom du nouveau projet')).not.toBeInTheDocument()
})

// --- Pied ---

test('les trois boutons du pied sont présents', () => {
  monter()
  expect(screen.getByRole('button', { name: /Tester la connexion/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Enregistrer & ouvrir/ })).toBeInTheDocument()
})

// Un bouton désactivé sans explication ferait croire à un bug : les deux sont donc actifs dès
// qu'il y a un projet où enregistrer.
test('« Tester » et « Enregistrer » sont actifs quand un projet existe', () => {
  monter([{ id: 'print', name: 'Atelier Nord' }])
  expect(screen.getByRole('button', { name: /Tester la connexion/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: /Enregistrer & ouvrir/ })).toBeEnabled()
})

// Le trou n°4 du handoff : `A2` déclare une base *dans un projet existant*, et `⌘N` y mène
// directement. Le bouton est donc désactivé, et le sélecteur le dit — plutôt que d'inventer un
// formulaire de création de projet que le mockup ne montre pas.
test('sans aucun projet, « Enregistrer » est désactivé mais « Tester » reste actif', () => {
  monter()
  expect(screen.getByRole('button', { name: /Enregistrer & ouvrir/ })).toBeDisabled()
  // Tester une connexion n'exige aucun projet : c'est justement ce qu'on veut pouvoir faire
  // avant de s'engager.
  expect(screen.getByRole('button', { name: /Tester la connexion/ })).toBeEnabled()
})

test('« Annuler » ferme la modale', async () => {
  const onClose = vi.fn()
  render(
    <>
      <Sprite />
      <NewConnection onClose={onClose} />
    </>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(onClose).toHaveBeenCalledOnce()
})

test('esc ferme la modale', async () => {
  const onClose = vi.fn()
  render(
    <>
      <Sprite />
      <NewConnection onClose={onClose} />
    </>,
  )
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

// --- Clavier ---

test('le focus entre sur le premier champ, pas sur la croix', () => {
  monter()
  // Le sélecteur de moteur précède le formulaire : c'est donc la radio PostgreSQL qui
  // reçoit le focus, seule du groupe à être dans l'ordre de tabulation.
  expect(screen.getByRole('radio', { name: 'PostgreSQL' })).toHaveFocus()
})

test('tout le formulaire est atteignable au clavier', async () => {
  monter()
  const attendus = [
    'PostgreSQL', // groupe de moteurs : une seule entrée
    'Nom de la base',
    'Projet',
    'dev', // groupe d'environnements : une seule entrée
    // Sans aucun projet, `08f` propose sa création d'emblée : le champ est sur sa propre rangée,
    // entre la rangée d'identité et l'hôte.
    'Nom du nouveau projet',
    'Hôte',
    'Port',
    'Base par défaut',
    'Utilisateur',
    'Mot de passe',
  ]

  // `textContent` ne respecte pas `aria-hidden` : sur la radio PostgreSQL il rendrait
  // « PgPostgreSQL », le monogramme compris. On retire donc les descendants masqués, comme
  // le fait le calcul du nom accessible.
  function nomAccessible(element: Element | null): string | null {
    if (!element) return null
    const direct = element.getAttribute('aria-label')
    if (direct) return direct

    const etiquette =
      (element as HTMLInputElement).labels?.[0] ??
      (element.id ? document.querySelector(`label[for="${element.id}"]`) : null)
    if (!etiquette) return null

    const copie = etiquette.cloneNode(true) as HTMLElement
    for (const masque of copie.querySelectorAll('[aria-hidden="true"]')) masque.remove()
    return copie.textContent?.trim() ?? null
  }

  const atteints: string[] = []
  for (let i = 0; i < attendus.length; i++) {
    const nom = nomAccessible(document.activeElement)
    if (nom) atteints.push(nom)
    await userEvent.tab()
  }

  expect(atteints).toEqual(attendus)
})
