import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnRow } from './ColumnRow'

test('affiche le glyphe lettre, le libellé et la métadonnée', () => {
  render(<ColumnRow label="status" typeGlyph="T" meta="filtré" metaActive />)
  expect(screen.getByText('T')).toBeInTheDocument()
  expect(screen.getByText('status')).toBeInTheDocument()
  expect(screen.getByText('filtré')).toBeInTheDocument()
})

test('affiche une icône de type à la place du glyphe lettre', () => {
  const { container } = render(
    <ColumnRow label="id" typeIcon="key" typeIconColor="var(--gold)" meta="int8" />,
  )
  expect(container.querySelector('[data-glyph]')).toBeNull()
  expect(container.querySelector('svg')).not.toBeNull()
})

// La métadonnée passe en accent quand la colonne est filtrée ou triée (« filtré »,
// « tri ↓ » dans le mockup) : c'est la seule différence avec l'état au repos.
test('la métadonnée active ne porte pas la même classe qu’au repos', () => {
  const { container: repos } = render(<ColumnRow label="a" meta="int8" />)
  const { container: active } = render(<ColumnRow label="b" meta="filtré" metaActive />)
  const classeRepos = repos.querySelector('[data-meta]')?.className ?? ''
  const classeActive = active.querySelector('[data-meta]')?.className ?? ''
  expect(classeRepos).not.toBe(classeActive)
})

// La ligne de résumé (« + 11 autres ») n'a ni glyphe ni icône, et son encre est plus
// atténuée : elle n'est pas une colonne, elle compte celles qui ne sont pas listées.
test('la ligne de résumé n’a ni glyphe ni icône', () => {
  const { container } = render(<ColumnRow label="+ 11 autres" summary />)
  expect(screen.getByText('+ 11 autres')).toBeInTheDocument()
  expect(container.querySelector('[data-glyph]')).toBeNull()
  expect(container.querySelector('svg')).toBeNull()
  expect(container.firstElementChild?.className).toMatch(/summary/)
})

test('une ligne cliquable est un bouton activable au clavier', async () => {
  const onClick = vi.fn()
  render(<ColumnRow label="status" typeGlyph="T" onClick={onClick} />)
  const bouton = screen.getByRole('button', { name: /status/i })
  bouton.focus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

test("une ligne sans onClick n'est pas un bouton", () => {
  render(<ColumnRow label="status" typeGlyph="T" />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

// Le glyphe occupe une largeur fixe de 11 px même vide, pour que les libellés de toutes
// les lignes restent alignés — y compris sur la ligne de résumé.
test('le glyphe et son emplacement vide occupent la même largeur', () => {
  const { container: avec } = render(<ColumnRow label="a" typeGlyph="T" />)
  const { container: sans } = render(<ColumnRow label="+ 11 autres" summary />)
  const glyphe = avec.querySelector('[data-glyph]')
  const vide = sans.querySelector('[data-glyph-slot]')
  expect(glyphe).not.toBeNull()
  expect(vide).not.toBeNull()
})
