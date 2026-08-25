import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import type { Project, SaveDatabaseRequest } from '../../domain/config'
import { emptyDraft } from './ConnectionDraft'
import { draftToSaveRequest } from './enregistrerLaBase'
import { NewConnection } from './NewConnection'
import { TRIO_DE_TEST } from './pourLesTests'

const PROJETS = [{ id: 'Atelier Nord', name: 'Atelier Nord', environments: TRIO_DE_TEST }]

const APRES: Project[] = [
  {
    name: 'Atelier Nord',
    environments: TRIO_DE_TEST,
    databases: [],
    queries: [],
  },
]

type Espion = {
  requetes: SaveDatabaseRequest[]
  projets: Project[][]
}

function monter(
  options: {
    onSave?: (request: SaveDatabaseRequest) => Promise<Project[]>
    projects?: readonly { id: string; name: string; environments: typeof TRIO_DE_TEST }[]
    onClose?: () => void
    projetImpose?: string
  } = {},
) {
  const espion: Espion = { requetes: [], projets: [] }
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
        projetImpose={options.projetImpose}
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
  // ferme.
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

// --- L'étape 2 du parcours de création (`24c`) ---
//
// **Six tests ont disparu ici, et ils n'ont pas été « adaptés ».** Ils vérifiaient que `A2` créait un
// projet au passage, par l'entrée « + Nouveau projet… » de son sélecteur — le geste de `08f`, où
// déclarer un projet et sa première base était un seul acte en deux commandes. Le geste s'est inversé
// (`24a`) : le projet se crée dans son propre écran, et cet écran ne crée plus rien. Les garanties
// qu'ils portaient ont déménagé — le rognage du nom et le refus d'un nom vide sont dans
// `NewProject.test.tsx`, le trio repris par défaut est un test Rust de `creer_projet`.
//
// Ce qui suit vérifie ce qui **reste** : qu'un projet imposé remplace le sélecteur, que la sortie ne
// mente pas, et qu'un échec dise que le projet est gardé.

test('un projet imposé remplace le sélecteur par un constat', () => {
  monter({ projetImpose: 'Data science', projects: PROJETS })

  // Le sélecteur serait faux de deux façons : il proposerait de changer un choix que l'étape 1 vient
  // de trancher, et son entrée « + Nouveau projet… » rebouclerait vers cette étape.
  expect(screen.queryByRole('combobox', { name: 'Projet' })).toBeNull()
  // **Par son `data-testid`** : le nom du projet apparaît aussi dans la ligne d'information du pied,
  // et un sélecteur par texte trouverait les deux.
  expect(screen.getByTestId('projet-impose')).toHaveTextContent('Data science')
})

test('les environnements proposés sont ceux du projet **imposé**', () => {
  monter({ projetImpose: 'Atelier Nord', projects: PROJETS })
  // **Le défaut que ce test garde.** L'effet qui ramène le brouillon sur un projet valable rend la main
  // quand le projet est imposé : `draft.project` reste vide, et chercher les environnements avec lui
  // n'en trouvait aucun. Le groupe était vide, donc l'étape 2 ne permettait pas de déclarer une
  // connexion. Trouvé par une mesure de `08b`, qui compte les trois boutons.
  const radios = screen
    .getByRole('group', { name: 'Environnement' })
    .querySelectorAll('input[type=radio]')
  expect(radios).toHaveLength(3)
})

test('le constat n’est pas un contrôle', () => {
  monter({ projetImpose: 'Data science' })
  const constat = screen.getByTestId('projet-impose')
  // **Pas un `Chip`, et pas cliquable** : un chip est un contrôle partout ailleurs dans ce produit, et
  // un chip inerte se lit comme un contrôle en panne. Les quatre marques du cliquable sont absentes.
  expect(constat.closest('button')).toBeNull()
  expect(constat).not.toHaveAttribute('role')
  expect(screen.queryAllByRole('combobox', { name: 'Projet' })).toHaveLength(0)
})

test('la bande de progression paraît, et dit qu’on est à la seconde étape', () => {
  monter({ projetImpose: 'Data science' })
  const bande = screen.getByRole('list', { name: 'Progression' })
  expect(within(bande).getByRole('listitem', { current: 'step' })).toHaveTextContent(
    'Étape 2 sur 2, en cours',
  )
  // La première est **faite** : l'utilisateur vient de la faire, et le dire est exact.
  expect(within(bande).getAllByRole('listitem')[0]).toHaveTextContent('Étape 1 sur 2, faite')
})

test('sans projet imposé, la bande est absente', () => {
  monter({ projects: PROJETS })
  // Ouvert pour un projet existant, cet écran n'a qu'une étape. Une bande qui montrerait « 1 ✓ »
  // affirmerait que cette modale a créé le projet.
  expect(screen.queryByRole('list', { name: 'Progression' })).toBeNull()
})

test('« Annuler » devient « Plus tard » quand le projet est déjà créé', () => {
  monter({ projetImpose: 'Data science' })
  // À ce moment, « Annuler » mentirait : le projet reste. Un bouton ne doit pas nommer un
  // défaissement qui n'a pas lieu.
  expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
})

test('la ligne d’information nomme le projet créé et le chemin de retour', () => {
  monter({ projetImpose: 'Data science' })
  const ligne = screen.getByRole('status')
  expect(ligne).toHaveTextContent('Le projet Data science est créé')
  // Elle nomme le chemin de retour : c'est ce qui rend « Plus tard » sans conséquence.
  expect(ligne).toHaveTextContent('plus tard depuis la sidebar')
})

test('la connexion est enregistrée dans le projet imposé, non dans celui du brouillon', async () => {
  const utilisateur = userEvent.setup()
  const espion = monter({ projetImpose: 'Data science', projects: PROJETS })
  await utilisateur.type(screen.getByLabelText('Nom de la base'), 'analytics')
  await utilisateur.click(enregistrer())

  await waitFor(() => expect(espion.requetes).toHaveLength(1))
  // Le brouillon porte encore le premier projet de la liste ; c'est le projet **imposé** qui compte.
  expect(espion.requetes[0]?.project).toBe('Data science')
})

test('un échec d’enregistrement dit que le projet est gardé', async () => {
  const utilisateur = userEvent.setup()
  monter({
    projetImpose: 'Data science',
    onSave: async () => {
      throw new Error('la base « analytics » existe déjà dans ce projet')
    },
  })
  await utilisateur.type(screen.getByLabelText('Nom de la base'), 'analytics')
  await utilisateur.click(enregistrer())

  // **Sans cette précision, le défaut se produirait à coup sûr** : l'utilisateur ferme, recommence par
  // « Nouveau projet », et se heurte à « ce nom est déjà pris ».
  expect(
    await screen.findByText(/est créé ; la connexion n’a pas été enregistrée/),
  ).toBeInTheDocument()
})
