import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { CreateProjectRequest, EnvironmentDeclaration, Project } from '../../domain/config'
import { ParcoursDeCreation } from './ParcoursDeCreation'

/** Un projet rendu par la création, avec les deux environnements que l'étape 2 doit proposer. */
function projetRendu(nom: string): Project {
  const environments: EnvironmentDeclaration[] = [
    { id: 'atelier', label: 'atelier', color: 'green', production: false },
    { id: 'vitrine', label: 'vitrine', color: 'red', production: true },
  ]
  return {
    name: nom,
    active_environment: 'atelier',
    environments,
    databases: [],
    queries: [],
  }
}

function monter(depart: Parameters<typeof ParcoursDeCreation>[0]['depart']) {
  const onCreate = vi.fn(async (request: CreateProjectRequest) => [projetRendu(request.name)])
  render(
    <>
      <Sprite />
      <ParcoursDeCreation
        depart={depart}
        projets={[]}
        onClose={() => {}}
        onProjets={() => {}}
        onCreate={onCreate}
      />
    </>,
  )
  return { onCreate }
}

test('l’étape 1 enchaîne sur l’étape 2, projet imposé', async () => {
  const utilisateur = userEvent.setup()
  monter({ etape: 'projet' })
  await utilisateur.type(screen.getByLabelText('Nom du projet'), 'Atelier Nord')
  await utilisateur.click(screen.getByRole('button', { name: /Continuer/ }))

  await waitFor(() => expect(screen.getByTestId('projet-impose')).toBeInTheDocument())
  expect(screen.getByTestId('projet-impose')).toHaveTextContent('Atelier Nord')
  // **Les environnements viennent du projet qui vient d'être créé**, non de la liste d'origine — qui
  // est vide ici, et ne le contenait donc pas. C'est le défaut que `24c` a corrigé : l'étape 2
  // n'offrait aucun environnement, faute de relire la liste rendue par la création.
  expect(screen.getByRole('radio', { name: /atelier/ })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /vitrine/ })).toBeInTheDocument()
})

test('entrer directement à l’étape 2 ne crée aucun projet', async () => {
  const { onCreate } = monter({ etape: 'connexion', projet: 'Atelier Nord' })
  expect(screen.getByTestId('projet-impose')).toHaveTextContent('Atelier Nord')
  expect(screen.queryByLabelText('Nom du projet')).toBeNull()
  expect(onCreate).not.toHaveBeenCalled()
})

test('la raison d’ouverture traverse jusqu’à l’étape 1', () => {
  monter({ etape: 'projet', raison: 'Une connexion appartient à un projet.' })
  expect(screen.getByTestId('raison-d-ouverture')).toHaveTextContent(
    'Une connexion appartient à un projet.',
  )
})
