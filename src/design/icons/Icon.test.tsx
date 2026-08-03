import { render } from '@testing-library/react'
import { Icon } from './Icon'
import { Sprite } from './Sprite'

test('rend un use vers le symbole préfixé', () => {
  const { container } = render(<Icon name="plus" size={14} />)
  expect(container.querySelector('use')?.getAttribute('href')).toBe('#i-plus')
})

test('applique les attributs de trait du handoff', () => {
  const { container } = render(<Icon name="plus" strokeWidth={2.2} />)
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('fill', 'none')
  expect(svg).toHaveAttribute('stroke', 'currentColor')
  expect(svg).toHaveAttribute('stroke-width', '2.2')
  expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
})

test('est décorative par défaut : masquée aux lecteurs d’écran', () => {
  const { container } = render(<Icon name="plus" />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('Sprite ne rend le contenu qu’une seule fois même monté deux fois', () => {
  const { container } = render(
    <div>
      <Sprite />
      <Sprite />
    </div>,
  )
  expect(container.querySelectorAll('symbol#i-plus')).toHaveLength(1)
})
