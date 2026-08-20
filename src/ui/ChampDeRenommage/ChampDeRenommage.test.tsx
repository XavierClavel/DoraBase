import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChampDeRenommage } from './ChampDeRenommage'

function monter(valeurInitiale = 'console 1') {
  const onValider = vi.fn()
  const onAnnuler = vi.fn()
  render(
    <ChampDeRenommage
      valeurInitiale={valeurInitiale}
      onValider={onValider}
      onAnnuler={onAnnuler}
    />,
  )
  return { onValider, onAnnuler, champ: screen.getByLabelText(`Nouveau nom de ${valeurInitiale}`) }
}

test('le texte est présélectionné : un renommage commence par tout remplacer', () => {
  const { champ } = monter()
  expect(champ).toHaveValue('console 1')
  expect((champ as HTMLInputElement).selectionStart).toBe(0)
  expect((champ as HTMLInputElement).selectionEnd).toBe('console 1'.length)
})

test('« Entrée » valide', async () => {
  const { onValider, champ } = monter()
  await userEvent.clear(champ)
  await userEvent.type(champ, 'Audit{Enter}')
  expect(onValider).toHaveBeenCalledWith('Audit')
})

test('« Échap » annule, sans rien envoyer', async () => {
  const { onValider, onAnnuler, champ } = monter()
  await userEvent.type(champ, 'Perdu{Escape}')
  expect(onValider).not.toHaveBeenCalled()
  expect(onAnnuler).toHaveBeenCalledOnce()
})

// **Cliquer ailleurs après avoir tapé veut dire « c'est bon »** : perdre la saisie à ce moment-là
// est la façon la plus sûre d'agacer quelqu'un.
test('la perte de focus valide', async () => {
  const { onValider, champ } = monter()
  await userEvent.clear(champ)
  await userEvent.type(champ, 'Audit')
  await userEvent.tab()
  expect(onValider).toHaveBeenCalledWith('Audit')
})

test('un nom vide ou inchangé annule au lieu de partir', async () => {
  const { onValider, onAnnuler, champ } = monter()
  await userEvent.clear(champ)
  await userEvent.keyboard('{Enter}')
  expect(onValider).not.toHaveBeenCalled()
  expect(onAnnuler).toHaveBeenCalledOnce()

  const second = monter('Audit')
  await userEvent.type(second.champ, '{Enter}')
  expect(second.onValider).not.toHaveBeenCalled()
})

// Les espaces autour du nom sont retirés : « Audit » et « Audit  » désignent la même console, et le
// cœur refuserait un nom qui n'est que du blanc.
test('le nom est nettoyé de ses espaces', async () => {
  const { onValider, champ } = monter()
  await userEvent.clear(champ)
  await userEvent.type(champ, '  Audit  {Enter}')
  expect(onValider).toHaveBeenCalledWith('Audit')
})
