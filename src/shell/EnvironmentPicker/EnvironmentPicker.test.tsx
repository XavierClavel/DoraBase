import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { Environment } from '../../domain/config'
import { ENVIRONMENT_ORDER } from '../../screens/NewConnection/environments'
import { choisirDansLaListe, optionsDeLaListe } from '../../ui/Select/pourLesTests'
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

// « ENV » nomme le sélecteur : sans lui, il s'annoncerait sans nom. Par `aria-labelledby` depuis que
// le champ n'est plus un contrôle natif — un `<label for>` ne l'atteindrait pas.
test('le sélecteur est nommé par son étiquette', () => {
  render(<Piloté />)
  expect(screen.getByRole('combobox', { name: 'env' })).toBeInTheDocument()
})

test('les trois environnements du modèle sont proposés', async () => {
  render(<Piloté />)
  // Les options n'existent que la liste ouverte : c'est ce que fait `optionsDeLaListe`.
  expect(await optionsDeLaListe('env')).toEqual([...ENVIRONMENT_ORDER])
})

test('changer d’environnement remonte la valeur', async () => {
  render(<Piloté />)
  await choisirDansLaListe('env', 'prod')
  // Le champ affiche le libellé choisi : il n'a plus de `value`, n'étant plus un `<select>`.
  expect(screen.getByRole('combobox')).toHaveTextContent('prod')
})

// La couleur du point suit l'environnement, et le rouge de `prod` est celui de son bouton dans
// `A2` : un environnement de production doit se reconnaître d'un écran à l'autre.
test('le point porte l’environnement dans un attribut', async () => {
  const { container } = render(<Piloté />)
  expect(container.querySelector('[data-environment="dev"]')).not.toBeNull()
  await choisirDansLaListe('env', 'prod')
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
