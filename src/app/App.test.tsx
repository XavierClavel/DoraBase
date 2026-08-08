import { render, screen, waitFor } from '@testing-library/react'
import { App } from './App'

// **L'app ne rend plus rien synchronement.** Depuis `09b`, elle lit d'abord la configuration :
// afficher `A1` (« aucun projet ») pendant la lecture ferait clignoter l'écran d'accueil devant
// un utilisateur qui en a dix. Le test attend donc que la lecture aboutisse.
//
// Sous Vitest, le pont IPC n'existe pas : `load_config` rejette, et l'app tombe dans l'état
// « injoignable » — qui affiche `A1` faute de mieux, la configuration restant inconnue.
test('rend le nom de l’application une fois la configuration lue', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText('DoraBase')).toBeInTheDocument())
})

test('rien n’est rendu avant que la configuration ait répondu', () => {
  const { container } = render(<App />)
  // Le sprite d'icônes est toujours là ; l'écran, non.
  expect(container.querySelector('[data-tauri-drag-region]')).toBeNull()
})
