import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { ProjectPill } from '../ProjectPill/ProjectPill'
import { TitleBar } from './TitleBar'

// Le centre est passé en **contenu** plutôt qu'en propriétés : `A1` n'en a aucun, `A4` en a deux,
// et les écrans suivants ajouteront un fil d'Ariane plus long. Une liste de propriétés grandirait
// à chaque écran là où un contenu s'assemble chez l'appelant.
test('sans centre, la barre reste celle de A1', () => {
  render(
    <>
      <Sprite />
      <TitleBar />
    </>,
  )
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Atelier/ })).not.toBeInTheDocument()
})

test('avec un centre, la pastille projet y est rendue', () => {
  render(
    <>
      <Sprite />
      <TitleBar center={<ProjectPill projectName="Atelier Nord" />} />
    </>,
  )
  expect(screen.getByRole('button', { name: /Atelier Nord/ })).toBeInTheDocument()
})

// L'ordre du parcours clavier : le centre vient avant les actions de droite, comme il vient
// avant elles dans la barre.
test('le parcours clavier va du centre vers les actions', async () => {
  render(
    <>
      <Sprite />
      <TitleBar showConsole center={<ProjectPill projectName="Atelier Nord" />} />
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('button', { name: /Atelier Nord/ })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Console' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Préférences' })).toHaveFocus()
})
