import { render, screen } from '@testing-library/react'
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
