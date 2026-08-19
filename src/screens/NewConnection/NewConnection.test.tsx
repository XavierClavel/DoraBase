import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { choisirDansLaListe, optionsDeLaListe } from '../../ui/Select/pourLesTests'
import { ENGINE_ORDER, ENGINES } from './engines'
import { SSL_MODE_ORDER } from './environments'
import { NewConnection } from './NewConnection'
import { TRIO_DE_TEST } from './pourLesTests'

function monter(
  projects: readonly {
    id: string
    name: string
    environments: readonly import('../../domain/config').EnvironmentDeclaration[]
  }[] = [],
) {
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

  // **Redis, et non MySQL** : ce dernier a son adaptateur depuis `16`. Un test qui garde un exemple
  // devenu faux passe pour la mauvaise raison, ou échoue en accusant le mauvais code.
  await userEvent.click(screen.getByRole('radio', { name: 'Redis' }))

  // Masquer les trois moteurs restants ferait croire que le produit ne les prévoit pas ; les
  // laisser muets ferait croire que « Tester la connexion » est cassé.
  expect(screen.getByText(/Redis n’a pas encore d’adaptateur/)).toBeInTheDocument()
})

// --- Les options viennent du modèle de `05a` ---

// Le mécanisme est **à la compilation** : `ENGINES`, `ENVIRONMENTS` et `SSL_MODES` sont typés
// `Record<T, …>`, donc ajouter une variante en Rust fait échouer `tsc` jusqu'à ce qu'elle soit
// traitée. Vérifié par sabotage (ajout d'un `SslMode` en Rust → erreur TS2741). Ces tests
// vérifient le complément que le type ne dit pas : que l'écran rend bien *toutes* les options.
test('les six modes SSL du modèle sont proposés', async () => {
  monter()
  expect(await optionsDeLaListe('Mode SSL')).toEqual([...SSL_MODE_ORDER])
})

test('sans projet choisi, le trio par défaut est proposé', () => {
  // **Le trio, parce que le projet n'existe pas encore** (`23d`). `A2` ouvre sur « + Nouveau projet… »
  // quand aucun projet n'est déclaré : les environnements proposés sont ceux que ce projet recevra à
  // sa création. Les afficher plutôt que rien suit la règle de `09f`.
  monter()
  const radios = screen
    .getByRole('group', { name: 'Environnement' })
    .querySelectorAll<HTMLInputElement>('input[type=radio]')
  expect([...radios].map((r) => r.value)).toEqual(['dev', 'staging', 'prod'])
})

test('les environnements proposés sont **ceux du projet choisi**', async () => {
  // La garantie de `23d` : un projet à quatre environnements en montre quatre, dont un que nulle table
  // de constantes ne connaît.
  const quatre = [
    ...TRIO_DE_TEST,
    { id: 'preprod', label: 'preprod', color: 'violet' as const, production: false },
  ]
  monter([{ id: 'print', name: 'Atelier Nord', environments: quatre }])

  const radios = screen
    .getByRole('group', { name: 'Environnement' })
    .querySelectorAll<HTMLInputElement>('input[type=radio]')
  expect([...radios].map((r) => r.value)).toEqual(['dev', 'staging', 'prod', 'preprod'])
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
  // **Le contenu du champ, et non `toHaveValue`.** Le champ n'est plus un `<select>` : il n'a pas de
  // `value`, il affiche le libellé de l'option choisie. Ce qui compte est ce que l'utilisateur lit.
  expect(screen.getByRole('combobox', { name: 'Mode SSL' })).toHaveTextContent('prefer')
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
  // Le formulaire garde ce qui a été saisi en changeant de moteur : remettre l'état à zéro ne serait
  // qu'une perte pour l'utilisateur. **Deux moteurs de serveur** ici — SQLite masquerait le champ,
  // et le test mesurerait alors le masquage plutôt que la conservation (`17a`).
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

test('avec des projets, ils sont proposés, suivis de la création', async () => {
  monter([
    { id: 'print', name: 'Atelier Nord', environments: TRIO_DE_TEST },
    { id: 'web', name: 'Atelier Sud', environments: TRIO_DE_TEST },
  ])
  expect(await optionsDeLaListe('Projet')).toEqual([
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
  monter([{ id: 'print', name: 'Atelier Nord', environments: TRIO_DE_TEST }])
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

    // **`aria-labelledby` en plus de `<label for>`.** Les listes déroulantes maison ne sont plus des
    // contrôles natifs : leur étiquette visible est un `<span>` qu'elles désignent par cet attribut,
    // et `element.labels` ne les connaît pas. Sans cette branche, le parcours au clavier trouvait un
    // nom nul là où l'écran affiche « Projet ».
    const designee = element.getAttribute('aria-labelledby')
    if (designee) return document.getElementById(designee)?.textContent?.trim() ?? null

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

// --- SQLite : un fichier, pas un serveur (`17a`) ---

async function choisirLeMoteur(nom: string) {
  await userEvent.click(screen.getByRole('radio', { name: nom }))
}

test('choisir SQLite retire les cinq champs qui n’ont pas de sens pour un fichier', async () => {
  monter()
  // Le formulaire complet, tel qu'un serveur le demande.
  expect(screen.getByLabelText('Hôte')).toBeInTheDocument()
  expect(screen.getByLabelText('Utilisateur')).toBeInTheDocument()

  await choisirLeMoteur('SQLite')

  // **Un fichier local n'a ni hôte, ni port, ni utilisateur, ni mot de passe, ni TLS.** Les afficher
  // ferait remplir cinq champs pour rien, et laisserait croire qu'ils comptent — c'est la raison qui
  // a fait préférer masquer plutôt qu'ajouter un champ `path` vide pour six moteurs sur sept.
  expect(screen.queryByLabelText('Hôte')).toBeNull()
  expect(screen.queryByLabelText('Port')).toBeNull()
  expect(screen.queryByLabelText('Utilisateur')).toBeNull()
  expect(screen.queryByLabelText('Mot de passe')).toBeNull()
  expect(screen.queryByLabelText('Mode SSL')).toBeNull()
})

test('le champ « base par défaut » devient « fichier de la base », et garde sa donnée', async () => {
  monter()
  await userEvent.type(screen.getByLabelText('Base par défaut'), 'analytics')
  await choisirLeMoteur('SQLite')

  // **Le même champ, deux rôles.** `defaultDatabase` est déjà « la base à ouvrir », et pour SQLite
  // la base *est* un fichier : le libellé change, la donnée non. Un champ `path` distinct aurait
  // obligé `A2` à décider lequel afficher, et le modèle à porter un champ vide six fois sur sept.
  const champ = screen.getByLabelText('Fichier de la base')
  expect(champ).toHaveValue('analytics')
  expect(champ).toHaveAttribute('placeholder', '~/bases/atelier.db')
})

test('les deux bascules restent : elles ont un sens pour un fichier aussi', async () => {
  monter()
  await choisirLeMoteur('SQLite')
  // « Lecture seule » et « se reconnecter au démarrage » ne dépendent pas d'un serveur.
  expect(screen.getByRole('switch', { name: 'Ouvrir en lecture seule' })).toBeInTheDocument()
  expect(screen.getByRole('switch', { name: 'Se reconnecter au démarrage' })).toBeInTheDocument()
})

test('les quatre moteurs livrés n’affichent plus « pas encore d’adaptateur »', async () => {
  monter()
  for (const nom of ['PostgreSQL', 'MongoDB', 'SQLite', 'MySQL']) {
    await choisirLeMoteur(nom)
    expect(screen.queryByText(/n’a pas encore d’adaptateur/)).toBeNull()
  }
})

test('MySQL garde ses champs de serveur : ce n’est pas un moteur de fichier', async () => {
  monter()
  await choisirLeMoteur('MySQL')
  // Seul SQLite s'ouvre depuis un fichier (`17a`). Masquer l'hôte pour MySQL empêcherait de le
  // déclarer — le genre de généralisation qu'un `FILE_ENGINES` trop large produirait.
  expect(screen.getByLabelText('Hôte')).toBeInTheDocument()
  expect(screen.getByLabelText('Port')).toBeInTheDocument()
  expect(screen.getByLabelText('Base par défaut')).toBeInTheDocument()
})

test('un moteur sans adaptateur reste sélectionnable et le dit', async () => {
  monter()
  await choisirLeMoteur('Redis')
  // Le masquer ferait croire que le produit ne le prévoit pas ; le laisser muet ferait croire que
  // « Tester » est cassé. La règle de `08b`, toujours valable pour les quatre moteurs restants.
  expect(screen.getByText(`${ENGINES.redis.label} n’a pas encore d’adaptateur`)).toBeInTheDocument()
})

// --- Le certificat d'autorité (`06f`) ---

test('le champ d’autorité n’apparaît que pour les modes qui authentifient', async () => {
  monter()
  // `prefer`, le mode par défaut : il chiffre si le serveur l'offre, sans authentifier.
  expect(screen.queryByLabelText('Certificat d’autorité')).toBeNull()

  // Le mode SSL est un `Select`, pas un groupe de radios.
  await choisirDansLaListe('Mode SSL', 'verify-ca')
  expect(screen.getByLabelText('Certificat d’autorité')).toBeInTheDocument()

  // **`require` chiffre sans authentifier** : le champ n'y servirait à rien, et l'afficher ferait
  // croire qu'il change quelque chose. C'est « l'erreur classique » que `06b` désignait, rendue
  // visible à l'écran.
  await choisirDansLaListe('Mode SSL', 'require')
  expect(screen.queryByLabelText('Certificat d’autorité')).toBeNull()
})

test('le champ d’autorité dit ce qu’un vide veut dire', async () => {
  monter()
  await choisirDansLaListe('Mode SSL', 'verify-full')
  const champ = screen.getByLabelText('Certificat d’autorité')
  // Sans cette indication, un champ vide se lirait comme un réglage manquant plutôt que comme
  // « les autorités publiques suffisent ».
  expect(champ).toHaveAttribute('placeholder', expect.stringContaining('autorités publiques'))
})

test('un moteur de fichier n’a pas de mode SSL, donc pas d’autorité', async () => {
  monter()
  await choisirLeMoteur('SQLite')
  // Un fichier local n'a pas de transport à chiffrer (`17a`) : ni l'un ni l'autre n'a de sens.
  expect(screen.queryByLabelText('Mode SSL')).toBeNull()
  expect(screen.queryByLabelText('Certificat d’autorité')).toBeNull()
})
