import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { CreateProjectRequest, Project } from '../../domain/config'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { NewProject } from './NewProject'

function monter(projets: readonly { name: string }[] = [], raison?: string) {
  const creations: CreateProjectRequest[] = []
  const crees: string[] = []
  const onCreate = vi.fn(async (request: CreateProjectRequest) => {
    creations.push(request)
    return [] as Project[]
  })
  render(
    <>
      <Sprite />
      <LanguageProvider preferences={{ language: 'fr' }}>
        <NewProject
          projets={projets}
          onClose={() => {}}
          onCreate={onCreate}
          onCreated={(_projects, nom) => crees.push(nom)}
          {...(raison === undefined ? {} : { raison })}
        />
      </LanguageProvider>
    </>,
  )
  return { creations, crees, onCreate }
}

const continuer = () => screen.getByRole('button', { name: /Continuer/ })
const nommer = (utilisateur: ReturnType<typeof userEvent.setup>, nom: string) =>
  utilisateur.type(screen.getByLabelText('Nom du projet'), nom)

test('la modale ne demande que le nom et les environnements', () => {
  monter()
  expect(screen.getByRole('dialog', { name: 'Nouveau projet' })).toBeInTheDocument()
  expect(screen.getByLabelText('Nom du projet')).toBeInTheDocument()
  // **Rien du formulaire de connexion.** C'est le renversement de `24a` : le projet cesse d'être un
  // effet de bord de la déclaration d'une connexion.
  expect(screen.queryByLabelText('Hôte')).toBeNull()
  expect(screen.queryByLabelText('Mot de passe')).toBeNull()
})

test('le trio de `23a` est prérempli, `prod` marqué production', () => {
  monter()
  const libelles = screen.getAllByRole('textbox').map((champ) => (champ as HTMLInputElement).value)
  expect(libelles).toEqual(['', 'dev', 'staging', 'prod'])
  // Un seul drapeau allumé : c'est lui qui accrochera les garde-fous d'écriture (`11d`).
  const allumees = screen
    .getAllByRole('switch')
    .filter((b) => b.getAttribute('aria-checked') === 'true')
  expect(allumees).toHaveLength(1)
})

test('le stepper annonce deux étapes, la première en cours', () => {
  monter()
  const bande = screen.getByRole('list', { name: 'Progression' })
  expect(within(bande).getAllByRole('listitem')).toHaveLength(2)
  expect(within(bande).getByRole('listitem', { current: 'step' })).toHaveTextContent(
    'Étape 1 sur 2, en cours',
  )
})

test('sans nom, « Continuer » est désactivé **et dit pourquoi**', () => {
  monter()
  // La règle du défaut n° 36 : un bouton inerte et muet se lit comme une panne.
  expect(continuer()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Donnez un nom au projet.')
})

test('un nom déjà pris est dit avant le clic, sans aller-retour', async () => {
  const utilisateur = userEvent.setup()
  monter([{ name: 'Atelier Nord' }])
  await nommer(utilisateur, 'Atelier Nord')
  // La liste des projets est en mémoire : le refus n'a pas à venir du disque.
  expect(continuer()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Un projet s’appelle déjà')
})

test('deux libellés identiques sont refusés, en nommant le doublon', async () => {
  const utilisateur = userEvent.setup()
  monter()
  await nommer(utilisateur, 'Halle')
  const staging = screen.getAllByRole('textbox')[2] as HTMLInputElement
  await utilisateur.clear(staging)
  await utilisateur.type(staging, 'dev')

  // `23a` en ferait deux identifiants identiques, ce que le modèle refuse. Le dire ici évite un
  // aller-retour dont le message serait technique.
  expect(continuer()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Deux environnements s’appellent « dev »')
})

test('un libellé vide est refusé', async () => {
  const utilisateur = userEvent.setup()
  monter()
  await nommer(utilisateur, 'Halle')
  await utilisateur.clear(screen.getAllByRole('textbox')[1] as HTMLInputElement)
  expect(continuer()).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('besoin d’un libellé')
})

test('un environnement s’ajoute et se retire', async () => {
  const utilisateur = userEvent.setup()
  monter()
  await utilisateur.click(screen.getByRole('button', { name: /Ajouter un environnement/ }))
  expect(screen.getAllByRole('textbox')).toHaveLength(5)

  await utilisateur.click(screen.getByRole('button', { name: /Retirer l’environnement 4/ }))
  expect(screen.getAllByRole('textbox')).toHaveLength(4)
})

test('le dernier environnement ne se retire pas, et le bouton dit pourquoi', async () => {
  const utilisateur = userEvent.setup()
  monter()
  await utilisateur.click(screen.getByRole('button', { name: /Retirer prod/ }))
  await utilisateur.click(screen.getByRole('button', { name: /Retirer staging/ }))

  const dernier = screen.getByRole('button', { name: /Retirer dev/ })
  // `23a` refuse un projet sans environnement : une connexion appartient à l'un d'eux.
  expect(dernier).toBeDisabled()
  expect(dernier).toHaveAttribute('title', expect.stringContaining('au moins un environnement'))
})

test('« Continuer » envoie les libellés saisis, rognés, sans identifiant', async () => {
  const utilisateur = userEvent.setup()
  const { creations, crees } = monter()
  await nommer(utilisateur, '  Data science  ')
  const dev = screen.getAllByRole('textbox')[1] as HTMLInputElement
  await utilisateur.clear(dev)
  await utilisateur.type(dev, '  recette  ')
  await utilisateur.click(continuer())

  await waitFor(() => expect(creations).toHaveLength(1))
  expect(creations[0]?.name).toBe('Data science')
  expect(creations[0]?.environments.map((e) => e.label)).toEqual(['recette', 'staging', 'prod'])
  // **L'identifiant part vide, et c'est délibéré** : `23a` porte la règle de dérivation côté Rust.
  // La refaire ici donnerait deux implémentations, qui divergeraient au premier caractère exotique.
  expect(creations[0]?.environments.every((e) => e.id === '')).toBe(true)
  // Et l'appelant reçoit le nom, pour enchaîner sur l'étape 2 (`24c`).
  await waitFor(() => expect(crees).toEqual(['Data science']))
})

test('un refus du cœur s’affiche là où les autres s’affichent', async () => {
  const utilisateur = userEvent.setup()
  render(
    <>
      <Sprite />
      <LanguageProvider preferences={{ language: 'fr' }}>
        <NewProject
          projets={[]}
          onClose={() => {}}
          onCreate={async () => {
            throw 'le fichier de configuration est en lecture seule'
          }}
          onCreated={() => {}}
        />
      </LanguageProvider>
    </>,
  )
  await nommer(utilisateur, 'Halle')
  await utilisateur.click(continuer())

  // L'utilisateur n'a pas à savoir lequel des deux a parlé — l'écran ou le cœur.
  await waitFor(() => expect(screen.getByText(/lecture seule/)).toBeInTheDocument())
})

// **La raison n'est pas décorative** : sans elle, une modale « Nouveau projet » répond à un clic sur
// « Ajouter une connexion » sans que rien n'explique l'écart (`24d`).
test('la raison d’ouverture s’affiche quand elle est donnée', () => {
  monter([], 'Une connexion appartient à un projet. Commençons par le projet.')
  expect(
    screen.getByText('Une connexion appartient à un projet. Commençons par le projet.'),
  ).toBeInTheDocument()
})

test('sans raison, rien ne s’ajoute au-dessus du nom', () => {
  monter()
  expect(screen.queryByTestId('raison-d-ouverture')).toBeNull()
})

// **Le refus du cœur doit se voir et s'annoncer.** Il partageait le `role` et l'encre de
// l'empêchement calculé : `role={undefined}` quand `empeche` était nul, donc rien n'était annoncé, et
// le même gris qu'une aide à la saisie. C'est ce qui a fait dire « je clique et rien ne se passe »
// (défaut n° 100) — alors qu'un refus était bien rendu.
test('un refus du cœur est annoncé comme une alerte', async () => {
  const utilisateur = userEvent.setup()
  render(
    <>
      <Sprite />
      <LanguageProvider preferences={{ language: 'fr' }}>
        <NewProject
          projets={[]}
          onClose={() => {}}
          onCreate={async () => {
            throw 'deux environnements portent le même identifiant'
          }}
          onCreated={() => {}}
        />
      </LanguageProvider>
    </>,
  )
  await nommer(utilisateur, 'Atelier Nord')
  await utilisateur.click(continuer())

  const alerte = await screen.findByRole('alert')
  expect(alerte).toHaveTextContent('même identifiant')
})

test('un empêchement reste un état, non une alerte', () => {
  monter()
  // Rien n'a encore été tenté : la phrase dit ce qui manque, elle ne signale pas d'échec.
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status')).toHaveTextContent('Donnez un nom au projet')
})
