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

test('n’affiche pas la console sur cet écran', () => {
  render(<TitleBar />)
  expect(screen.queryByRole('button', { name: /console/i })).not.toBeInTheDocument()
})

test('affiche la console seulement si demandé', () => {
  render(<TitleBar showConsole />)
  expect(screen.getByRole('button', { name: /console/i })).toBeInTheDocument()
})

// Ordre relevé dans le mockup A4 (l. 349-351) : la console précède les préférences.
test('place la console avant les préférences', () => {
  render(<TitleBar showConsole />)
  const actions = screen.getAllByRole('button')
  expect(actions[0]).toHaveAccessibleName(/console/i)
  expect(actions[1]).toHaveAccessibleName(/préférences/i)
})
