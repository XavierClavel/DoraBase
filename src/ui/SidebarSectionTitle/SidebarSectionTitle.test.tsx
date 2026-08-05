import { render, screen } from '@testing-library/react'
import { SidebarSectionTitle } from './SidebarSectionTitle'

test('rend le titre de section', () => {
  render(<SidebarSectionTitle>Colonnes de orders</SidebarSectionTitle>)
  expect(screen.getByText('Colonnes de orders')).toBeInTheDocument()
})

// Le mockup écrit « Colonnes de orders » en minuscules dans le HTML et laisse
// `text-transform` faire les capitales : le texte accessible reste donc en casse
// naturelle, ce qu'un lecteur d'écran annonce correctement.
test('la mise en capitales reste une affaire de CSS, pas de contenu', () => {
  render(<SidebarSectionTitle>Colonnes de orders</SidebarSectionTitle>)
  expect(screen.getByText('Colonnes de orders').textContent).toBe('Colonnes de orders')
})
