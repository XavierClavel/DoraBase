import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { TitleBar } from './TitleBar'

function monter(props: Parameters<typeof TitleBar>[0] = {}) {
  return render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <TitleBar {...props} />
    </LanguageProvider>,
  )
}

test('porte la zone de glissement de la fenêtre', () => {
  const { container } = monter()
  expect(container.firstElementChild).toHaveAttribute('data-tauri-drag-region')
})

test('affiche le wordmark et l’accès aux préférences', () => {
  monter()
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /préférences/i })).toBeInTheDocument()
})

test('n’a pas d’accès à la console', () => {
  monter()
  expect(screen.queryByRole('button', { name: /console/i })).not.toBeInTheDocument()
})

// **Une seule action dans la barre**, l'engrenage. Le bouton de console est parti le 26 août 2026 :
// il n'avait pas d'`onClick`, donc il se lisait comme une panne (défaut n° 36).
test('n’a qu’une action, les préférences', () => {
  monter()
  const actions = screen.getAllByRole('button')
  expect(actions).toHaveLength(1)
  expect(actions[0]).toHaveAccessibleName(/préférences/i)
})
