import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import { SidebarToolbar, SidebarToolbarButton } from './SidebarToolbar'

function monter(props: Partial<Parameters<typeof SidebarToolbarButton>[0]> = {}) {
  return render(
    <>
      <Sprite />
      <SidebarToolbar>
        <SidebarToolbarButton icon="bag" label="Nouveau projet" {...props} />
      </SidebarToolbar>
    </>,
  )
}

test('la bande s’annonce comme un groupe de contrôles', () => {
  monter()
  // `role="toolbar"` plutôt qu'un `<div>` nu : c'est ce qui fait annoncer « barre d'outils, 1 élément »
  // au lieu d'un bouton isolé au milieu de rien.
  expect(screen.getByRole('toolbar', { name: 'Actions de l’arborescence' })).toBeInTheDocument()
})

test('une action sans libellé visible porte quand même son nom', () => {
  monter()
  // **Le nom accessible est obligatoire dans le type**, et c'est le remède au premier des quatre
  // pièges d'accessibilité de ce projet : une icône seule n'a rien qui la nomme, et un `aria-label`
  // optionnel finit par manquer.
  expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument()
})

test('l’infobulle porte le raccourci, le nom ne le porte pas', () => {
  monter({ title: 'Nouveau projet (⌘N)' })
  const bouton = screen.getByRole('button', { name: 'Nouveau projet' })
  // Une infobulle *décrit*, elle ne *nomme* pas : le nom annoncé reste la fonction, jamais le
  // raccourci — sinon la voix lit « Nouveau projet commande N ».
  expect(bouton).toHaveAttribute('title', 'Nouveau projet (⌘N)')
})

test('le clic appelle l’action', async () => {
  const clic = vi.fn()
  monter({ onClick: clic })
  await userEvent.click(screen.getByRole('button', { name: 'Nouveau projet' }))
  expect(clic).toHaveBeenCalledOnce()
})
