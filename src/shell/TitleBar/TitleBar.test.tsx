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
