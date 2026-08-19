import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useRaccourcisDeCreation } from './useRaccourcisDeCreation'

function Ecran({
  nouveauProjet,
  ajouterUneConnexion,
  modale = false,
}: {
  nouveauProjet: () => void
  ajouterUneConnexion: () => void
  modale?: boolean
}) {
  useRaccourcisDeCreation({ nouveauProjet, ajouterUneConnexion })
  return (
    <>
      <input aria-label="Requête" />
      {modale ? <div role="dialog">Une modale</div> : null}
    </>
  )
}

function monter(modale = false) {
  const nouveauProjet = vi.fn()
  const ajouterUneConnexion = vi.fn()
  render(
    <Ecran
      nouveauProjet={nouveauProjet}
      ajouterUneConnexion={ajouterUneConnexion}
      modale={modale}
    />,
  )
  return { nouveauProjet, ajouterUneConnexion }
}

test('⌘N ouvre « Nouveau projet »', async () => {
  const { nouveauProjet, ajouterUneConnexion } = monter()
  await userEvent.keyboard('{Meta>}n{/Meta}')
  expect(nouveauProjet).toHaveBeenCalledTimes(1)
  expect(ajouterUneConnexion).not.toHaveBeenCalled()
})

test('⇧⌘N ouvre « Ajouter une connexion »', async () => {
  const { nouveauProjet, ajouterUneConnexion } = monter()
  await userEvent.keyboard('{Meta>}{Shift>}N{/Shift}{/Meta}')
  expect(ajouterUneConnexion).toHaveBeenCalledTimes(1)
  // **Le sens ne se partage pas** : `⇧⌘N` ne doit pas déclencher les deux, ce que ferait un test
  // du seul `metaKey` sans regarder `shiftKey`.
  expect(nouveauProjet).not.toHaveBeenCalled()
})

test('« n » seul ne déclenche rien', async () => {
  const { nouveauProjet, ajouterUneConnexion } = monter()
  await userEvent.keyboard('n')
  expect(nouveauProjet).not.toHaveBeenCalled()
  expect(ajouterUneConnexion).not.toHaveBeenCalled()
})

test('rien pendant qu’une modale est ouverte', async () => {
  const { nouveauProjet, ajouterUneConnexion } = monter(true)
  await userEvent.keyboard('{Meta>}n{/Meta}')
  await userEvent.keyboard('{Meta>}{Shift>}N{/Shift}{/Meta}')
  expect(nouveauProjet).not.toHaveBeenCalled()
  expect(ajouterUneConnexion).not.toHaveBeenCalled()
})

test('rien depuis une zone de saisie', async () => {
  const { nouveauProjet, ajouterUneConnexion } = monter()
  await userEvent.click(screen.getByLabelText('Requête'))
  await userEvent.keyboard('{Meta>}{Shift>}N{/Shift}{/Meta}')
  expect(ajouterUneConnexion).not.toHaveBeenCalled()
  expect(nouveauProjet).not.toHaveBeenCalled()
})
