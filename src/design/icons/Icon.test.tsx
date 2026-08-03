import { render } from '@testing-library/react'
import { StrictMode } from 'react'
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

test('sous StrictMode, le sprite est présent dans le DOM', () => {
  const { container } = render(
    <StrictMode>
      <Sprite />
    </StrictMode>,
  )
  expect(container.querySelector('symbol#i-plus')).not.toBeNull()
})
