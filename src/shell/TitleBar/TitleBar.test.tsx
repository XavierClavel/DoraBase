import { render, screen } from '@testing-library/react'
import { TitleBar } from './TitleBar'

test('porte la zone de glissement de la fenêtre', () => {
  const { container } = render(<TitleBar />)
  expect(container.firstElementChild).toHaveAttribute('data-tauri-drag-region')
})

test('affiche le wordmark et l’accès aux préférences', () => {
  render(<TitleBar />)
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /préférences/i })).toBeInTheDocument()
})

test('n’a pas d’accès à la console', () => {
  render(<TitleBar />)
  expect(screen.queryByRole('button', { name: /console/i })).not.toBeInTheDocument()
})

// **Une seule action dans la barre**, l'engrenage. Le bouton de console est parti le 26 août 2026 :
// il n'avait pas d'`onClick`, donc il se lisait comme une panne (défaut n° 36).
test('n’a qu’une action, les préférences', () => {
  render(<TitleBar />)
  const actions = screen.getAllByRole('button')
  expect(actions).toHaveLength(1)
  expect(actions[0]).toHaveAccessibleName(/préférences/i)
})
