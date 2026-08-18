import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { ColumnInfo, DatabaseKey, RowQuery, Value } from '../../domain/engine'
import type { EnAttente } from './modifications'
import { TableView } from './TableView'
import type { PasserelleLignes } from './useLignes'

const CLE: DatabaseKey = { project: 'Print', database: 'analytics', environment: 'prod' }

const colonne = (name: string, over: Partial<ColumnInfo> = {}): ColumnInfo => ({
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
  ...over,
})

const COLONNES = [
  colonne('id', { category: 'number', key: 'primary' }),
  colonne('status'),
  colonne('note'),
]

const LIGNES: Value[][] = [
  [{ kind: 'int', value: 184_217 }, { kind: 'text', value: 'paid' }, { kind: 'null' }],
  [
    { kind: 'int', value: 184_219 },
    { kind: 'text', value: 'pending' },
    { kind: 'text', value: 'cadeau' },
  ],
]

function monter(options: { columns?: ColumnInfo[]; edition?: boolean; lignes?: Value[][] } = {}) {
  const readRows = vi.fn(async (_c: DatabaseKey, _r: RowQuery) => ({
    offset: 0,
    rows: options.lignes ?? LIGNES,
    total: null,
    sql: 'select …',
    durationMs: 1,
  }))
  const attentes: EnAttente[] = []
  // **Créée une fois**, hors du composant : `useLignes` relance sa lecture quand la passerelle
  // change d'identité, et un objet littéral en prop en crée une neuve à chaque rendu — donc une
  // lecture par frappe.
  const passerelle = { readRows } as unknown as PasserelleLignes

  function Pilotee() {
    const [attente, setAttente] = useState<EnAttente>([])
    return (
      <TableView
        cle={CLE}
        schema="public"
        table="orders"
        columns={options.columns ?? COLONNES}
        edition={options.edition ?? true}
        attente={attente}
        onAttenteChange={(a) => {
          attentes.push(a)
          setAttente(a)
        }}
        passerelle={passerelle}
      />
    )
  }

  render(
    <>
      <Sprite />
      <Pilotee />
    </>,
  )
  return { readRows, attentes, derniere: () => attentes[attentes.length - 1] ?? [] }
}

async function attendreLaGrille() {
  const grille = await screen.findByRole('grid')
  await waitFor(() => expect(within(grille).getByText('paid')).toBeInTheDocument())
  return grille
}

describe('ouvrir une cellule', () => {
  it('en mode édition, une cellule éditable est un contrôle nommé', async () => {
    monter()
    await attendreLaGrille()
    // Un `<button>` plutôt qu'un double-clic : le clavier vient gratuitement, là où un
    // gestionnaire de double-clic n'a aucun équivalent.
    expect(screen.getAllByRole('button', { name: 'Modifier status' })).toHaveLength(2)
  })

  it('hors mode édition, aucune cellule ne s’ouvre', async () => {
    monter({ edition: false })
    await attendreLaGrille()
    expect(screen.queryByRole('button', { name: 'Modifier status' })).not.toBeInTheDocument()
  })

  it('cliquer ouvre la saisie sur la valeur brute', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await attendreLaGrille()

    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Modifier status' })[0] as HTMLElement,
    )
    expect(screen.getByLabelText('Nouvelle valeur')).toHaveValue('paid')
  })

  it('la saisie s’ouvre aussi au clavier', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await attendreLaGrille()

    const cellule = screen.getAllByRole('button', { name: 'Modifier status' })[0] as HTMLElement
    cellule.focus()
    await utilisateur.keyboard('{Enter}')
    expect(screen.getByLabelText('Nouvelle valeur')).toBeInTheDocument()
  })

  it('la clé primaire n’est pas éditable, et le dit', async () => {
    monter()
    const grille = await attendreLaGrille()
    expect(screen.queryByRole('button', { name: 'Modifier id' })).not.toBeInTheDocument()
    // La raison est portée par la cellule : un refus muet passerait pour un bug.
    const cellule = within(grille).getByText('184 217')
    expect(cellule).toHaveAttribute('title', expect.stringContaining('identifie la ligne'))
  })

  it('une table sans clé primaire n’est pas éditable du tout', async () => {
    monter({
      columns: [colonne('message'), colonne('niveau')],
      lignes: [
        [
          { kind: 'text', value: 'ok' },
          { kind: 'text', value: 'info' },
        ],
      ],
    })
    const grille = await screen.findByRole('grid')
    await waitFor(() => expect(within(grille).getByText('ok')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument()
    expect(within(grille).getByText('ok')).toHaveAttribute(
      'title',
      expect.stringContaining('pas de clé primaire'),
    )
  })
})

describe('valider, abandonner, retenir', () => {
  async function ouvrirStatus(utilisateur: ReturnType<typeof userEvent.setup>) {
    await attendreLaGrille()
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Modifier status' })[0] as HTMLElement,
    )
    return screen.getByLabelText('Nouvelle valeur')
  }

  it('↩ retient la modification, et rien n’est envoyé', async () => {
    const utilisateur = userEvent.setup()
    const { derniere, readRows } = monter()
    const champ = await ouvrirStatus(utilisateur)

    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'shipped{Enter}')

    await waitFor(() => expect(derniere()).toHaveLength(1))
    expect(derniere()[0]?.column).toBe('status')
    expect(derniere()[0]?.cle).toBe('184217')
    expect(derniere()[0]?.apres).toEqual({ kind: 'texte', texte: 'shipped' })
    // **Rien n'est envoyé** : c'est le sens de « en attente ». Une seule lecture, celle du montage.
    expect(readRows).toHaveBeenCalledTimes(1)
  })

  it('la valeur retenue s’affiche dans la grille, pas l’ancienne', async () => {
    const utilisateur = userEvent.setup()
    monter()
    const champ = await ouvrirStatus(utilisateur)

    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'shipped{Enter}')

    const grille = screen.getByRole('grid')
    await waitFor(() => expect(within(grille).getByText('shipped')).toBeInTheDocument())
    // Afficher l'ancienne ferait croire que la saisie a été perdue.
    expect(within(grille).queryByText('paid')).not.toBeInTheDocument()
  })

  it('esc abandonne la saisie sans rien retenir', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter()
    const champ = await ouvrirStatus(utilisateur)

    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'shipped')
    await utilisateur.keyboard('{Escape}')

    expect(screen.queryByLabelText('Nouvelle valeur')).not.toBeInTheDocument()
    expect(derniere()).toHaveLength(0)
    expect(within(screen.getByRole('grid')).getByText('paid')).toBeInTheDocument()
  })

  it('rouvrir une cellule modifiée montre ce qu’on y a mis', async () => {
    const utilisateur = userEvent.setup()
    monter()
    let champ = await ouvrirStatus(utilisateur)
    await utilisateur.clear(champ)
    await utilisateur.type(champ, 'shipped{Enter}')

    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Modifier status' })[0] as HTMLElement,
    )
    champ = screen.getByLabelText('Nouvelle valeur')
    expect(champ).toHaveValue('shipped')
  })

  it('⌥⌫ pose NULL, distinct d’un champ vidé', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter()
    const champ = await ouvrirStatus(utilisateur)

    await utilisateur.clear(champ)
    await utilisateur.keyboard('{Alt>}{Backspace}{/Alt}')
    expect(champ).toHaveValue('NULL')
    await utilisateur.keyboard('{Enter}')

    await waitFor(() => expect(derniere()[0]?.apres).toEqual({ kind: 'null' }))
  })

  it('vider le champ donne la chaîne vide, pas NULL', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter()
    const champ = await ouvrirStatus(utilisateur)

    await utilisateur.clear(champ)
    await utilisateur.keyboard('{Enter}')

    // La distinction que `10c` a posée et qu'un client de bases ne doit pas brouiller.
    await waitFor(() => expect(derniere()[0]?.apres).toEqual({ kind: 'texte', texte: '' }))
  })
})

describe('⌘Z annule la dernière modification retenue', () => {
  async function retenirDeux(utilisateur: ReturnType<typeof userEvent.setup>) {
    await attendreLaGrille()
    const cellules = screen.getAllByRole('button', { name: 'Modifier status' })
    for (const [rang, cellule] of cellules.entries()) {
      await utilisateur.click(cellule as HTMLElement)
      const champ = screen.getByLabelText('Nouvelle valeur')
      await utilisateur.clear(champ)
      await utilisateur.type(champ, `valeur${rang}{Enter}`)
    }
  }

  it('retire la dernière, pas la première', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter()
    await retenirDeux(utilisateur)
    await waitFor(() => expect(derniere()).toHaveLength(2))

    await utilisateur.keyboard('{Meta>}z{/Meta}')

    await waitFor(() => expect(derniere()).toHaveLength(1))
    expect(derniere()[0]?.cle).toBe('184217')
  })

  it('est inopérant pendant une saisie', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter()
    await retenirDeux(utilisateur)
    await waitFor(() => expect(derniere()).toHaveLength(2))

    // Ouvrir une cellule, puis ⌘Z : dans un champ, ⌘Z est l'annulation du navigateur, et la
    // détourner surprendrait.
    await utilisateur.click(
      screen.getAllByRole('button', { name: 'Modifier note' })[0] as HTMLElement,
    )
    await utilisateur.keyboard('{Meta>}z{/Meta}')

    expect(derniere()).toHaveLength(2)
  })

  it('hors mode édition, il ne fait rien', async () => {
    const utilisateur = userEvent.setup()
    const { derniere } = monter({ edition: false })
    await attendreLaGrille()
    await utilisateur.keyboard('{Meta>}z{/Meta}')
    expect(derniere()).toHaveLength(0)
  })
})
