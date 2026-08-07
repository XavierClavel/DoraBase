import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Select } from './Select'

const MODES = [
  { value: 'disable', label: 'disable' },
  { value: 'prefer', label: 'prefer' },
  { value: 'require', label: 'require' },
] as const

function Piloté() {
  const [mode, setMode] = useState<'disable' | 'prefer' | 'require'>('prefer')
  return <Select label="Mode SSL" options={MODES} value={mode} onValueChange={setMode} />
}

test('l’étiquette nomme le champ', () => {
  render(<Piloté />)
  expect(screen.getByRole('combobox', { name: 'Mode SSL' })).toBeInTheDocument()
})

test('la valeur courante est celle affichée', () => {
  render(<Piloté />)
  expect(screen.getByRole('combobox')).toHaveValue('prefer')
})

test('choisir une option remonte sa valeur', async () => {
  render(<Piloté />)
  await userEvent.selectOptions(screen.getByRole('combobox'), 'require')
  expect(screen.getByRole('combobox')).toHaveValue('require')
})

test('toutes les options fournies sont rendues, dans l’ordre', () => {
  render(<Piloté />)
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'disable',
    'prefer',
    'require',
  ])
})

// Le natif apporte le clavier gratuitement — ce test garantit qu'on ne le perdra pas en
// passant à une liste maison sans y penser.
test('se pilote au clavier', async () => {
  render(<Piloté />)
  await userEvent.tab()
  expect(screen.getByRole('combobox')).toHaveFocus()
})

test('désactivé, il ne se pilote plus', async () => {
  render(<Select label="Type" options={MODES} value="prefer" onValueChange={() => {}} disabled />)
  const select = screen.getByRole('combobox')
  expect(select).toBeDisabled()
  await userEvent.tab()
  expect(select).not.toHaveFocus()
})
