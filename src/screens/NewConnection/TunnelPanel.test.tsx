import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { choisirDansLaListe, optionsDeLaListe } from '../../ui/Select/pourLesTests'
import { NewConnection } from './NewConnection'

function monter(onBrowseKey?: () => Promise<string | null>) {
  return render(
    <>
      <Sprite />
      <LanguageProvider preferences={{ language: 'fr' }}>
        <NewConnection onClose={() => {}} onBrowseKey={onBrowseKey ?? (async () => null)} />
      </LanguageProvider>
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
  // vrai choix. Cloud SQL n'était pas dans le handoff : ces libellés sont inventés.
  expect(await optionsDeLaListe('Type')).toEqual(['SSH', 'Cloud SQL'])
})

test('le visage Cloud SQL montre son seul champ, et aucun champ de bastion', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')

  expect(panneau.getByLabelText('Instance')).toBeInTheDocument()
  // **Plus de champ de compte de service** (`06j`) : l'authentification est celle de la
  // machine, pas celle de la connexion. Le voir revenir voudrait dire qu'on a rouvert une voie
  // que `06i` a fermée, et qu'un chemin est de nouveau persisté sans migration pour le porter.
  expect(panneau.queryByLabelText('Compte de service')).not.toBeInTheDocument()
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
  for (const nom of ['Instance']) {
    expect(panneau.queryByLabelText(nom)).not.toBeInTheDocument()
  }
})

// **Le « Port local mappé » a été retiré du panneau** (24 août 2026). Trois tests partent avec
// lui : qu'il soit un `<output>`, qu'il reste hors de l'ordre de tabulation, et qu'il affiche
// « auto » sans numéro tant qu'aucun proxy n'est ouvert. Ce qu'ils protégeaient — « affiché,
// jamais saisi » — se vérifie désormais sur le champ « Port » du formulaire, grisé et valant
// « auto » derrière un proxy Cloud SQL (`ConnectionForm.test.tsx`).
test('le visage Cloud SQL dit qu’il est en IAM, et ce que cela change à la saisie', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')

  // **Plus de bascule** (24 août 2026) : le mode est toujours actif, et un interrupteur à deux
  // positions dont une n'est jamais choisie coûte un champ persisté, une conversion et deux
  // chemins à tester.
  expect(panneau.queryByRole('switch', { name: 'Authentification IAM' })).not.toBeInTheDocument()

  // Reste ce que l'écran seul ne montre pas, et qui ne se devine pas : l'identifiant est une
  // adresse, et le mot de passe ne sert plus. Sans cette phrase, une connexion IAM se remplit
  // comme une autre et n'apprend qu'à l'échec.
  const aide = panneau.getByText(/principal IAM/i)
  expect(aide.textContent).toMatch(/mot de passe n['’]est pas utilisé/i)
})
test('le visage Cloud SQL dit comment il s’authentifie, avec la commande entière', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')

  // **Un texte, plus un libellé de champ** (`06j`). Le lien `aria-describedby` existait pour
  // qu'un champ vide ne se lise pas comme un champ oublié ; sans champ, c'est le texte lui-même
  // qui porte l'information, et il doit rester dans le flux du panneau.
  const aide = panneau.getByText(/identifiants par défaut/i)
  expect(aide).toBeInTheDocument()
  // **La commande entière** (`06i`) : « identifiants par défaut » seul laisse deviner comment
  // on les installe, et `gcloud auth login` — la commande voisine, que tout le monde essaie
  // d'abord — n'alimente que le CLI, pas les applications.
  expect(aide.textContent).toContain('gcloud auth application-default login')
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

// **Deux tests retirés ici** (`06j`) : « Parcourir… » remplissait le champ de compte de
// service, et son annulation ne devait pas effacer le chemin saisi. Le champ n'existe plus,
// donc ni le bouton ni son annulation — et `ouvrirSelecteurDeCompteDeService` est parti avec
// eux. Le même geste sur la clé privée SSH reste couvert par `08c`.

test('le port du bastion est prérempli à 22, celui de la base à 5432', async () => {
  monter()
  const panneau = await deplier()
  // 22 est le port de SSH ; 5432 celui de PostgreSQL. Deux champs « Port » distincts, et les
  // confondre ferait tenter la base sur le port du bastion.
  expect(panneau.getByLabelText('Port')).toHaveValue('22')
  // L'ordre est celui du DOM, et le panneau **précède** désormais le formulaire (24 août
  // 2026) : le port du bastion vient donc en premier. Assertion sur l'ordre et non sur un
  // ensemble, parce que c'est ce qui distingue les deux champs homonymes.
  expect(screen.getAllByLabelText('Port').map((p) => (p as HTMLInputElement).value)).toEqual([
    '22',
    '5432',
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

// --- Ce que le proxy Cloud SQL décide à la place de l'utilisateur (24 août 2026) ---

/** Déclare un proxy Cloud SQL en saisissant une instance — c'est la saisie qui le déclare. */
async function declarerCloudSql() {
  const panneau = await choisirLeType('Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Instance'), 'acme:europe-west1:analytics')
  return panneau
}

test('derrière un proxy Cloud SQL, le port de la base est grisé et vaut « auto »', async () => {
  monter()
  await declarerCloudSql()

  // Le port du formulaire, pas celui du bastion : le second n'existe pas dans ce visage.
  const port = screen.getByLabelText('Port') as HTMLInputElement
  expect(port).toBeDisabled()
  expect(port.value).toBe('auto')
  // **Grisé et non masqué** : le faire disparaître ferait croire que la connexion n'a pas de
  // port, alors qu'elle en a un — simplement, ce n'est plus l'utilisateur qui le donne.
  expect(port).toBeInTheDocument()
  // Et il dit **pourquoi**, la leçon de `09f` : un champ désactivé sans explication se lit
  // comme un bug.
  expect(port.getAttribute('title')).toMatch(/proxy Cloud SQL/i)
})

test('derrière un proxy Cloud SQL, le mot de passe est grisé', async () => {
  monter()
  await declarerCloudSql()

  const motDePasse = screen.getByLabelText('Mot de passe')
  expect(motDePasse).toBeDisabled()
  expect(motDePasse.getAttribute('title')).toMatch(/IAM/i)

  // **Ni l'œil ni le badge « Trousseau »** : c'est le raisonnement de `17a` sur le moteur de
  // fichier — le badge promettrait de ranger un secret qui n'existera pas, le proxy présentant
  // un jeton. Et un œil qui dévoile un champ vide et grisé ne dévoile rien.
  expect(screen.queryByLabelText(/Afficher le mot de passe/)).not.toBeInTheDocument()
  expect(screen.queryByText('Trousseau')).not.toBeInTheDocument()
})

test('sans proxy Cloud SQL, ni le port ni le mot de passe ne sont grisés', async () => {
  monter()
  // L'autre moitié du critère : un tunnel SSH laisse les deux champs à l'utilisateur, la cible
  // derrière le bastion étant une base ordinaire, avec son port et son rôle.
  const panneau = await deplier()
  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'bastion.exemple.net')

  const [, port] = screen.getAllByLabelText('Port')
  expect(port).toBeEnabled()
  expect((port as HTMLInputElement).value).toBe('5432')
  expect(screen.getByLabelText('Mot de passe')).toBeEnabled()
})
