import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { TableDetail } from '../../domain/engine'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { StructureStatusBar } from '../../screens/Structure/StructureView'
import { TableStatusBar } from '../../screens/TableView/TableStatusBar'
import { StatusBar } from '../StatusBar/StatusBar'

/*
 * **Le défaut que ce fichier garde** : l'annonce de mise à jour n'était montée que dans
 * `shell/StatusBar`, et cette barre n'est rendue que par `WelcomeScreen`. Dès qu'un onglet était
 * ouvert — donc pendant toute une session de travail — la bande du bas était `TableStatusBar` ou
 * `StructureStatusBar`, et l'annonce n'existait nulle part. Rapporté à l'écran le 26 août 2026,
 * après la publication de 0.2.1 : « je ne vois pas de barre d'état affichant la dispo ».
 *
 * **Pourquoi un fichier à part, et un double.** `MiseAJour` ne rend rien quand la recherche est
 * rejetée, ce qui est le cas de tous les tests, de la galerie et de Playwright : sans double, il
 * n'y aurait rien à observer et le test serait vert quel que soit le câblage. Et le double est
 * scopé ici plutôt que dans les fichiers de chaque barre, où il ajouterait du texte aux assertions
 * de contenu des autres tests.
 *
 * Ce qui est mesuré est le **montage**, pas le composant : celui-ci a ses huit tests à côté.
 */
vi.mock('./MiseAJour', () => ({
  MiseAJour: () => <span>0.9.9 disponible</span>,
}))

const DETAIL: TableDetail = {
  schema: 'public',
  name: 'orders',
  rows: { kind: 'exact', value: 12 },
  sizeBytes: null,
  comment: null,
  columns: [],
  indexes: [],
  constraints: [],
  triggers: [],
  relations: [],
  ddl: 'create table public.orders ()',
}

test("la barre d'état de l'accueil porte l'annonce", () => {
  render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <StatusBar projectCount={2} />
    </LanguageProvider>,
  )
  expect(screen.getByText('0.9.9 disponible')).toBeInTheDocument()
})

test("la barre d'état d'une table porte l'annonce", () => {
  render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <Sprite />
      <TableStatusBar fenetre={null} loading={false} error={null} />
    </LanguageProvider>,
  )
  const barre = screen.getByRole('status', { name: 'État de la table' })
  expect(barre).toHaveTextContent('0.9.9 disponible')
})

// **Le mode édition est une seconde sortie de la même fonction**, et une sortie oubliée est
// exactement le défaut qu'on corrige : la barre en attente de modifications rend un autre bloc.
test("la barre d'une table en édition porte l'annonce aussi", () => {
  render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <Sprite />
      <TableStatusBar fenetre={null} loading={false} error={null} pendingChanges={3} />
    </LanguageProvider>,
  )
  const barre = screen.getByRole('status', { name: 'État de la table' })
  expect(barre).toHaveTextContent('3 modifications en attente')
  expect(barre).toHaveTextContent('0.9.9 disponible')
})

test("la barre d'état d'une structure porte l'annonce", () => {
  render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <StructureStatusBar detail={DETAIL} />
    </LanguageProvider>,
  )
  const barre = screen.getByRole('status', { name: 'État de la structure' })
  expect(barre).toHaveTextContent('0.9.9 disponible')
})
