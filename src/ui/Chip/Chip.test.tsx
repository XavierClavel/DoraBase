import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from './Chip'

// Sans `onClick` ni `onRemove`, rien n'est cliquable : le chip de tri n'est qu'un
// affichage, jamais un bouton.
test('sans interaction, n’est qu’un affichage', () => {
  render(<Chip>created_at desc</Chip>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText('created_at desc').tagName).toBe('SPAN')
})

// Le chip de moteur (sélecteur) est cliquable pour sélectionner : un vrai bouton.
test('avec onClick, devient un vrai bouton actionnable au clavier', async () => {
  const onClick = vi.fn()
  render(<Chip onClick={onClick}>PostgreSQL</Chip>)
  const chip = screen.getByRole('button', { name: 'PostgreSQL' })
  await userEvent.tab()
  expect(chip).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

// La croix de suppression du chip de filtre actif est un vrai bouton avec un nom
// accessible explicite — jamais juste « × », que rien dans Biome ne détecterait.
test('la croix de suppression a un nom accessible et appelle onRemove', async () => {
  const onRemove = vi.fn()
  render(
    <Chip onRemove={onRemove} removeLabel="Retirer le filtre status">
      status = paid
    </Chip>,
  )
  const remove = screen.getByRole('button', { name: 'Retirer le filtre status' })
  await userEvent.click(remove)
  expect(onRemove).toHaveBeenCalledOnce()
})

// Un clic sur la croix ne doit pas remonter à l'action du chip lui-même, quand celui-ci
// est aussi interactif (ex. un chip de moteur qu'on pourrait vouloir retirer d'une
// sélection multiple).
test('le clic sur la croix ne déclenche pas l’action du chip englobant', async () => {
  const onClick = vi.fn()
  const onRemove = vi.fn()
  render(
    <Chip onClick={onClick} onRemove={onRemove} removeLabel="Retirer PostgreSQL">
      PostgreSQL
    </Chip>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Retirer PostgreSQL' }))
  expect(onRemove).toHaveBeenCalledOnce()
  expect(onClick).not.toHaveBeenCalled()
})

test('la variante et la taille demandées se reflètent dans le rendu', () => {
  render(
    <Chip variant="selected" size="lg" onClick={() => {}}>
      PostgreSQL
    </Chip>,
  )
  const chip = screen.getByRole('button', { name: 'PostgreSQL' })
  expect(chip.className).toContain('selected')
  expect(chip.className).toContain('lg')
})
