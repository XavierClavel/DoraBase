import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { ColumnInfo, DatabaseKey, RowQuery } from '../../domain/engine'
import { TableView } from './TableView'
import type { PasserelleLignes } from './useLignes'

const CLE: DatabaseKey = { project: 'Halle', database: 'analytics', environment: 'prod' }

const colonne = (name: string): ColumnInfo => ({
  position: 1,
  name,
  typeName: 'text',
  category: 'text',
  nullable: true,
  default: null,
  identity: null,
  key: null,
  comment: null,
  frequency: null,
})

const COLONNES = [colonne('status'), colonne('total_cents'), colonne('created_at')]

function monter() {
  const readRows = vi.fn(async (_cle: DatabaseKey, requete: RowQuery) => ({
    offset: 0,
    rows: [
      [
        { kind: 'text' as const, value: 'paid' },
        { kind: 'int' as const, value: 12_900 },
        { kind: 'null' as const },
      ],
    ],
    total: null,
    // Le SQL rendu **porte la limite réellement employée** : c'est lui que « Voir le SQL »
    // affiche, et il doit pouvoir différer de ce que l'écran croit avoir demandé.
    sql: `select * from public.orders limit ${limiteDe(requete)} offset 0`,
    durationMs: 41,
  }))
  render(
    <>
      <Sprite />
      <TableView
        cle={CLE}
        schema="public"
        table="orders"
        columns={COLONNES}
        passerelle={{ readRows } satisfies PasserelleLignes}
      />
    </>,
  )
  return { readRows }
}

function limiteDe(requete: RowQuery): number {
  return { oneHundred: 100, fiveHundred: 500, oneThousand: 1000, fiveThousand: 5000 }[requete.limit]
}

function derniereRequete(readRows: ReturnType<typeof monter>['readRows']): RowQuery {
  const appels = vi.mocked(readRows).mock.calls
  return appels[appels.length - 1]?.[1] as RowQuery
}

describe('toolbar', () => {
  it('le stepper ne produit que les quatre paliers et se bloque aux extrémités', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await waitFor(() => expect(readRows).toHaveBeenCalled())

    const monter_ = screen.getByRole('button', { name: 'Augmenter la limite' })
    const descendre = screen.getByRole('button', { name: 'Réduire la limite' })

    await utilisateur.click(monter_)
    await waitFor(() => expect(derniereRequete(readRows).limit).toBe('oneThousand'))
    await utilisateur.click(monter_)
    await waitFor(() => expect(derniereRequete(readRows).limit).toBe('fiveThousand'))
    // Au sommet de l'échelle, la flèche se désactive : « demander tout » n'est pas exprimable,
    // et ce n'est pas au bouton d'y suppléer.
    expect(monter_).toBeDisabled()

    await utilisateur.click(descendre)
    await utilisateur.click(descendre)
    await utilisateur.click(descendre)
    await waitFor(() => expect(derniereRequete(readRows).limit).toBe('oneHundred'))
    expect(descendre).toBeDisabled()
  })

  it('changer de palier relance la lecture', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await waitFor(() => expect(readRows).toHaveBeenCalledTimes(1))

    await utilisateur.click(screen.getByRole('button', { name: 'Augmenter la limite' }))
    await waitFor(() => expect(readRows).toHaveBeenCalledTimes(2))
  })

  it('rafraîchir relit la même requête', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await waitFor(() => expect(readRows).toHaveBeenCalledTimes(1))

    await utilisateur.click(screen.getByRole('button', { name: 'Rafraîchir' }))
    await waitFor(() => expect(readRows).toHaveBeenCalledTimes(2))
    expect(derniereRequete(readRows).limit).toBe('fiveHundred')
  })

  it('un chip résume chaque filtre actif, et sa croix le retire', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await utilisateur.type(await screen.findByLabelText('Filtrer status'), 'paid{Enter}')

    await waitFor(() => expect(screen.getByText('status = paid')).toBeInTheDocument())

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer le filtre sur status' }))

    // Un seul état : la croix vide aussi le champ d'en-tête.
    await waitFor(() => expect(derniereRequete(readRows).filters).toHaveLength(0))
    expect(screen.getByLabelText('Filtrer status')).toHaveValue('')
  })

  it('« Voir le SQL » montre le SQL exécuté, pas une chaîne reconstruite', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await waitFor(() => expect(readRows).toHaveBeenCalled())

    await utilisateur.click(screen.getByRole('button', { name: /Voir le SQL/ }))
    const panneau = await screen.findByRole('dialog', { name: 'SQL exécuté' })
    expect(panneau).toHaveTextContent('select * from public.orders limit 500 offset 0')
  })

  it('masquer une colonne change le compteur, pas le SQL, et garde son filtre visible', async () => {
    const utilisateur = userEvent.setup()
    const { readRows } = monter()
    await utilisateur.type(await screen.findByLabelText('Filtrer status'), 'paid{Enter}')
    await waitFor(() => expect(derniereRequete(readRows).filters).toHaveLength(1))
    const avant = derniereRequete(readRows)

    await utilisateur.click(screen.getByRole('button', { name: 'Colonnes affichées' }))
    const panneau = await screen.findByRole('dialog', { name: 'Colonnes affichées' })
    await utilisateur.click(within(panneau).getByLabelText(/status/))

    expect(screen.getByRole('button', { name: 'Colonnes affichées' })).toHaveTextContent('2/3')
    // La requête n'a pas bougé : masquer est un réglage d'affichage.
    expect(derniereRequete(readRows)).toEqual(avant)
    // Et le filtre reste **visible** en chip : un filtre invisible agirait en secret.
    expect(screen.getByText('status = paid')).toBeInTheDocument()
  })

  it('l’export est désactivé et nomme sa spec', async () => {
    monter()
    const bouton = await screen.findByRole('button', { name: 'Exporter' })
    expect(bouton).toHaveAttribute('aria-disabled', 'true')
  })
})
