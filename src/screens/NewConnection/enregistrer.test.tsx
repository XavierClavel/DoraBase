import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import type { CreateProjectRequest, Project, SaveDatabaseRequest } from '../../domain/config'
import { emptyDraft } from './ConnectionDraft'
import { draftToSaveRequest } from './enregistrerLaBase'
import { NewConnection } from './NewConnection'

const PROJETS = [{ id: 'Atelier Nord', name: 'Atelier Nord' }]

const APRES: Project[] = [
  { name: 'Atelier Nord', activeEnvironment: 'dev', databases: [], queries: [] },
]

type Espion = {
  requetes: SaveDatabaseRequest[]
  projets: Project[][]
  creations: CreateProjectRequest[]
}

function monter(
  options: {
    onSave?: (request: SaveDatabaseRequest) => Promise<Project[]>
    projects?: readonly { id: string; name: string }[]
    onClose?: () => void
    onCreateProject?: (request: CreateProjectRequest) => Promise<Project[]>
  } = {},
) {
  const espion: Espion = { requetes: [], projets: [], creations: [] }
  render(
    <>
      <Sprite />
      <NewConnection
        onClose={options.onClose ?? (() => {})}
        projects={options.projects ?? PROJETS}
        onBrowseKey={async () => null}
        onTest={async () => {
          throw new Error('non employé dans ces tests')
        }}
        onSave={
          options.onSave ??
          (async (request) => {
            espion.requetes.push(request)
            return APRES
          })
        }
        onCreateProject={
          options.onCreateProject ??
          (async (request) => {
            espion.creations.push(request)
            return APRES
          })
        }
        onSaved={(projets) => espion.projets.push(projets)}
      />
    </>,
  )
  return espion
}

const enregistrer = () => screen.getByRole('button', { name: /Enregistrer & ouvrir/ })

// --- La conversion du brouillon ---

test('la variante envoyée ne porte jamais de mot de passe', () => {
  const draft = { ...emptyDraft(), password: 's3cr3t', name: 'analytics', project: 'p' }
  const requete = draftToSaveRequest(draft)

  // Aucune `SecretRef` n'existe avant que le secret soit rangé : c'est `enregistrer` côté Rust
  // qui la fabrique. La poser ici obligerait le front à connaître la convention de nommage des
  // références, donc à la dupliquer.
  expect(requete.variant.password).toBeNull()
  expect(requete.password).toBe('s3cr3t')
})

test('un mot de passe vide devient null, pas une chaîne vide', () => {
  // Une chaîne vide se rangerait dans le magasin comme un secret légitime, et la variante
  // porterait une référence vers du vide.
  expect(draftToSaveRequest(emptyDraft()).password).toBeNull()
})

test('un port illisible devient 0 plutôt que NaN', () => {
  // `NaN` ferait échouer la désérialisation de `serde` avec un message illisible ; `0` produit
  // une erreur de connexion claire du côté du moteur.
  const requete = draftToSaveRequest({ ...emptyDraft(), port: 'quatre-mille' })
  expect(requete.variant.port).toBe(0)
})

test('le tunnel est null quand il n’y en a pas', () => {
  // `05a` modélise `Option<Tunnel>`, et `06b` refuse une variante déclarant un tunnel qu'on n'a
  // pas ouvert : un objet à champs vides deviendrait une tentative vers un bastion sans nom.
  expect(draftToSaveRequest(emptyDraft()).variant.tunnel).toBeNull()
})

// --- L'enregistrement ---

test('cliquer enregistre, puis ferme la modale', async () => {
  const fermer = vi.fn()
  const espion = monter({ onClose: fermer })

  await userEvent.type(screen.getByLabelText('Nom de la base'), 'analytics')
  await userEvent.click(enregistrer())

  await waitFor(() => expect(espion.requetes).toHaveLength(1))
  expect(espion.requetes[0]?.database).toBe('analytics')
  // Le projet est celui que le `Select` **affiche**, pas la chaîne vide du brouillon neuf :
  // c'est le piège du select contrôlé, corrigé dans `NewConnection`.
  expect(espion.requetes[0]?.project).toBe('Atelier Nord')
  // « Ouvrir » veut dire aller vers `A4`, qui n'existe pas avant `09` : ce scope enregistre et
  // ferme. Voir `specs/08e` § Hors périmètre.
  await waitFor(() => expect(fermer).toHaveBeenCalledOnce())
})

test('les projets à jour sont remontés à l’appelant', async () => {
  const espion = monter()
  await userEvent.click(enregistrer())
  // Rendus par la commande plutôt que relus : sans cela l'écran devrait faire un second
  // aller-retour, et il existerait une fenêtre où l'écran et le disque divergent.
  await waitFor(() => expect(espion.projets).toEqual([APRES]))
})

test('⌘↩ enregistre', async () => {
  const espion = monter()
  await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
  await waitFor(() => expect(espion.requetes).toHaveLength(1))
})

test('⌘↩ est inopérant quand le bouton est désactivé', async () => {
  // Un raccourci qui contourne l'état d'un bouton est un piège : il ferait passer outre le
  // refus que l'écran vient d'afficher.
  const espion = monter({ projects: [] })
  expect(enregistrer()).toBeDisabled()

  await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
  expect(espion.requetes).toHaveLength(0)
})

test('un refus est affiché et la modale reste ouverte', async () => {
  const fermer = vi.fn()
  monter({
    onClose: fermer,
    onSave: async () => {
      throw { code: null, position: null, message: 'le nom de la base est déjà pris' }
    },
  })

  await userEvent.click(enregistrer())

  // Le refus s'affiche là où `08d` affiche déjà les échecs : `A2` ne maquette aucun message
  // d'erreur de champ. Réemploi plutôt qu'invention.
  await waitFor(() =>
    expect(screen.getByText('le nom de la base est déjà pris')).toBeInTheDocument(),
  )
  expect(fermer).not.toHaveBeenCalled()
})

test('un refus n’empêche pas de corriger puis de réessayer', async () => {
  let refuse = true
  const espion = monter({
    onSave: async (request) => {
      if (refuse) throw { code: null, position: null, message: 'nom déjà pris' }
      espion.requetes.push(request)
      return APRES
    },
  })

  await userEvent.click(enregistrer())
  await waitFor(() => expect(screen.getByText('nom déjà pris')).toBeInTheDocument())

  refuse = false
  await userEvent.type(screen.getByLabelText('Nom de la base'), 'analytics2')
  await userEvent.click(enregistrer())
  await waitFor(() => expect(espion.requetes).toHaveLength(1))
})

test('pendant l’enregistrement, le bouton ne se reclique pas', async () => {
  let debloquer: (() => void) | undefined
  let appels = 0
  monter({
    onSave: async () => {
      appels += 1
      await new Promise<void>((resolve) => {
        debloquer = resolve
      })
      return APRES
    },
  })

  await userEvent.click(enregistrer())
  await waitFor(() => expect(enregistrer()).toBeDisabled())
  await userEvent.click(enregistrer())
  expect(appels).toBe(1)

  debloquer?.()
})

// --- Créer un projet (08f) ---

/** Choisit « + Nouveau projet… » et saisit un nom. */
async function creerLeProjet(utilisateur: ReturnType<typeof userEvent.setup>, nom: string) {
  await utilisateur.selectOptions(
    screen.getByRole('combobox', { name: 'Projet' }),
    screen.getByRole('option', { name: '+ Nouveau projet…' }),
  )
  await utilisateur.type(screen.getByLabelText('Nom du nouveau projet'), nom)
}

test('créer un projet et sa base est un seul geste, en deux commandes', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter()
  await utilisateur.type(screen.getByLabelText('Nom de la base'), 'analytics')
  await creerLeProjet(utilisateur, 'Data science')

  await utilisateur.click(enregistrer())

  await waitFor(() => expect(espion.creations).toHaveLength(1))
  expect(espion.creations[0]?.name).toBe('Data science')
  // L'environnement du projet vient de la variante déclarée : le coder à `dev` afficherait un
  // arbre vide juste après l'enregistrement d'une base `prod`.
  expect(espion.creations[0]?.activeEnvironment).toBe('dev')

  // Puis la base, dans le projet qui vient d'être créé — et non sous la sentinelle du `Select`.
  await waitFor(() => expect(espion.requetes).toHaveLength(1))
  expect(espion.requetes[0]?.project).toBe('Data science')
})

test('l’environnement du projet suit la variante choisie', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter()
  await utilisateur.click(screen.getByRole('radio', { name: /prod/ }))
  await creerLeProjet(utilisateur, 'Data science')
  await utilisateur.click(enregistrer())

  await waitFor(() => expect(espion.creations[0]?.activeEnvironment).toBe('prod'))
})

test('le nom du projet est rogné avant d’être envoyé', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter()
  await creerLeProjet(utilisateur, '  Data science  ')
  await utilisateur.click(enregistrer())

  // Rogné des deux côtés : « Print » et « Print  » désigneraient sinon deux projets, dont un
  // invisiblement différent dans la sidebar. Le cœur le rogne aussi — ceinture et bretelles, et
  // c'est la requête envoyée qui doit être propre.
  await waitFor(() => expect(espion.creations[0]?.name).toBe('Data science'))
  expect(espion.requetes[0]?.project).toBe('Data science')
})

test('sans nom saisi, l’enregistrement est bloqué et rien n’est envoyé', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter()
  await utilisateur.selectOptions(
    screen.getByRole('combobox', { name: 'Projet' }),
    screen.getByRole('option', { name: '+ Nouveau projet…' }),
  )

  // L'écran a l'information sous la main : l'envoyer pour se faire refuser coûterait un
  // aller-retour et un message venu du cœur là où le formulaire sait déjà.
  expect(enregistrer()).toBeDisabled()
  await utilisateur.click(enregistrer())
  expect(espion.creations).toHaveLength(0)
  expect(espion.requetes).toHaveLength(0)
})

test('un projet existant choisi ne déclenche aucune création', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter({ projects: PROJETS })
  await utilisateur.type(screen.getByLabelText('Nom de la base'), 'analytics')
  await utilisateur.click(enregistrer())

  await waitFor(() => expect(espion.requetes).toHaveLength(1))
  expect(espion.creations).toHaveLength(0)
})

test('un projet créé dont la base échoue reste créé, et l’écran le dit', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter({
    onSave: async () => {
      throw new Error('la base « analytics » existe déjà dans ce projet')
    },
  })
  await creerLeProjet(utilisateur, 'Data science')
  await utilisateur.click(enregistrer())

  // Le défaire supprimerait un projet à la suite d'un échec, et détruirait un homonyme
  // préexistant en cas de course. `08f` l'assume : le projet reste, vide, et se remplit au geste
  // suivant.
  await waitFor(() => expect(espion.creations).toHaveLength(1))
  // Les projets à jour ont été publiés dès la création : l'arbre montre le projet vide.
  expect(espion.projets).toHaveLength(1)
  expect(await screen.findByText(/existe déjà dans ce projet/)).toBeInTheDocument()
})
