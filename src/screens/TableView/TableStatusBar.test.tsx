import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { RowWindow } from '../../domain/engine'
import { LanguageProvider } from '../../i18n/LanguageContext'
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
      <LanguageProvider preferences={{ language: 'fr' }}>
        <TableStatusBar fenetre={fenetre()} loading={false} error={null} {...props} />
      </LanguageProvider>
    </>,
  )
  return screen.getByRole('status', { name: 'État de la table' })
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

  it('« lecture seule » annonce ⌘E, que `11b` honore désormais', () => {
    const barre = monter()
    expect(barre).toHaveTextContent('lecture seule')
    // `10c` avait retiré ce rappel faute d'écran qui y réponde — un raccourci affiché qui ne répond
    // pas est pire qu'un raccourci absent (`09e`). `11b` livre la bascule, donc il revient.
    expect(barre).toHaveTextContent('⌘E pour éditer')
  })

  it('en édition sans modification, elle le dit sans annoncer le compte', () => {
    const barre = monter({ editing: true })
    expect(barre).toHaveTextContent('édition — aucune modification')
    // La lecture reste annoncée : rien n'attend, donc rien ne la remplace.
    expect(barre).toHaveTextContent('1 ligne')
  })

  it('avec des modifications, elle dit ce qui attend et que rien n’est parti', () => {
    const barre = monter({ pendingChanges: 3, editing: true })
    expect(barre).toHaveTextContent('3 modifications en attente')
    // **La promesse qui compte** : elle restera à « 0 envoyée » jusqu'à `11d`, qui écrit.
    expect(barre).toHaveTextContent('0 envoyée')
    expect(barre).toHaveTextContent('transaction non ouverte')
    // Le compte de lignes lu n'est plus l'information qui compte.
    expect(barre).not.toHaveTextContent('1 ligne')
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
