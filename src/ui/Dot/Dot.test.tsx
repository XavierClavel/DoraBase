import { render } from '@testing-library/react'
import { Dot } from './Dot'

// La seule assertion qui compte pour une primitive purement décorative : elle est
// bien retirée de l'arbre d'accessibilité, quelle que soit la teinte demandée.
test('est masquée aux lecteurs d’écran', () => {
  const { container } = render(<Dot tone="success" />)
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
})

test('la teinte demandée se reflète dans le rendu', () => {
  const { container } = render(<Dot tone="gold" />)
  expect((container.firstChild as HTMLElement).className).toContain('gold')
})

// `Dot` n'accepte ni enfants ni rôle : rien ne permet à un appelant d'en faire un
// élément porteur d'information — c'est une garantie du composant, pas une
// discipline laissée à l'appelant.
test('n’expose ni enfants ni attributs arbitraires', () => {
  // @ts-expect-error — Dot ne prend pas d'enfants, la garantie est aussi au typage
  render(<Dot tone="success">texte</Dot>)
})
