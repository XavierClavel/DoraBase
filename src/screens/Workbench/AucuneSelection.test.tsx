import { render, screen } from '@testing-library/react'
import { AucuneSelection } from './AucuneSelection'

test('dit quoi faire, et rien d’autre', () => {
  const { container } = render(<AucuneSelection />)
  expect(screen.getByText('Sélectionner une entité pour commencer')).toBeInTheDocument()
  // Aucun geste : ce qui se clique est dans l'arbre, à côté. Un bouton ici dupliquerait « Nouveau
  // projet » du pied de la sidebar.
  expect(container.querySelectorAll('button')).toHaveLength(0)
})

test('le logo est décoratif : il ne se lit pas à la voix', () => {
  const { container } = render(<AucuneSelection />)
  const logo = container.querySelector('svg')
  expect(logo).toHaveAttribute('aria-hidden', 'true')
  expect(logo?.querySelector('use')).toHaveAttribute('href', '#logo')
})

test('la variante colonne n’écrit pas la phrase une seconde fois', () => {
  render(<AucuneSelection variante="colonne" />)
  // Deux fois la même instruction pour un seul geste, et un lecteur d'écran les lirait toutes les
  // deux : le centre la porte, la colonne se contente du décor.
  expect(screen.queryByText('Sélectionner une entité pour commencer')).not.toBeInTheDocument()
})
