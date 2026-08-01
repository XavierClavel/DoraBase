import { render, screen } from '@testing-library/react'
import { App } from './App'

test('rend le nom de l’application', () => {
  render(<App />)
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
})
