import { render, screen } from '@testing-library/react'
import { ConsoleFooterButton } from '../ConsoleFooterButton/ConsoleFooterButton'
import { SidebarFilterBar } from '../SidebarFilterBar/SidebarFilterBar'
import { Sidebar } from './Sidebar'

test('assemble filtre, contenu et pied', () => {
  render(
    <Sidebar
      filter={<SidebarFilterBar value="" onChange={vi.fn()} />}
      footer={<ConsoleFooterButton onClick={vi.fn()} />}
    >
      <div>contenu de l'arbre</div>
    </Sidebar>,
  )
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  expect(screen.getByText("contenu de l'arbre")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /nouvelle console/i })).toBeInTheDocument()
})

// Le pied n'existe que sur les sidebars de console (A7, A8) : A5, A6 et A9 n'en ont pas.
test('le pied est optionnel', () => {
  render(<Sidebar filter={<SidebarFilterBar value="" onChange={vi.fn()} />}>{null}</Sidebar>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

// L'ordre visuel doit suivre l'ordre du DOM : filtre en haut, contenu au milieu, pied en
// bas. C'est aussi l'ordre du parcours clavier.
test('rend le filtre avant le contenu, et le contenu avant le pied', () => {
  const { container } = render(
    <Sidebar
      filter={<SidebarFilterBar value="" onChange={vi.fn()} />}
      footer={<ConsoleFooterButton onClick={vi.fn()} />}
    >
      <div data-testid="corps" />
    </Sidebar>,
  )
  const champ = container.querySelector('input')
  const corps = screen.getByTestId('corps')
  const bouton = screen.getByRole('button', { name: /nouvelle console/i })
  expect(champ?.compareDocumentPosition(corps)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(corps.compareDocumentPosition(bouton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})
