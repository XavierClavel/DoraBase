import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { Project } from '../../domain/config'
import type { SchemaInfo, TableDetail, TableSummary, UpdatePlan } from '../../domain/engine'
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
    // **Une colonne dont la valeur n'est pas nulle**, et c'est délibéré : avec `created_at` nulle
    // partout, un test sur la valeur attendue d'une modification était satisfait par `null` — donc
    // vert même quand le code cessait de l'envoyer. Le décor décidait du résultat (règle 7).
    {
      position: 3,
      name: 'status',
      typeName: 'text',
      category: 'text',
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
      rows: [
        [
          { kind: 'int' as const, value: 184_220 },
          { kind: 'null' as const },
          { kind: 'text' as const, value: 'pending' },
        ],
      ],
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

/** Une prévisualisation qui répond, pour les tests qui ne portent pas sur elle. */
const PREVIEW = { previewUpdates: async () => 'BEGIN;\nCOMMIT;' }

/**
 * Le même décor, mais en `dev`.
 *
 * **Le décor par défaut est en `prod`**, ce qui est utile ailleurs et trompeur ici : les tests
 * d'écriture qui ne portent pas sur la confirmation passeraient par elle sans le dire.
 */
const PROJETS_DEV: Project[] = PROJETS.map((projet) => ({
  ...projet,
  activeEnvironment: 'dev' as const,
  // La **variante** suit l'environnement actif : sans elle, la base n'est joignable dans aucun
  // environnement et l'arbre ne déplie rien — l'écran de test n'irait même pas jusqu'à la grille.
  databases: projet.databases.map((base) => ({
    ...base,
    variants: [{ ...variante, environment: 'dev' as const }],
  })),
}))

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

// --- Le mode édition (11b) ---

describe('la console SQL (`12a`)', () => {
  /** Ouvre l'arbre jusqu'à une base, puis une console. */
  async function ouvrirUneConsole(utilisateur: ReturnType<typeof userEvent.setup>) {
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle console/ }))
  }

  it('« Nouvelle console » ouvre un onglet de console', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirUneConsole(utilisateur)

    expect(screen.getByRole('tab', { name: /console 1/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Requête SQL')).toBeInTheDocument()
  })

  it('sans base ouverte, il n’y a pas de console à ouvrir', () => {
    monter()
    // Une console sans base n'aurait rien à interroger : le bouton disparaît plutôt que d'ouvrir un
    // onglet inerte.
    expect(screen.queryByRole('button', { name: /Nouvelle console/ })).not.toBeInTheDocument()
  })

  it('deux consoles gardent chacune son texte', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirUneConsole(utilisateur)
    await utilisateur.type(screen.getByLabelText('Requête SQL'), 'select 1')

    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle console/ }))
    expect(screen.getByLabelText('Requête SQL')).toHaveValue('')
    await utilisateur.type(screen.getByLabelText('Requête SQL'), 'select 2')

    // **Deux brouillons, pas un.** C'est la différence avec deux onglets sur la même table, qui n'en
    // font qu'un : on ouvre une seconde console parce qu'on veut garder la première.
    await utilisateur.click(screen.getByRole('tab', { name: /console 1/ }))
    expect(screen.getByLabelText('Requête SQL')).toHaveValue('select 1')
    await utilisateur.click(screen.getByRole('tab', { name: /console 2/ }))
    expect(screen.getByLabelText('Requête SQL')).toHaveValue('select 2')
  })

  it('une console et une table cohabitent dans la même bande', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle console/ }))

    // Un second système d'onglets à côté du premier doublerait la navigation pour un seul écran.
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    // Et revenir à la table remet la grille, pas l'éditeur.
    await utilisateur.click(screen.getByRole('tab', { name: /orders/ }))
    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.queryByLabelText('Requête SQL')).not.toBeInTheDocument()
  })

  it('l’onglet de console porte son icône, distincte de celle d’une table', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle console/ }))

    const icone = (nom: RegExp) =>
      screen.getByRole('tab', { name: nom }).querySelector('use')?.getAttribute('href')
    // Une console qui porterait l'icône d'une table serait indiscernable de ses voisines dans la
    // bande — c'est le seul repère à côté du libellé.
    expect(icone(/console 1/)).not.toBe(icone(/orders/))
    expect(icone(/console 1/)).toBe('#i-term')
  })

  it('les actions non livrées sont désactivées et disent pourquoi', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirUneConsole(utilisateur)

    // **Présentes et désactivées, pas absentes** : les cacher ferait croire qu'elles n'existeront
    // pas, les laisser cliquables et inertes ferait croire à une panne (défaut n° 36).
    for (const libelle of ['Exécuter', 'Sélection', 'Expliquer', 'Enregistrer', 'Formater']) {
      const action = screen.getByRole('button', { name: new RegExp(libelle) })
      expect(action).toBeDisabled()
      expect(action).toHaveAttribute('title', expect.stringMatching(/1[12][a-f]|formateur/))
    }
  })

  it('fermer une console la retire, et le voisin reprend la main', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await utilisateur.click(screen.getByRole('button', { name: /Nouvelle console/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Fermer console 1' }))

    expect(screen.queryByLabelText('Requête SQL')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /orders/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('mode édition', () => {
  /** Ouvre l'arbre, une table, et bascule en édition. */
  async function ouvrirEtEditer(utilisateur: ReturnType<typeof userEvent.setup>) {
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await screen.findByRole('grid')
    await utilisateur.keyboard('{Meta>}e{/Meta}')
  }

  /** Modifie la colonne `status` de la première ligne — non nulle, donc l'attendu est renseigné. */
  async function modifier(utilisateur: ReturnType<typeof userEvent.setup>, valeur = 'shipped') {
    const cellules = await screen.findAllByRole('button', { name: 'Modifier status' })
    await utilisateur.click(cellules[0] as HTMLElement)
    const champ = screen.getByLabelText('Nouvelle valeur')
    await utilisateur.clear(champ)
    await utilisateur.type(champ, `${valeur}{Enter}`)
  }

  it('le panneau des modifications prend la place du détail de la ligne', async () => {
    const utilisateur = userEvent.setup()
    monter({ passerellePreview: PREVIEW })
    await ouvrirEtEditer(utilisateur)
    // Avant toute modification, c'est le panneau de `10f` qui occupe la place.
    expect(screen.getByLabelText('Détail de la ligne')).toBeInTheDocument()

    await modifier(utilisateur)

    // **Un seul panneau droit, dont le contenu suit l'écran** (`10f`). Les empiler donnerait deux
    // panneaux là où le mockup n'en montre qu'un ; en éditant, ce qu'on veut voir est ce qu'on a
    // changé.
    expect(await screen.findByLabelText('Modifications en attente de la table')).toBeInTheDocument()
    expect(screen.queryByLabelText('Détail de la ligne')).not.toBeInTheDocument()
  })

  it('le SQL du panneau vient du moteur, avec la clé primaire de l’introspection', async () => {
    const utilisateur = userEvent.setup()
    const previsualise = vi.fn(async () => 'BEGIN;\nUPDATE ...;\nCOMMIT;')
    monter({ passerellePreview: { previewUpdates: previsualise } })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    await waitFor(() => expect(previsualise).toHaveBeenCalled())
    const [, plan] = previsualise.mock.calls[0] as unknown as [unknown, UpdatePlan]
    expect(plan.schema).toBe('public')
    expect(plan.table).toBe('orders')
    // **La clé vient de l'introspection**, pas d'une convention sur le nom : une table dont la clé
    // s'appelle `uuid` produirait sinon un `WHERE` sur une colonne qui n'identifie rien.
    expect(plan.keyColumn).toBe('id')
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]?.column).toBe('status')
  })

  it('la clé du plan est celle de l’introspection, même quand elle ne s’appelle pas « id »', async () => {
    const utilisateur = userEvent.setup()
    const previsualise = vi.fn(async () => 'BEGIN;\nCOMMIT;')
    // **Le décor courant nomme sa clé `id`**, ce qui rend « deviner » et « lire l'introspection »
    // indistinguables — la règle 7 de `REPRISE.md`. Ici la clé s'appelle `uuid` : une table dont la
    // clé porte un autre nom n'est pas plus rare qu'une autre, et un `WHERE "id" = …` frapperait une
    // colonne qui n'existe pas.
    const premiere = DETAIL.columns[0]
    if (!premiere) throw new Error('le décor doit avoir une première colonne')
    const detailAvecUuid: TableDetail = {
      ...DETAIL,
      columns: [{ ...premiere, name: 'uuid' }, ...DETAIL.columns.slice(1)],
    }
    monter({
      passerelleDetail: { describeTable: vi.fn(async () => detailAvecUuid) },
      passerellePreview: { previewUpdates: previsualise },
    })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    await waitFor(() => expect(previsualise).toHaveBeenCalled())
    const [, plan] = previsualise.mock.calls[0] as unknown as [unknown, UpdatePlan]
    expect(plan.keyColumn).toBe('uuid')
  })

  it('sans SQL revenu, le panneau le dit au lieu d’en fabriquer un', async () => {
    const utilisateur = userEvent.setup()
    // La commande ne répond jamais : c'est l'état d'attente réel, pas une simulation d'échec.
    monter({ passerellePreview: { previewUpdates: () => new Promise(() => {}) } })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    expect(panneau).toHaveTextContent('prépare la requête')
    expect(panneau).not.toHaveTextContent('UPDATE')
  })

  it('la confirmation de retrait compte les modifications réellement en attente', async () => {
    const utilisateur = userEvent.setup()
    monter({ onDelete: async () => ({ leftoverSecrets: [] }) })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    await utilisateur.click(screen.getByRole('button', { name: 'Actions de analytics' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))

    // **Le compte vient de l'état réel des onglets**, pas d'une valeur injectée : c'est ce calcul
    // qui décide si l'utilisateur est averti d'une perte, et une prop de test ne l'exerce pas.
    expect(screen.getByRole('dialog', { name: /Retirer analytics/ })).toHaveTextContent(
      '1 modification en attente sera perdue',
    )
  })

  it('retirer la base efface aussi ses modifications en attente', async () => {
    const utilisateur = userEvent.setup()
    monter({ onDelete: async () => ({ leftoverSecrets: [] }) })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    expect(screen.getByRole('status', { name: 'Modifications en attente' })).toBeInTheDocument()

    await utilisateur.click(screen.getByRole('button', { name: 'Actions de analytics' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la connexion' }))

    expect(
      screen.queryByRole('status', { name: 'Modifications en attente' }),
    ).not.toBeInTheDocument()

    // **Et elles ne reviennent pas si l'on rouvre le même chemin.** C'est la vraie raison de purger
    // l'état : la disparition du bandeau ne prouve rien, l'onglet actif ayant changé. Des
    // modifications fantômes sur une base redéclarée s'appliqueraient à des lignes qu'on n'a jamais
    // vues.
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await screen.findByRole('grid')
    expect(
      screen.queryByRole('status', { name: 'Modifications en attente' }),
    ).not.toBeInTheDocument()
  })

  it('hors production, « Appliquer » écrit sans confirmation intermédiaire', async () => {
    const utilisateur = userEvent.setup()
    const ecrire = vi.fn(async () => ({ applied: 1, inverseSql: 'BEGIN;\nUPDATE …;\nCOMMIT;' }))
    monter({
      projects: PROJETS_DEV,
      passerellePreview: PREVIEW,
      passerelleApply: { applyChanges: ecrire },
    })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(ecrire).toHaveBeenCalledOnce())
    // Une confirmation sur chaque écriture de développement se transformerait en clic réflexe, et
    // c'est ainsi qu'une confirmation cesse de protéger quoi que ce soit.
    expect(screen.queryByRole('dialog', { name: /production/i })).not.toBeInTheDocument()
  })

  it('le plan envoyé porte la valeur attendue, qui détecte le conflit', async () => {
    const utilisateur = userEvent.setup()
    const ecrire = vi.fn(async () => ({ applied: 1, inverseSql: '' }))
    monter({
      projects: PROJETS_DEV,
      passerellePreview: PREVIEW,
      passerelleApply: { applyChanges: ecrire },
    })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))

    await waitFor(() => expect(ecrire).toHaveBeenCalled())
    const [, plan] = ecrire.mock.calls[0] as unknown as [unknown, UpdatePlan]
    // **Sans la clé `expected`, le `WHERE` ne détecte aucun conflit** et l'écriture écraserait le
    // travail d'un tiers en silence. C'est la garantie centrale de `11d`, et elle se joue ici.
    //
    // La valeur est `null` dans ce décor, et ce n'est pas un défaut : `created_at` y est nulle, et
    // `null` est une valeur attendue légitime — c'est même le cas que `is not distinct from` existe
    // pour traiter. On vérifie donc que la **clé est présente**, pas qu'elle est renseignée : un
    // `toBeTruthy` aurait exigé le contraire de ce que le décor contient.
    // La colonne modifiée porte `pending` : la valeur attendue est donc **renseignée**, et un code
    // qui cesserait de l'envoyer ferait tomber ce test.
    expect(plan.changes[0]?.expected).toBe('pending')
    expect(plan.keyColumn).toBe('id')
  })

  it('après succès, la grille est relue et les marques disparaissent', async () => {
    const utilisateur = userEvent.setup()
    const ecrire = vi.fn(async () => ({
      applied: 1,
      inverseSql: 'BEGIN;\nUPDATE inverse;\nCOMMIT;',
    }))
    const { lignes } = monter({
      projects: PROJETS_DEV,

      passerellePreview: PREVIEW,
      passerelleApply: { applyChanges: ecrire },
    })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    const readRows = lignes.readRows as unknown as ReturnType<typeof vi.fn>
    const lecturesAvant = readRows.mock.calls.length

    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))

    // **La valeur affichée doit venir de la base, pas de la saisie** : un `trigger`, une valeur par
    // défaut ou une troncature rendraient l'écran faux.
    await waitFor(() => expect(readRows.mock.calls.length).toBeGreaterThan(lecturesAvant))
    // Et le modèle vidé fait disparaître toutes les marques de `11b` d'un coup.
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'Modifications en attente' }),
      ).not.toBeInTheDocument(),
    )
    // À la place, de quoi défaire — et non un panneau vide.
    expect(screen.getByText(/SQL qui annule cette écriture/)).toBeInTheDocument()
  })

  it('un refus s’affiche dans le panneau et ne vide pas le modèle', async () => {
    const utilisateur = userEvent.setup()
    monter({
      projects: PROJETS_DEV,

      passerellePreview: PREVIEW,
      passerelleApply: {
        applyChanges: async () => {
          throw new Error('la ligne a changé depuis la lecture')
        },
      },
    })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('changé depuis la lecture')
    // **Les modifications restent** : les perdre sur un conflit obligerait à tout retaper, alors que
    // rien n'a été écrit.
    expect(screen.getByRole('status', { name: 'Modifications en attente' })).toBeInTheDocument()
  })

  it('en production, « Appliquer » demande une confirmation et n’écrit pas encore', async () => {
    const utilisateur = userEvent.setup()
    const ecrire = vi.fn(async () => ({ applied: 1, inverseSql: '' }))
    // Le décor par défaut est en `prod` : c'est le cas qui compte ici.
    monter({ passerellePreview: PREVIEW, passerelleApply: { applyChanges: ecrire } })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    const panneau = await screen.findByLabelText('Modifications en attente de la table')
    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))

    // **Rien n'est parti.** C'est le garde-fou central de `11d`, et aucun test ne le couvrait : le
    // désactiver laissait la suite entièrement verte.
    expect(ecrire).not.toHaveBeenCalled()
    const confirmation = screen.getByRole('dialog', { name: 'Écrire en production' })
    // Elle **récapitule** au lieu de demander « êtes-vous sûr ? » : c'est ce qui permet de
    // s'apercevoir qu'on s'est trompé de table, ou qu'on touche vingt lignes au lieu d'une.
    expect(confirmation).toHaveTextContent('public.orders')
    expect(confirmation).toHaveTextContent('status')
    expect(confirmation).toHaveTextContent('1 UPDATE')
  })

  it('la confirmation de production écrit, et l’annuler n’écrit rien', async () => {
    const utilisateur = userEvent.setup()
    const ecrire = vi.fn(async () => ({ applied: 1, inverseSql: '' }))
    monter({ passerellePreview: PREVIEW, passerelleApply: { applyChanges: ecrire } })
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    const panneau = await screen.findByLabelText('Modifications en attente de la table')

    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(ecrire).not.toHaveBeenCalled()
    // Les modifications survivent au renoncement : rien n'a été écrit, rien n'a été perdu.
    expect(screen.getByRole('status', { name: 'Modifications en attente' })).toBeInTheDocument()

    await utilisateur.click(within(panneau).getByRole('button', { name: /Appliquer/ }))
    await utilisateur.click(screen.getByRole('button', { name: 'Écrire en production' }))
    await waitFor(() => expect(ecrire).toHaveBeenCalledOnce())
  })

  it('⌘E bascule, et le rappel de la barre d’état suit', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await screen.findByRole('grid')

    // `10c` avait retiré ce rappel faute d'écran qui y réponde ; il répond maintenant.
    expect(screen.getByRole('status', { name: 'État de la table' })).toHaveTextContent(
      '⌘E pour éditer',
    )
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument()

    await utilisateur.keyboard('{Meta>}e{/Meta}')
    expect(screen.getByRole('status', { name: 'État de la table' })).toHaveTextContent('édition')
    expect(screen.getAllByRole('button', { name: /Modifier/ }).length).toBeGreaterThan(0)
  })

  it('sans modification, aucun bandeau', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    // Un bandeau à « 0 modification » occuperait 34 px pour ne rien dire.
    expect(screen.queryByText(/modification.* en attente sur/)).not.toBeInTheDocument()
  })

  it('les quatre affichages du compte suivent le même modèle', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    // 1. le bandeau
    expect(await screen.findByText(/1 modification en attente sur/)).toBeInTheDocument()
    // 2. la barre d'état
    expect(screen.getByRole('status', { name: 'État de la table' })).toHaveTextContent(
      '1 modification en attente',
    )
    // 3. le badge de la pastille projet
    expect(screen.getByRole('button', { name: /Édition/ })).toBeInTheDocument()
    // 4. la pastille de l'arbre, à la place du compte de lignes
    const ligne = screen.getByRole('treeitem', { name: /^orders/ })
    expect(ligne).toHaveTextContent('1')
  })

  it('⌘Z retire la modification, et les quatre affichages suivent', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    await screen.findByText(/1 modification en attente sur/)

    await utilisateur.keyboard('{Meta>}z{/Meta}')

    // Un compteur tenu à part divergerait ici.
    await waitFor(() =>
      expect(screen.queryByText(/modification.* en attente sur/)).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: /Édition/ })).not.toBeInTheDocument()
  })

  it('« Tout annuler » vide le modèle', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    await screen.findByText(/1 modification en attente sur/)

    // **Deux boutons portent ce nom depuis `11c`** — celui du bandeau et celui du pied du panneau —
    // et le mockup montre bien les deux. On cible celui du bandeau ; l'autre est couvert par les
    // tests de `PendingPanel`.
    const bandeau = screen.getByRole('status', { name: 'Modifications en attente' })
    await utilisateur.click(within(bandeau).getByRole('button', { name: 'Tout annuler' }))

    await waitFor(() =>
      expect(screen.queryByText(/modification.* en attente sur/)).not.toBeInTheDocument(),
    )
  })

  it('quitter le mode édition **garde** les modifications en attente', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)
    await screen.findByText(/1 modification en attente sur/)

    await utilisateur.keyboard('{Meta>}e{/Meta}')

    // Les perdre sur une frappe serait le défaut qu'`esc` fermant une modale pleine a produit.
    expect(screen.getByText(/1 modification en attente sur/)).toBeInTheDocument()
    // Mais plus aucune cellule ne s'ouvre.
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument()
  })

  it('la colonne modifiée est annotée dans la sidebar', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    await modifier(utilisateur)

    const section = (await screen.findByText('Colonnes de orders')).parentElement as HTMLElement
    // « modifié » prime sur le type et sur « tri ↓ » : c'est l'état qui attend une action.
    await waitFor(() => expect(within(section).getByText('modifié')).toBeInTheDocument())
  })

  it('le mode est par onglet : basculer l’un ne bascule pas l’autre', async () => {
    const utilisateur = userEvent.setup()
    monter()
    await ouvrirEtEditer(utilisateur)
    expect(screen.getAllByRole('button', { name: /Modifier/ }).length).toBeGreaterThan(0)

    // Ouvrir un second onglet : il n'a aucune raison d'être en édition.
    await utilisateur.click(screen.getByRole('treeitem', { name: /order_items/ }))
    await screen.findByRole('grid')
    expect(screen.queryByRole('button', { name: /Modifier/ })).not.toBeInTheDocument()
  })

  it('retirer une base ferme ses onglets, et seulement les siens', async () => {
    const utilisateur = userEvent.setup()
    monter({ onDelete: async () => ({ leftoverSecrets: [] }) })
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))
    await utilisateur.click(await screen.findByRole('treeitem', { name: /order_items/ }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await utilisateur.click(screen.getByRole('button', { name: 'Actions de analytics' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la connexion' }))

    // **Un onglet survivant lirait une base dont la déclaration est partie** : au mieux une erreur,
    // au pire une lecture sur une connexion que le registre ne sait plus nommer.
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('annuler la confirmation ne ferme aucun onglet', async () => {
    const utilisateur = userEvent.setup()
    monter({ onDelete: async () => ({ leftoverSecrets: [] }) })
    await ouvrirLArbreJusquAuSchema(utilisateur)
    await utilisateur.click(await screen.findByRole('treeitem', { name: /^orders/ }))

    await utilisateur.click(screen.getByRole('button', { name: 'Actions de analytics' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Retirer de DoraBase…' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Annuler' }))

    // Annuler ne ferme rien : la confirmation est la dernière chance de renoncer.
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })
})
