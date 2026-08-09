import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { ColumnInfo, DatabaseKey, RowWindow, Value } from '../../domain/engine'
import { rendreValeur } from './cellule'
import { TableView } from './TableView'
import type { PasserelleLignes } from './useLignes'

const CLE: DatabaseKey = {
  project: 'Atelier Nord',
  database: 'analytics',
  environment: 'prod',
}

const colonne = (name: string, category: ColumnInfo['category']): ColumnInfo => ({
  position: 1,
  name,
  typeName: 'text',
  category,
  nullable: true,
  default: null,
  key: null,
  comment: null,
})

const COLONNES = [
  colonne('id', 'number'),
  colonne('status', 'text'),
  colonne('shipped_at', 'timestamp'),
]

function fenetre(rows: Value[][], over: Partial<RowWindow> = {}): RowWindow {
  return {
    offset: 0,
    rows,
    total: null,
    sql: 'select * from public.orders limit 500 offset 0',
    durationMs: 41,
    ...over,
  }
}

function monter(resultat: RowWindow | Promise<never>, colonnes = COLONNES) {
  const passerelle: PasserelleLignes = {
    readRows: vi.fn(async () => {
      if (resultat instanceof Promise) return resultat
      return resultat
    }),
  }
  render(
    <>
      <Sprite />
      <TableView
        cle={CLE}
        schema="public"
        table="orders"
        columns={colonnes}
        passerelle={passerelle}
      />
    </>,
  )
  return passerelle
}

describe('TableView', () => {
  it('demande une fenêtre bornée, jamais « tout »', async () => {
    const passerelle = monter(fenetre([[{ kind: 'int', value: 1 }]]))

    await waitFor(() => expect(passerelle.readRows).toHaveBeenCalled())
    const [cle, requete] = vi.mocked(passerelle.readRows).mock.calls[0] ?? []
    expect(cle).toEqual(CLE)
    // Le palier vient de `RowLimit`, énumération fermée : « demander tout » n'est pas
    // exprimable, et c'est le type qui le garantit — pas la discipline de l'appelant.
    expect(requete?.limit).toBe('fiveHundred')
    expect(requete?.offset).toBe(0)
    expect(requete?.schema).toBe('public')
    expect(requete?.table).toBe('orders')
  })

  it('rend une ligne par ligne reçue, avec son rang en gouttière', async () => {
    monter(
      fenetre([
        [{ kind: 'int', value: 184_220 }, { kind: 'text', value: 'paid' }, { kind: 'null' }],
        [{ kind: 'int', value: 184_219 }, { kind: 'text', value: 'pending' }, { kind: 'null' }],
      ]),
    )

    const grille = await screen.findByRole('grid', { name: 'Lignes de public.orders' })
    // Deux lignes de données, plus l'en-tête.
    await waitFor(() => expect(within(grille).getAllByRole('row')).toHaveLength(3))
    expect(within(grille).getByText('184 220')).toBeInTheDocument()
    expect(within(grille).getAllByText('NULL')).toHaveLength(2)
  })

  it('la barre d’état rend les chiffres de la fenêtre, pas des valeurs recalculées', async () => {
    monter(
      fenetre([[{ kind: 'int', value: 1 }, { kind: 'null' }, { kind: 'null' }]], {
        durationMs: 128,
        sql: 'select * from public.orders limit 100 offset 0',
      }),
    )

    const statut = await screen.findByRole('status')
    expect(statut).toHaveTextContent('1 ligne')
    expect(statut).toHaveTextContent('128 ms')
    // `limit 100` vient du **SQL réellement exécuté**, pas du palier demandé : montrer une
    // requête différente de celle qui tourne serait un piège pour qui débogue.
    expect(statut).toHaveTextContent('limit 100')
  })

  it('« lecture seule » est affiché, « ⌘E pour éditer » ne l’est pas', async () => {
    monter(fenetre([[{ kind: 'int', value: 1 }]]))
    const statut = await screen.findByRole('status')
    expect(statut).toHaveTextContent('lecture seule')
    // Un raccourci affiché qui ne répond pas est pire qu'un raccourci absent — `09e`.
    expect(statut).not.toHaveTextContent('⌘E')
  })

  it('une table sans ligne le dit, et ne ressemble ni à un chargement ni à un échec', async () => {
    monter(fenetre([]))
    expect(await screen.findByText(/ne contient aucune ligne/)).toBeInTheDocument()
  })

  it('un échec de lecture est affiché, et la grille ne prétend pas être vide', async () => {
    const passerelle: PasserelleLignes = {
      readRows: vi.fn(async () => {
        throw new Error('la connexion a été fermée')
      }),
    }
    render(
      <>
        <Sprite />
        <TableView
          cle={CLE}
          schema="public"
          table="orders"
          columns={COLONNES}
          passerelle={passerelle}
        />
      </>,
    )

    // Le message complet dans la grille, le verdict seul dans la barre d'état : la même phrase
    // écrite deux fois se lirait comme deux erreurs.
    expect(await screen.findByText(/la connexion a été fermée/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('lecture impossible')
    expect(screen.queryByText(/ne contient aucune ligne/)).not.toBeInTheDocument()
  })
})

describe('rendu d’une valeur', () => {
  // Un conteneur neuf par appel : deux rendus dans un même test laisseraient deux `cellule`
  // dans le document, et la requête échouerait sur l'ambiguïté plutôt que sur le fond.
  const rendu = (value: Value) => {
    const { container } = render(<span>{rendreValeur(value)}</span>)
    return container.firstElementChild as HTMLElement
  }

  it('rend NULL écrit, jamais du vide', () => {
    expect(rendu({ kind: 'null' })).toHaveTextContent('NULL')
  })

  it('distingue NULL de la chaîne vide', () => {
    render(
      <>
        <span data-testid="a">{rendreValeur({ kind: 'null' })}</span>
        <span data-testid="b">{rendreValeur({ kind: 'text', value: '' })}</span>
      </>,
    )
    expect(screen.getByTestId('a').textContent).toBe('NULL')
    expect(screen.getByTestId('b').textContent).toBe('')
  })

  it('groupe les entiers sans les abréger', () => {
    // `formatCount` rendrait « 1.9 M » : juste pour une tuile, faux dans une cellule où
    // l'utilisateur lit une valeur exacte de sa base.
    expect(rendu({ kind: 'int', value: 1_904_220 }).textContent).toBe('1 904 220')
  })

  it('ne retouche ni les flottants ni les dates', () => {
    expect(rendu({ kind: 'float', value: 12.5 })).toHaveTextContent('12.5')
    expect(rendu({ kind: 'timestamp', value: '2026-07-31 09:41:02' })).toHaveTextContent(
      '2026-07-31 09:41:02',
    )
  })

  it('rend les booléens en toutes lettres', () => {
    expect(rendu({ kind: 'bool', value: true })).toHaveTextContent('true')
    expect(rendu({ kind: 'bool', value: false })).toHaveTextContent('false')
  })

  it('met un JSON sur une seule ligne', () => {
    const valeur = rendu({ kind: 'json', value: '{\n  "gift": true\n}' })
    expect(valeur.textContent).not.toContain('\n')
    expect(valeur).toHaveTextContent('{ "gift": true }')
  })

  it('rend la taille d’un binaire, jamais son contenu', () => {
    // 8 octets encodés : le contenu ne doit apparaître nulle part.
    const valeur = rendu({ kind: 'binary', base64: 'AQIDBAUGBwg=' })
    expect(valeur).toHaveTextContent('8 o')
    expect(valeur.textContent).not.toContain('AQIDBAUGBwg')
  })
})
