import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

test('l’infobulle est absente au repos', () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button">Ouvrir les données</button>
    </Tooltip>,
  )
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

test('le survol la fait apparaître', async () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button">Ouvrir les données</button>
    </Tooltip>,
  )
  await userEvent.hover(screen.getByRole('button'))
  expect(screen.getByRole('tooltip')).toHaveTextContent('viendra avec A5')
})

// **Au focus clavier aussi** : une infobulle qui n'apparaît qu'au survol est invisible à qui
// navigue au clavier, et c'est précisément le public qui a le plus besoin de l'explication.
test('le focus clavier la fait apparaître', async () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button">Ouvrir les données</button>
    </Tooltip>,
  )
  await userEvent.tab()
  expect(screen.getByRole('tooltip')).toBeInTheDocument()
})

test('elle disparaît quand le focus s’en va', async () => {
  render(
    <>
      <Tooltip label="viendra avec A5">
        <button type="button">Ouvrir les données</button>
      </Tooltip>
      <button type="button">ailleurs</button>
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('tooltip')).toBeInTheDocument()
  await userEvent.tab()
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
})

// **`aria-describedby` et non `aria-label`.** L'infobulle *décrit* le contrôle, elle ne le
// *nomme* pas : un `aria-label` ferait s'annoncer le bouton par sa limite plutôt que par sa
// fonction.
test('elle décrit le déclencheur sans le renommer', async () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button">Ouvrir les données</button>
    </Tooltip>,
  )
  await userEvent.tab()
  const bouton = screen.getByRole('button', { name: 'Ouvrir les données' })
  expect(bouton).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
})

test('la description est retirée quand l’infobulle disparaît', async () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button">Ouvrir</button>
    </Tooltip>,
  )
  expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby')
})

// **Un `<button disabled>` ne reçoit ni survol ni focus** dans la plupart des navigateurs :
// l'infobulle serait inatteignable là où elle est le plus utile. D'où l'enveloppe qui porte le
// survol, et `aria-disabled` plutôt que `disabled` sur le bouton.
test('un déclencheur indisponible garde son infobulle au clavier', async () => {
  render(
    <Tooltip label="viendra avec A5">
      <button type="button" aria-disabled="true">
        Ouvrir les données
      </button>
    </Tooltip>,
  )
  await userEvent.tab()
  expect(screen.getByRole('button')).toHaveFocus()
  expect(screen.getByRole('tooltip')).toBeInTheDocument()
})
