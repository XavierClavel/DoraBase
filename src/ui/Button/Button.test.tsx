import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

test('est un vrai bouton, focalisable et actionnable au clavier', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Nouveau projet</Button>)
  const btn = screen.getByRole('button', { name: /nouveau projet/i })
  await userEvent.tab()
  expect(btn).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

test('rend le raccourci sans polluer le nom accessible', () => {
  render(<Button shortcut="⌘N">Nouveau projet</Button>)
  expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument()
  expect(screen.getByText('⌘N')).toBeInTheDocument()
})

test('désactivé, n’appelle pas onClick', async () => {
  const onClick = vi.fn()
  render(
    <Button disabled onClick={onClick}>
      X
    </Button>,
  )
  await userEvent.click(screen.getByRole('button'))
  expect(onClick).not.toHaveBeenCalled()
})

// Le rendu réel n'est vérifiable ni par rôle ni par nom accessible : la variante et
// la taille sont des choix visuels, donc on vérifie qu'ils atteignent bien le DOM
// plutôt que de les deviner sur la seule confiance du composant.
test('la variante et la taille demandées se reflètent dans le rendu', () => {
  render(
    <Button variant="dark" size="lg">
      Ouvrir
    </Button>,
  )
  const btn = screen.getByRole('button', { name: 'Ouvrir' })
  expect(btn.className).toContain('dark')
  expect(btn.className).toContain('lg')
})

// Le raccourci doit être invisible aux lecteurs d'écran, pas seulement absent du nom
// accessible calculé — un `aria-hidden` manquant sur un élément adjacent au texte
// resterait indétecté par les deux tests précédents s'il n'y avait pas cette assertion.
test('le raccourci est masqué aux lecteurs d’écran', () => {
  render(<Button shortcut="⌘N">Nouveau projet</Button>)
  expect(screen.getByText('⌘N')).toHaveAttribute('aria-hidden', 'true')
})

// Le bouton par défaut ne doit pas soumettre un formulaire englobant : Biome n'a pas
// de règle sur `type`, or un bouton sans `type="button"` explicite soumet par défaut.
test('a pour défaut type="button" pour ne pas soumettre un formulaire englobant', () => {
  render(<Button>Nouveau projet</Button>)
  expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
})
