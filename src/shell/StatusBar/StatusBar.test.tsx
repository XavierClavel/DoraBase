import { render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar'

test('accorde le compteur de projets', () => {
  render(<StatusBar projectCount={0} />)
  expect(screen.getByText('0 projet')).toBeInTheDocument()
})

test('met le compteur au pluriel au-delà de un', () => {
  render(<StatusBar projectCount={3} />)
  expect(screen.getByText('3 projets')).toBeInTheDocument()
})

// La version est une donnée, et le handoff impose de remplacer les données fictives —
// le mockup affiche « DoraBase 0.4.2 », ce n'est jamais la vraie version.
test('affiche la version réelle, pas celle de la maquette', () => {
  render(<StatusBar projectCount={0} />)
  expect(screen.getByText(/^DoraBase \d+\.\d+\.\d+$/)).toBeInTheDocument()
  expect(screen.queryByText('DoraBase 0.4.2')).not.toBeInTheDocument()
})

test('affiche le rappel de palette de commandes', () => {
  render(<StatusBar projectCount={0} />)
  expect(screen.getByText('⌘K palette')).toBeInTheDocument()
})
