import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarFooter, SidebarFooterButton, SidebarFooterRow } from './SidebarFooter'

test('est un vrai bouton qui déclenche onClick', async () => {
  const onClick = vi.fn()
  render(
    <SidebarFooter>
      <SidebarFooterButton icon="plus" onClick={onClick}>
        Connexion
      </SidebarFooterButton>
    </SidebarFooter>,
  )
  await userEvent.click(screen.getByRole('button', { name: /connexion/i }))
  expect(onClick).toHaveBeenCalledOnce()
})

test('est activable au clavier', async () => {
  const onClick = vi.fn()
  render(
    <SidebarFooter>
      <SidebarFooterButton icon="plus" onClick={onClick}>
        Connexion
      </SidebarFooterButton>
    </SidebarFooter>,
  )
  const bouton = screen.getByRole('button', { name: /connexion/i })
  bouton.focus()
  expect(bouton).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

// Le « + » est une icône, pas un caractère du libellé : l'inclure dans le texte le ferait
// annoncer « plus Connexion » par un lecteur d'écran.
test('le nom accessible ne contient pas le signe plus', () => {
  render(
    <SidebarFooter>
      <SidebarFooterButton icon="plus" onClick={vi.fn()}>
        Connexion
      </SidebarFooterButton>
    </SidebarFooter>,
  )
  expect(screen.getByRole('button').textContent).toBe('Connexion')
})

/**
 * **Le nom accessible reste entier quand le libellé visible est court.**
 *
 * C'est toute la parade du défaut n° 102 : à 180 px de sidebar, « Ajouter une connexion » ne tient
 * pas, donc le bouton affiche « Connexion » — mais ce que la voix annonce ne doit pas rétrécir avec
 * la colonne.
 */
test('l’aria-label prime sur le libellé court', () => {
  render(
    <SidebarFooter>
      <SidebarFooterRow>
        <SidebarFooterButton
          icon="plus"
          aria-label="Ajouter une connexion"
          title="Ajouter une connexion (⇧⌘N)"
          onClick={vi.fn()}
        >
          Connexion
        </SidebarFooterButton>
      </SidebarFooterRow>
    </SidebarFooter>,
  )
  expect(screen.getByRole('button', { name: 'Ajouter une connexion' })).toHaveAttribute(
    'title',
    'Ajouter une connexion (⇧⌘N)',
  )
})
