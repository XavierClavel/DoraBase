import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { type GridColumn, VirtualGrid } from './VirtualGrid'

type Ligne = { id: number; nom: string }

const lignes = (combien: number): Ligne[] =>
  Array.from({ length: combien }, (_, i) => ({ id: i, nom: `ligne ${i}` }))

const COLONNES: GridColumn<Ligne>[] = [
  { key: 'id', header: 'id', width: 64, numeric: true, cell: (l) => l.id },
  {
    key: 'nom',
    header: 'nom',
    width: 120,
    cell: (l) => l.nom,
    filter: <input aria-label="filtre nom" />,
  },
]

function grille(over: Partial<Parameters<typeof VirtualGrid<Ligne>>[0]> = {}) {
  return render(
    <VirtualGrid
      label="Lignes de public.orders"
      columns={COLONNES}
      rows={lignes(100_000)}
      rowId={(l) => String(l.id)}
      viewportHeight={260}
      {...over}
    />,
  )
}

describe('VirtualGrid', () => {
  it('ne monte que les lignes visibles, plus la marge', () => {
    grille()
    // 260 / 26 = 10 lignes visibles, + 4 de marge de chaque côté (la première est en haut,
    // donc seule la marge basse compte) — et surtout : très loin des 100 000.
    const rendues = screen.getAllByRole('row').length
    expect(rendues).toBeLessThan(30)
    // Le sabotage à faire tomber : monter toutes les lignes.
    expect(rendues).toBeGreaterThan(2)
  })

  it('annonce le total, pas ce qui est monté', () => {
    grille()
    // 100 000 lignes + une ligne d'en-tête.
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', '100001')
  })

  it('donne à chaque ligne son indice réel, en-tête comprise', () => {
    grille({ rows: lignes(5) })
    const lignesRendues = screen.getAllByRole('row')
    // L'en-tête est la ligne 1 ; la première ligne de données est donc la 2.
    expect(lignesRendues[1]).toHaveAttribute('aria-rowindex', '2')
    expect(lignesRendues[5]).toHaveAttribute('aria-rowindex', '6')
  })

  it('après défilement, les lignes montées changent sans changer de nombre', () => {
    grille()
    const avant = screen.getAllByRole('row').length
    const contenuAvant = screen.getAllByRole('gridcell')[0]?.textContent

    const viewport = screen.getByRole('grid').querySelector('[class*="viewport"]')
    if (!viewport) throw new Error('conteneur de défilement introuvable')
    fireEvent.scroll(viewport, { target: { scrollTop: 5_000 } })

    expect(screen.getAllByRole('row').length).toBe(avant)
    expect(screen.getAllByRole('gridcell')[0]?.textContent).not.toBe(contenuAvant)
    // 5000 / 26 = 192, moins 4 de marge.
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-rowindex', '190')
  })

  it('la seconde ligne d’en-tête n’existe que si on la demande', () => {
    grille({ rows: lignes(3) })
    expect(screen.queryByLabelText('filtre nom')).not.toBeInTheDocument()

    grille({ rows: lignes(3), filterRow: true })
    expect(screen.getByLabelText('filtre nom')).toBeInTheDocument()
    // Deux lignes d'en-tête : le total et les indices se décalent d'autant.
    expect(screen.getAllByRole('grid')[1]).toHaveAttribute('aria-rowcount', '5')
  })

  it('sélectionne au clic et au clavier', async () => {
    const utilisateur = userEvent.setup()

    function Pilotee() {
      const [selection, setSelection] = useState<string | null>(null)
      return (
        <VirtualGrid
          label="Lignes"
          columns={COLONNES}
          rows={lignes(20)}
          rowId={(l) => String(l.id)}
          viewportHeight={260}
          selectedId={selection}
          onSelect={(l) => setSelection(String(l.id))}
        />
      )
    }
    render(<Pilotee />)

    await utilisateur.click(screen.getByText('ligne 2'))
    expect(screen.getAllByRole('row')[3]).toHaveAttribute('aria-selected', 'true')

    await utilisateur.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('row')[4]).toHaveAttribute('aria-selected', 'true')
    await utilisateur.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('row')[3]).toHaveAttribute('aria-selected', 'true')
  })

  it('sans onSelect, aucune ligne n’est annoncée sélectionnable', () => {
    grille({ rows: lignes(3) })
    expect(screen.getAllByRole('row')[1]).not.toHaveAttribute('aria-selected')
  })

  it('rend l’état vide plutôt qu’une grille sans ligne', () => {
    grille({ rows: [], empty: 'Aucune ligne' })
    expect(screen.getByText('Aucune ligne')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })
})
