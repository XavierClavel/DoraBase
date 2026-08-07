import { render, screen } from '@testing-library/react'
import { StatTile } from './StatTile'

test('l’intitulé et la valeur sont rendus', () => {
  render(<StatTile label="Lignes" value="1.9 M" />)
  expect(screen.getByText('Lignes')).toBeInTheDocument()
  expect(screen.getByText('1.9 M')).toBeInTheDocument()
})

// Le compte de lignes de `A4` est une estimation (`reltuples`), la taille est exacte. Les
// présenter à l'identique est un mensonge de précision, que le handoff commet.
test('une valeur exacte ne porte aucune mention', () => {
  const { container } = render(<StatTile label="Taille" value="2.1 GB" />)
  expect(container.querySelector('[title]')).toBeNull()
  expect(screen.queryByText('*')).not.toBeInTheDocument()
})

test('une valeur estimée le dit dans son title', () => {
  render(<StatTile label="Lignes" value="1.9 M" approximate />)
  const tuile = screen.getByTitle(/estimation du catalogue/)
  expect(tuile).toBeInTheDocument()
  expect(tuile).toHaveTextContent('1.9 M')
})

// L'astérisque est visible mais hors du nom accessible : l'information passe par le `title`,
// et un astérisque lu à voix haute n'apprendrait rien.
test('l’astérisque est décoratif', () => {
  render(<StatTile label="Lignes" value="1.9 M" approximate />)
  const etoile = screen.getByText('*')
  expect(etoile).toHaveAttribute('aria-hidden', 'true')
})

test('la valeur n’est pas formatée par la tuile', () => {
  // Le formatage appartient à `format.ts` : une tuile qui abrégerait elle-même empêcherait
  // d'afficher une valeur brute là où c'est voulu.
  render(<StatTile label="Lignes" value="1900000" />)
  expect(screen.getByText('1900000')).toBeInTheDocument()
})
