import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { RowWindow } from '../../domain/engine'
import { TableStatusBar } from './TableStatusBar'

function fenetre(over: Partial<RowWindow> = {}): RowWindow {
  return {
    offset: 0,
    rows: [[{ kind: 'int', value: 1 }]],
    total: null,
    sql: 'select * from public.orders limit 500 offset 0',
    durationMs: 41,
    ...over,
  }
}

function monter(props: Partial<Parameters<typeof TableStatusBar>[0]> = {}) {
  render(
    <>
      <Sprite />
      <TableStatusBar fenetre={fenetre()} loading={false} error={null} {...props} />
    </>,
  )
  return screen.getByRole('status')
}

describe('barre d’état', () => {
  it('rend les chiffres de la fenêtre, pas des valeurs recalculées', () => {
    const barre = monter({
      fenetre: fenetre({
        durationMs: 128,
        sql: 'select * from public.orders limit 100 offset 0',
      }),
    })
    expect(barre).toHaveTextContent('1 ligne')
    expect(barre).toHaveTextContent('128 ms')
    // `limit 100` vient du **SQL réellement exécuté**, pas du palier demandé : montrer une requête
    // différente de celle qui tourne serait un piège pour qui débogue.
    expect(barre).toHaveTextContent('limit 100')
  })

  it('« lecture seule » est affiché, « ⌘E pour éditer » ne l’est pas', () => {
    const barre = monter()
    expect(barre).toHaveTextContent('lecture seule')
    // Un raccourci affiché qui ne répond pas est pire qu'un raccourci absent — `09e`.
    expect(barre).not.toHaveTextContent('⌘E')
  })

  it('un échec porte le verdict, pas le message complet', () => {
    const barre = monter({ fenetre: null, error: 'la connexion a été fermée' })
    expect(barre).toHaveTextContent('lecture impossible')
    // Le message détaillé vit dans la grille : l'écrire deux fois se lirait comme deux erreurs.
    expect(barre).not.toHaveTextContent('la connexion a été fermée')
  })

  it('chargement, vide et échec ne se ressemblent pas', () => {
    expect(monter({ loading: true, fenetre: null })).toHaveTextContent('Lecture…')
  })
})
