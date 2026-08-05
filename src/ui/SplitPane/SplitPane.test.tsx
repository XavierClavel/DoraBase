import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SplitPane } from './SplitPane'

afterEach(() => localStorage.clear())

test('applique la taille par défaut au montage', () => {
  render(
    <SplitPane
      storageKey="test-a"
      defaultSize={212}
      min={150}
      max={400}
      start={<div>gauche</div>}
      end={<div>droite</div>}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '212')
})

test('relit la taille stockée plutôt que la valeur par défaut', () => {
  localStorage.setItem('dorabase:split:test-b', '250')
  render(
    <SplitPane
      storageKey="test-b"
      defaultSize={212}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '250')
})

test('ignore une valeur stockée hors bornes', () => {
  localStorage.setItem('dorabase:split:test-c', '999')
  render(
    <SplitPane
      storageKey="test-c"
      defaultSize={212}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '400')
})

// Ces trois tests couvrent l'écriture dans `localStorage`, que les trois précédents
// laissaient entièrement de côté : constaté par contrôle négatif — supprimer l'appel à
// `setItem` du composant les laissait tous les trois au vert.
test('les flèches clavier redimensionnent par pas de 8px et persistent', async () => {
  render(
    <SplitPane
      storageKey="test-d"
      defaultSize={200}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  handle.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '208')
  expect(localStorage.getItem('dorabase:split:test-d')).toBe('208')
})

test('le glissement à la souris redimensionne et persiste', () => {
  render(
    <SplitPane
      storageKey="test-e"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  fireEvent.pointerDown(handle, { clientX: 100 })
  fireEvent.pointerMove(window, { clientX: 130 })
  fireEvent.pointerUp(window)
  expect(handle).toHaveAttribute('aria-valuenow', '230')
  expect(localStorage.getItem('dorabase:split:test-e')).toBe('230')
})

test('le clavier respecte les bornes', async () => {
  render(
    <SplitPane
      storageKey="test-f"
      defaultSize={155}
      min={150}
      max={160}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  handle.focus()
  for (let i = 0; i < 5; i++) await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '160')
})
