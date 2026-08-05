import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleFooterButton } from './ConsoleFooterButton'

test('est un vrai bouton qui déclenche onClick', async () => {
  const onClick = vi.fn()
  render(<ConsoleFooterButton onClick={onClick} />)
  await userEvent.click(screen.getByRole('button', { name: /nouvelle console/i }))
  expect(onClick).toHaveBeenCalledOnce()
})

test('est activable au clavier', async () => {
  const onClick = vi.fn()
  render(<ConsoleFooterButton onClick={onClick} />)
  const bouton = screen.getByRole('button', { name: /nouvelle console/i })
  bouton.focus()
  expect(bouton).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

// Le « + » est une icône, pas un caractère du libellé : l'inclure dans le texte le ferait
// annoncer « plus Nouvelle console » par un lecteur d'écran.
test('le nom accessible ne contient pas le signe plus', () => {
  render(<ConsoleFooterButton onClick={vi.fn()} />)
  expect(screen.getByRole('button').textContent).toBe('Nouvelle console')
})
