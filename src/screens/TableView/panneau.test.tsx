import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type {
  ColumnInfo,
  DatabaseKey,
  Relation,
  RowQuery,
  TableDetail,
  Value,
} from '../../domain/engine'
import type { PasserelleDetail } from '../Workbench/useDetailTable'
import { RowPanel } from './RowPanel'
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
  colonne('user_id', { category: 'number', key: 'foreign' }),
  colonne('status'),
]

const RELATION: Relation = {
  constraintName: 'orders_user_id_fkey',
  direction: 'outgoing',
  columns: ['user_id'],
  targetSchema: 'public',
  targetTable: 'users',
  targetColumns: ['id'],
}

const LIGNE: Value[] = [
  { kind: 'int', value: 184_220 },
  { kind: 'int', value: 90_233 },
  { kind: 'text', value: 'paid' },
]

function detail(colonnesCible: ColumnInfo[]): TableDetail {
  return {
    schema: 'public',
    name: 'users',
    rows: { kind: 'estimated', value: 100 },
    sizeBytes: null,
    comment: null,
    columns: colonnesCible,
    indexes: [],
    constraints: [],
    triggers: [],
    relations: [],
    ddl: '',
  }
}

type Options = {
  /** Les colonnes de la table **cible**, qui décident si l'aperçu est autorisé. */
  colonnesCible?: ColumnInfo[]
  relations?: Relation[]
  columns?: ColumnInfo[]
  ligne?: Value[] | null
  rang?: number | null
  total?: number
  onCopyInsert?: () => void
  onNavigate?: (rang: number) => void
}

function monter({
  colonnesCible = [colonne('id'), colonne('email')],
  relations = [RELATION],
  columns = COLONNES,
  ligne = LIGNE,
  rang = 1,
  onCopyInsert,
}: Options = {}) {
  const readRows = vi.fn(async (_cle: DatabaseKey, _requete: RowQuery) => ({
    offset: 0,
    rows: [
      [
        { kind: 'int' as const, value: 90_233 },
        { kind: 'text' as const, value: 'marie.l@example.com' },
      ],
    ],
    total: null,
    sql: 'select …',
    durationMs: 41,
  }))
  const describeTable = vi.fn(async () => detail(colonnesCible))

  const rendu = render(
    <>
      <Sprite />
      <RowPanel
        cle={CLE}
        columns={columns}
        relations={relations}
        ligne={ligne}
        rang={rang}
        onCopyInsert={onCopyInsert}
        passerelleDetail={{ describeTable } as unknown as PasserelleDetail}
        passerelleLignes={{ readRows } as unknown as PasserelleLignes}
      />
    </>,
  )
  return { readRows, describeTable, rendu }
}

describe('panneau de ligne', () => {
  it('sans sélection, il ne rend rien du tout', () => {
    const { rendu } = monter({ ligne: null, rang: null })
    // **Rien, et non une phrase.** « Sélectionnez une ligne pour en voir le détail. » y était ; depuis
    // `22`, l'en-tête permanent de la colonne rend celle-ci lisible sans elle, et une phrase qui
    // décrit un geste évident finit par se lire comme du remplissage. C'est le cadre qui est vérifié
    // dans `ColonneDroite.test.tsx` : l'en-tête, lui, reste.
    expect(rendu.container.querySelector('aside')).toBeNull()
  })

  // **Trois tests ont disparu avec l'en-tête, et non été « adaptés ».** Ils vérifiaient que le titre
  // nomme le rang et la clé primaire, et qu'une table sans clé primaire n'invente pas d'identifiant.
  // Ce titre n'existe plus (`22`) : le rang est dans la gouttière `#` de la grille, l'identifiant est
  // la première valeur du corps. Les flèches, elles, sont mesurées dans `ColonneDroite.test.tsx`.

  it('l’onglet JSON rend la ligne en objet typé', async () => {
    const utilisateur = userEvent.setup()
    monter()

    await utilisateur.click(screen.getByRole('tab', { name: 'JSON' }))
    // Le texte du **bloc**, et non d'un fragment : `JsonColore` découpe le JSON en `<span>` pour
    // le colorer, donc chercher par texte ne trouverait qu'un jeton.
    const bloc = screen.getByLabelText('Détail de la ligne 1').querySelector('pre')
    // Un nombre reste un nombre : un JSON dont tout serait chaîne ne se recollerait nulle part.
    expect(bloc?.textContent).toContain('"id": 184220')
    expect(bloc?.textContent).toContain('"status": "paid"')
  })

  it('l’onglet Liens rend les relations de la table', async () => {
    const utilisateur = userEvent.setup()
    monter()

    await utilisateur.click(screen.getByRole('tab', { name: 'Liens' }))
    expect(screen.getByText('user_id → users.id')).toBeInTheDocument()
  })
})

describe('règle « ligne liée »', () => {
  it('affiche l’aperçu quand la table cible porte un champ lisible', async () => {
    monter({ colonnesCible: [colonne('id'), colonne('email')] })

    expect(await screen.findByText(/Ligne liée · users/)).toBeInTheDocument()
    expect(screen.getByText('marie.l@example.com')).toBeInTheDocument()
    // La légende nomme les champs réellement détectés.
    expect(screen.getByText(/email détecté/)).toBeInTheDocument()
  })

  it('n’affiche **aucun** aperçu quand la table cible n’a que des identifiants techniques', async () => {
    // **Le bord qui compte, et celui qu'on oublie de tester.** Un aperçu automatique qui déverse
    // une ligne référencée transforme un clic distrait en fuite de données.
    const { readRows } = monter({ colonnesCible: [colonne('id'), colonne('tenant_id')] })

    await waitFor(() => expect(screen.getByLabelText('Détail de la ligne 1')).toBeInTheDocument())
    expect(screen.queryByText(/Ligne liée/)).not.toBeInTheDocument()

    // Et surtout : la ligne cible n'a **pas été lue**. La règle s'applique avant la lecture, pas
    // après — sinon les données auraient traversé l'IPC pour être ensuite masquées.
    expect(readRows).not.toHaveBeenCalled()
  })

  it('sans clé étrangère, aucun aperçu et aucune lecture supplémentaire', async () => {
    const { describeTable } = monter({ relations: [] })

    await waitFor(() => expect(screen.getByLabelText('Détail de la ligne 1')).toBeInTheDocument())
    expect(screen.queryByText(/Ligne liée/)).not.toBeInTheDocument()
    expect(describeTable).not.toHaveBeenCalled()
  })
})

describe('copier en INSERT', () => {
  it('le bouton délègue, il ne compose pas le SQL', async () => {
    const utilisateur = userEvent.setup()
    const onCopyInsert = vi.fn()
    monter({ onCopyInsert })

    await utilisateur.click(screen.getByRole('button', { name: /Copier la ligne en INSERT/ }))
    expect(onCopyInsert).toHaveBeenCalledTimes(1)
  })

  it('sans commande, le bouton n’est pas rendu', () => {
    monter()
    expect(screen.queryByRole('button', { name: /Copier la ligne/ })).not.toBeInTheDocument()
  })
})
