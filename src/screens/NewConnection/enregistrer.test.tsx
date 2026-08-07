import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import type { Project, SaveDatabaseRequest } from '../../domain/config'
import { emptyDraft } from './ConnectionDraft'
import { draftToSaveRequest } from './enregistrerLaBase'
import { NewConnection } from './NewConnection'

const PROJETS = [{ id: 'Atelier Nord', name: 'Atelier Nord' }]

const APRES: Project[] = [{ name: 'Atelier Nord', activeEnvironment: 'dev', databases: [] }]

type Espion = { requetes: SaveDatabaseRequest[]; projets: Project[][] }

function monter(
  options: {
    onSave?: (request: SaveDatabaseRequest) => Promise<Project[]>
    projects?: readonly { id: string; name: string }[]
    onClose?: () => void
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
