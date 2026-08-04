import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

// L'assertion qui compte : un badge PROD porte une information critique. Rien dans
// Biome ne détecte un `aria-hidden` posé par erreur sur ce genre d'étiquette — c'est
// le seul garde-fou du projet ici.
test('le texte du badge est lisible par un lecteur d’écran', () => {
  render(<Badge tone="danger">PROD</Badge>)
  const badge = screen.getByText('PROD')
  expect(badge).not.toHaveAttribute('aria-hidden')
  expect(badge).toBeVisible()
})

test('une icône décorative n’ajoute pas de texte au badge', () => {
  render(
    <Badge tone="success" icon={<span aria-hidden="true">🔒</span>}>
      Trousseau
    </Badge>,
  )
  expect(screen.getByText('Trousseau')).toBeInTheDocument()
})

// La teinte et la taille sont des choix visuels sans équivalent par rôle ou nom
// accessible : on vérifie qu'elles atteignent le DOM plutôt que de les deviner.
test('la teinte et la taille demandées se reflètent dans le rendu', () => {
  render(
    <Badge tone="warn" size="sm">
      ÉDITION
    </Badge>,
  )
  const badge = screen.getByText('ÉDITION')
  expect(badge.className).toContain('warn')
  expect(badge.className).toContain('sm')
})

// Un badge n'est pas un contrôle : ni bouton, ni lien, ni rôle interactif.
test('n’est jamais un élément interactif', () => {
  render(<Badge tone="muted">LECTURE SEULE</Badge>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText('LECTURE SEULE').tagName).toBe('SPAN')
})
