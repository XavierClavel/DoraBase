import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { Project } from '../../domain/config'
import type { SchemaInfo, TableDetail, TableSummary } from '../../domain/engine'
import type { PasserelleLignes } from '../TableView/useLignes'
import type { PasserelleArbre } from './useArbre'
import type { PasserelleDetail } from './useDetailTable'
import { Workbench } from './Workbench'

const variante = {
  environment: 'prod' as const,
  host: 'localhost',
  port: 5432,
  defaultDatabase: 'analytics',
  username: 'dorabase',
  password: null,
  sslMode: 'prefer' as const,
  readOnly: true,
  reconnectOnStartup: false,
  tunnel: null,
}

const PROJETS: Project[] = [
  {
    name: 'Atelier Nord',
    activeEnvironment: 'prod',
    databases: [
      { name: 'analytics', engine: 'postgresql', variants: [variante] },
      { name: 'shop', engine: 'postgresql', variants: [variante] },
    ],
  },
]

const SCHEMAS: SchemaInfo[] = [
  { name: 'public', counts: { tables: 2, views: 0, functions: 0, indexes: 0 } },
]

const objet = (name: string, kind: TableSummary['kind'] = 'table'): TableSummary => ({
  name,
  kind,
  rows: { kind: 'estimated', value: 1_900_000 },
  sizeBytes: 1024,
  columnCount: 3,
  primaryKey: 'id',
  lastAnalyze: null,
  comment: null,
})

const DETAIL: TableDetail = {
  schema: 'public',
  name: 'orders',
  rows: { kind: 'estimated', value: 1_900_000 },
  sizeBytes: 1024,
  comment: null,
  columns: [
    {
      position: 1,
      name: 'id',
      typeName: 'int8',
      category: 'number',
      nullable: false,
      default: null,
      key: 'primary',
      comment: null,
    },
    {
      position: 2,
      name: 'created_at',
      typeName: 'timestamptz',
      category: 'timestamp',
      nullable: false,
      default: null,
      key: null,
      comment: null,
    },
  ],
  indexes: [],
  constraints: [],
  triggers: [],
  relations: [],
  ddl: '',
}

function passerelles() {
  const passerelle: PasserelleArbre = {
    openDatabase: vi.fn(async () => ({
      kind: 'connected' as const,
      serverVersion: 'PostgreSQL 17.6',
      tunnelLocalPort: null,
    })),
    closeDatabase: vi.fn(async () => {}),
    connectionStates: vi.fn(async () => []),
    listSchemas: vi.fn(async () => SCHEMAS),
    listObjects: vi.fn(async () => [objet('orders'), objet('order_items')]),
  }
  const detail: PasserelleDetail = { describeTable: vi.fn(async () => DETAIL) }
  const lignes: PasserelleLignes = {
    readRows: vi.fn(async () => ({
      offset: 0,
      rows: [[{ kind: 'int' as const, value: 184_220 }, { kind: 'null' as const }]],
      total: null,
      sql: 'select * from public.orders limit 500 offset 0',
      durationMs: 41,
    })),
  }
  return { passerelle, detail, lignes }
}

async function ouvrirLArbreJusquAuSchema(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(screen.getByRole('treeitem', { name: /Atelier Nord/ }))
  await utilisateur.click(await screen.findByRole('treeitem', { name: /analytics/ }))
  await utilisateur.click(await screen.findByRole('treeitem', { name: 'public' }))
}

function monter(over: Partial<Parameters<typeof Workbench>[0]> = {}) {
  const { passerelle, detail, lignes } = passerelles()
  render(
    <>
      <Sprite />
      <Workbench
        projects={PROJETS}
        passerelle={passerelle}
        passerelleDetail={detail}
        passerelleLignes={lignes}
        {...over}
      />
    </>,
  )
  return { passerelle, detail, lignes }
}

describe('Workbench', () => {
  it('assemble la coquille : barre de titre, arbre, centre, panneau droit', () => {
    monter()
    expect(screen.getByRole('tree', { name: 'Projets et bases' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByLabelText('Détail de l’objet')).toBeInTheDocument()
  })

  it('l’arbre se lit sans réseau : rien n’est ouvert au montage', () => {
    const { passerelle } = monter()
    expect(passerelle.openDatabase).not.toHaveBeenCalled()
    expect(passerelle.listSchemas).not.toHaveBeenCalled()
  })

  it('déplier une base l’ouvre et charge ses schémas ; déplier un schéma charge ses objets', async () => {
    const utilisateur = userEvent.setup()
    const { passerelle } = monter()

    await ouvrirLArbreJusquAuSchema(utilisateur)

    expect(passerelle.openDatabase).toHaveBeenCalledTimes(1)
    expect(passerelle.listObjects).toHaveBeenCalledWith(
      { project: 'Atelier Nord', database: 'analytics', environment: 'prod' },
      'public',
    )
    expect(await screen.findByRole('treeitem', { name: /orders/ })).toBeInTheDocument()
  })

  it('double-cliquer une table de la liste ouvre un onglet', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)

    const table = await screen.findByRole('table')
    await utilisateur.dblClick(within(table).getByText('orders'))

    expect(screen.getByRole('tab', { name: /orders/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('grid', { name: 'Lignes de public.orders' })).toBeInTheDocument()
  })

  it('rouvrir la même table active l’onglet existant sans le dupliquer', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)

    // Depuis l'arbre, où les deux tables restent atteignables une fois un onglet ouvert.
    // C'est le second **ouvrir** qui doit dédoublonner : cliquer l'onglet ne le prouverait pas,
    // puisqu'il n'appelle pas `ouvrir` du tout — une première version de ce test passait sans
    // que le dédoublonnage existe.
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await utilisateur.click(screen.getByRole('treeitem', { name: /order_items/ }))
    await utilisateur.click(screen.getByRole('treeitem', { name: /^orders/ }))

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: /^orders/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('fermer le dernier onglet laisse l’écran debout, sur la liste des objets', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)

    const table = await screen.findByRole('table')
    await utilisateur.dblClick(within(table).getByText('orders'))
    await utilisateur.click(screen.getByRole('button', { name: 'Fermer orders' }))

    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    // La liste des objets revient, et l'écran de travail est toujours là.
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('tree', { name: 'Projets et bases' })).toBeInTheDocument()
  })

  it('la sidebar liste les colonnes de la table ouverte, pas avant', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    expect(screen.queryByText(/^Colonnes de/)).not.toBeInTheDocument()

    const table = await screen.findByRole('table')
    await utilisateur.dblClick(within(table).getByText('orders'))

    expect(await screen.findByText('Colonnes de orders')).toBeInTheDocument()
    // `created_at` apparaît deux fois une fois la table ouverte — dans la sidebar et dans
    // l'en-tête de la grille. C'est celle de la sidebar qui est en cause ici.
    const section = screen.getByText('Colonnes de orders').parentElement as HTMLElement
    await waitFor(() => expect(within(section).getByText('created_at')).toBeInTheDocument())
  })

  it('« Ouvrir les données » du panneau droit ouvre l’onglet, et n’annonce plus A5', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)

    const table = await screen.findByRole('table')
    await utilisateur.click(within(table).getByText('orders'))

    const action = await screen.findByRole('button', { name: 'Ouvrir les données' })
    expect(action).not.toHaveAttribute('aria-disabled')
    await utilisateur.click(action)

    expect(screen.getByRole('tab', { name: /orders/ })).toBeInTheDocument()
  })

  it('la sidebar annote la colonne triée, d’après l’état de la vue de table', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))

    const section = (await screen.findByText('Colonnes de orders')).parentElement as HTMLElement
    await waitFor(() => expect(within(section).getByText('created_at')).toBeInTheDocument())
    expect(within(section).queryByText(/tri/)).not.toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Trier par created_at' }))

    // L'annotation reflète l'état de la grille — un seul état, deux lecteurs.
    await waitFor(() => expect(within(section).getByText('tri ↑')).toBeInTheDocument())
  })

  it('« Structure » reste désactivé et nomme son écran', () => {
    monter()
    expect(screen.getByRole('button', { name: 'Structure' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('un dépliage qui échoue le dit sur sa ligne sans vider l’arbre', async () => {
    const utilisateur = userEvent.setup()
    const { passerelle } = passerelles()
    passerelle.openDatabase = vi.fn(async () => {
      throw new Error('hôte injoignable')
    })
    render(
      <>
        <Sprite />
        <Workbench
          projects={PROJETS}
          passerelle={passerelle}
          passerelleDetail={{ describeTable: vi.fn(async () => DETAIL) }}
        />
      </>,
    )

    await utilisateur.click(screen.getByRole('treeitem', { name: /Atelier Nord/ }))
    await utilisateur.click(await screen.findByRole('treeitem', { name: /analytics/ }))

    expect(await screen.findByText(/hôte injoignable/)).toBeInTheDocument()
    // L'autre base reste visible : un échec ne vide pas l'arbre.
    expect(screen.getByRole('treeitem', { name: /shop/ })).toBeInTheDocument()
  })
})
