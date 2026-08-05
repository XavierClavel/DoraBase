import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarFilterBar } from './SidebarFilterBar'

test('affiche le compteur de correspondances', () => {
  render(<SidebarFilterBar value="order" onChange={vi.fn()} matchCount={2} totalCount={8} />)
  expect(screen.getByText('2/8')).toBeInTheDocument()
})

test('remonte la saisie', async () => {
  const onChange = vi.fn()
  render(<SidebarFilterBar value="" onChange={onChange} placeholder="Filtrer l'arborescence…" />)
  await userEvent.type(screen.getByRole('textbox'), 'x')
  expect(onChange).toHaveBeenCalledWith('x')
})

test('le champ porte un nom accessible même sans étiquette visible', () => {
  render(<SidebarFilterBar value="" onChange={vi.fn()} />)
  expect(screen.getByRole('textbox', { name: /filtrer/i })).toBeInTheDocument()
})

// Le compteur est optionnel : la barre de filtre de A4 n'en a pas.
test('sans compteur, rien ne s’affiche à droite', () => {
  render(<SidebarFilterBar value="" onChange={vi.fn()} />)
  expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument()
})

test('un compteur à zéro correspondance reste affiché', () => {
  render(<SidebarFilterBar value="zzz" onChange={vi.fn()} matchCount={0} totalCount={8} />)
  expect(screen.getByText('0/8')).toBeInTheDocument()
})
