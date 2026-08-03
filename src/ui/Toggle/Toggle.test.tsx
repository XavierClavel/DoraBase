import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Toggle } from './Toggle'

function Piloté({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial)
  return <Toggle checked={on} onCheckedChange={setOn} label="Ouvrir en lecture seule" />
}

test('s’annonce comme un interrupteur, avec son état', () => {
  render(<Toggle checked onCheckedChange={() => {}} label="Ouvrir en lecture seule" />)
  const sw = screen.getByRole('switch', { name: 'Ouvrir en lecture seule' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
})

test('l’état annoncé suit la valeur', () => {
  render(<Toggle checked={false} onCheckedChange={() => {}} label="Se reconnecter" />)
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
})

// Espace est le raccourci attendu d'un interrupteur. Il fonctionne nativement sur un
// `<button>` — ce test garantit qu'on ne le perdra pas en changeant d'élément support.
test('se pilote au clavier par Espace', async () => {
  render(<Piloté />)
  const sw = screen.getByRole('switch')
  await userEvent.tab()
  expect(sw).toHaveFocus()
  await userEvent.keyboard(' ')
  expect(sw).toHaveAttribute('aria-checked', 'true')
})

test('le clic bascule dans les deux sens', async () => {
  render(<Piloté initial />)
  const sw = screen.getByRole('switch')
  await userEvent.click(sw)
  expect(sw).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(sw)
  expect(sw).toHaveAttribute('aria-checked', 'true')
})

test('désactivé, ne bascule pas', async () => {
  const onCheckedChange = vi.fn()
  render(
    <Toggle checked={false} onCheckedChange={onCheckedChange} label="Garder le patch" disabled />,
  )
  await userEvent.click(screen.getByRole('switch'))
  expect(onCheckedChange).not.toHaveBeenCalled()
})
