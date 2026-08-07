import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CollapsiblePanel } from './CollapsiblePanel'

function Piloté({ initial = true }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <CollapsiblePanel title="Proxy / tunnel" icon="shield" open={open} onOpenChange={setOpen}>
      <input aria-label="Hôte du bastion" />
    </CollapsiblePanel>
  )
}

test('l’en-tête annonce son état déplié', () => {
  render(<Piloté />)
  expect(screen.getByRole('button', { name: /Proxy/ })).toHaveAttribute('aria-expanded', 'true')
})

test('un clic replie, un second déplie', async () => {
  render(<Piloté />)
  const entete = screen.getByRole('button', { name: /Proxy/ })
  await userEvent.click(entete)
  expect(entete).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(entete)
  expect(entete).toHaveAttribute('aria-expanded', 'true')
})

// L'exigence de `08a` : replié, le contenu n'est pas seulement invisible, il n'est plus là.
// Un `display:none` suffirait pour l'accessibilité, mais le retrait du DOM le garantit
// aussi pour le piège de focus de `Modal`, qui compte les focalisables présents.
test('replié, le contenu sort du DOM', async () => {
  render(<Piloté />)
  expect(screen.getByLabelText('Hôte du bastion')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Proxy/ }))
  expect(screen.queryByLabelText('Hôte du bastion')).not.toBeInTheDocument()
})

test('replié, le contenu n’est plus dans l’ordre de tabulation', async () => {
  render(<Piloté initial={false} />)
  await userEvent.tab()
  await userEvent.tab()
  // Seul l'en-tête est focalisable : la seconde tabulation sort du panneau.
  expect(screen.getByRole('button', { name: /Proxy/ })).not.toHaveFocus()
})

test('l’en-tête pilote le contenu qu’il désigne', () => {
  render(<Piloté />)
  const entete = screen.getByRole('button', { name: /Proxy/ })
  const cible = entete.getAttribute('aria-controls')
  expect(cible).toBeTruthy()
  expect(document.getElementById(cible as string)).toBeInTheDocument()
})

test('le badge est rendu quand il est fourni', () => {
  render(
    <CollapsiblePanel title="Proxy" open badge={<span>SSH activé</span>} onOpenChange={() => {}}>
      <p>corps</p>
    </CollapsiblePanel>,
  )
  expect(screen.getByText('SSH activé')).toBeInTheDocument()
})

test('l’en-tête se pilote au clavier', async () => {
  render(<Piloté />)
  await userEvent.tab()
  const entete = screen.getByRole('button', { name: /Proxy/ })
  expect(entete).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(entete).toHaveAttribute('aria-expanded', 'false')
})
