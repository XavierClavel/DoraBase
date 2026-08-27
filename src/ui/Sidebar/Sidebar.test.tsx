import { render, screen } from '@testing-library/react'
import { SidebarFilterBar } from '../SidebarFilterBar/SidebarFilterBar'
import { SidebarToolbar, SidebarToolbarButton } from '../SidebarToolbar/SidebarToolbar'
import { Sidebar } from './Sidebar'

test('assemble la bande, le filtre et le contenu', () => {
  render(
    <Sidebar
      toolbar={
        <SidebarToolbar>
          <SidebarToolbarButton icon="plus" label="Nouveau projet" onClick={vi.fn()} />
        </SidebarToolbar>
      }
      filter={<SidebarFilterBar value="" onChange={vi.fn()} />}
    >
      <div>contenu de l'arbre</div>
    </Sidebar>,
  )
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  expect(screen.getByText("contenu de l'arbre")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument()
})

// **Le pied a disparu le 26 août 2026**, et la bande qui le remplace est optionnelle pour la même
// raison qu'il l'était : une sidebar sans action de structure à offrir n'en rend pas.
test('la bande est optionnelle', () => {
  render(<Sidebar filter={<SidebarFilterBar value="" onChange={vi.fn()} />}>{null}</Sidebar>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})

// L'ordre visuel doit suivre l'ordre du DOM : bande en haut, puis filtre, puis contenu. C'est aussi
// l'ordre du parcours clavier — et c'est ce qui justifie que la bande soit **au-dessus** du filtre :
// on agit sur le panneau avant de filtrer sa liste.
test('rend la bande avant le filtre, et le filtre avant le contenu', () => {
  const { container } = render(
    <Sidebar
      toolbar={
        <SidebarToolbar>
          <SidebarToolbarButton icon="plus" label="Nouveau projet" onClick={vi.fn()} />
        </SidebarToolbar>
      }
      filter={<SidebarFilterBar value="" onChange={vi.fn()} />}
    >
      <div data-testid="corps" />
    </Sidebar>,
  )
  const bouton = screen.getByRole('button', { name: 'Nouveau projet' })
  const champ = container.querySelector('input')
  const corps = screen.getByTestId('corps')
  expect(bouton.compareDocumentPosition(champ as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(champ?.compareDocumentPosition(corps)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})
