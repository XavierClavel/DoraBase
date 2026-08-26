import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { useRaccourcisDeCreation } from './useRaccourcisDeCreation'

function Ecran({ nouveauProjet, modale = false }: { nouveauProjet: () => void; modale?: boolean }) {
  useRaccourcisDeCreation({ nouveauProjet })
  return (
    <>
      <input aria-label="Requête" />
      {modale ? <div role="dialog">Une modale</div> : null}
    </>
  )
}

function monter(modale = false) {
  const nouveauProjet = vi.fn()
  render(<Ecran nouveauProjet={nouveauProjet} modale={modale} />)
  return { nouveauProjet }
}

test('⌘N ouvre « Nouveau projet », et consomme la frappe', async () => {
  const { nouveauProjet } = monter()
  const consomme = await enConsommant(() => userEvent.keyboard('{Meta>}n{/Meta}'))
  expect(nouveauProjet).toHaveBeenCalledTimes(1)
  // Sans `preventDefault`, le navigateur ouvre une fenêtre par-dessus la modale qu'on vient d'ouvrir.
  expect(consomme).toBe(true)
})

test('⇧⌘N ne déclenche plus rien, et n’est plus consommé', async () => {
  const { nouveauProjet } = monter()
  // **Le raccourci a été retiré le 26 août 2026.** Il ouvrait « Ajouter une connexion », mais un
  // raccourci clavier ne désigne aucune ligne d'arbre : il fallait deviner le projet, donc retomber
  // sur le premier de la liste. Le geste part désormais du menu d'une ligne d'environnement.
  const consomme = await enConsommant(() => userEvent.keyboard('{Meta>}{Shift>}N{/Shift}{/Meta}'))
  expect(nouveauProjet).not.toHaveBeenCalled()
  // **Et il n'est pas avalé** : reprendre une frappe pour ne rien en faire est un raccourci mort. La
  // même règle que pour les deux refus — modale ouverte, zone de saisie.
  expect(consomme).toBe(false)
})

test('« n » seul ne déclenche rien', async () => {
  const { nouveauProjet } = monter()
  await userEvent.keyboard('n')
  expect(nouveauProjet).not.toHaveBeenCalled()
})

test('rien pendant qu’une modale est ouverte', async () => {
  const { nouveauProjet } = monter(true)
  await userEvent.keyboard('{Meta>}n{/Meta}')
  expect(nouveauProjet).not.toHaveBeenCalled()
})

test('rien depuis une zone de saisie', async () => {
  const { nouveauProjet } = monter()
  await userEvent.click(screen.getByLabelText('Requête'))
  await userEvent.keyboard('{Meta>}n{/Meta}')
  expect(nouveauProjet).not.toHaveBeenCalled()
})

/**
 * Joue un geste et dit si **quelqu'un l'a consommé** — c'est-à-dire si un `preventDefault` a été
 * appelé sur l'événement.
 *
 * `defaultPrevented` ne se lit pas sur l'événement que `userEvent` fabrique : il n'est pas rendu.
 * Un écouteur posé en dernier, sur `window`, voit donc l'état après nos crochets.
 */
async function enConsommant(geste: () => Promise<unknown>): Promise<boolean> {
  let consomme = false
  const temoin = (evenement: KeyboardEvent) => {
    consomme = evenement.defaultPrevented
  }
  window.addEventListener('keydown', temoin)
  try {
    await geste()
  } finally {
    window.removeEventListener('keydown', temoin)
  }
  return consomme
}
