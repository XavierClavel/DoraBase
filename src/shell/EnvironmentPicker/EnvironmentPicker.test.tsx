import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { Environment } from '../../domain/config'
import { ENVIRONMENT_ORDER } from '../../screens/NewConnection/environments'
import { EnvironmentPicker } from './EnvironmentPicker'

function Piloté({ initial = 'dev' as Environment }: { initial?: Environment }) {
  const [env, setEnv] = useState<Environment>(initial)
  return (
    <>
      <Sprite />
      <EnvironmentPicker value={env} onValueChange={setEnv} />
    </>
  )
}

// « ENV » est un vrai `<label>` : sans lui, le sélecteur s'annoncerait sans nom.
test('le sélecteur est nommé par son étiquette', () => {
  render(<Piloté />)
  expect(screen.getByRole('combobox', { name: 'env' })).toBeInTheDocument()
})

test('les trois environnements du modèle sont proposés', () => {
  render(<Piloté />)
  const options = screen.getByRole('combobox').querySelectorAll<HTMLOptionElement>('option')
  expect([...options].map((o) => o.value)).toEqual([...ENVIRONMENT_ORDER])
})

test('changer d’environnement remonte la valeur', async () => {
  render(<Piloté />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'prod')
  expect(screen.getByRole('combobox')).toHaveValue('prod')
})

// La couleur du point suit l'environnement, et le rouge de `prod` est celui de son bouton dans
// `A2` : un environnement de production doit se reconnaître d'un écran à l'autre.
test('le point porte l’environnement dans un attribut', async () => {
  const { container } = render(<Piloté />)
  expect(container.querySelector('[data-environment="dev"]')).not.toBeNull()
  await userEvent.selectOptions(screen.getByRole('combobox'), 'prod')
  expect(container.querySelector('[data-environment="prod"]')).not.toBeNull()
})

// Le point est décoratif : l'information est dans la valeur du sélecteur, que le lecteur
// d'écran annonce déjà.
test('le point est masqué à l’accessibilité', () => {
  const { container } = render(<Piloté />)
  expect(container.querySelector('[data-environment]')).toHaveAttribute('aria-hidden', 'true')
})

test('le sélecteur se pilote au clavier', async () => {
  render(<Piloté />)
  await userEvent.tab()
  expect(screen.getByRole('combobox')).toHaveFocus()
})
