import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
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
      {/* `onOpenPreferences` est fourni : sans lui l'engrenage est **désactivé avec sa raison**
          depuis `15a`, donc hors du parcours de tabulation — ce qui est correct, et ce que le test
          suivant vérifie. */}
      <TitleBar
        showConsole
        center={<ProjectPill projectName="Atelier Nord" />}
        onOpenPreferences={() => {}}
      />
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('button', { name: /Atelier Nord/ })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Console' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Préférences' })).toHaveFocus()
})

test('sans gestionnaire, l’engrenage est désactivé et dit pourquoi', () => {
  render(
    <>
      <Sprite />
      <TitleBar />
    </>,
  )
  // La règle de `09f`, et la leçon du défaut n° 36 : un bouton cliquable et inerte se lit comme une
  // panne. Il est donc désactivé, avec l'infobulle qui dit où l'écran se trouve.
  const engrenage = screen.getByRole('button', { name: 'Préférences' })
  expect(engrenage).toBeDisabled()
  expect(engrenage).toHaveAttribute('title', expect.stringContaining('écran de travail'))
})

test('avec un gestionnaire, l’engrenage l’appelle', async () => {
  const ouvrir = vi.fn()
  render(
    <>
      <Sprite />
      <TitleBar onOpenPreferences={ouvrir} />
    </>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Préférences' }))
  expect(ouvrir).toHaveBeenCalledTimes(1)
})
