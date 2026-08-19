import { render, screen, waitFor, within } from '@testing-library/react'
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

const CLE: DatabaseKey = { project: 'Halle', database: 'analytics', environment: 'prod' }

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
  // **Une colonne nulle et une valeur longue, délibérément.** Sans elles, deux mesures de `10f` ne
  // mordraient pas : celle qui distingue « `NULL` affiché » de « chaîne vide copiée », et celle qui
  // vérifie que l'aperçu montre en entier ce que l'ellipse a coupé.
  colonne('shipped_at', { category: 'timestamp', nullable: true }),
  colonne('reference'),
]

const RELATION: Relation = {
  constraintName: 'orders_user_id_fkey',
  direction: 'outgoing',
  columns: ['user_id'],
  targetSchema: 'public',
  targetTable: 'users',
  targetColumns: ['id'],
}

const REFERENCE_LONGUE = '041ff6ac-ca09-4c57-b1fe-e4055c074abf-suite-qui-deborde-de-la-colonne'

const LIGNE: Value[] = [
  { kind: 'int', value: 184_220 },
  { kind: 'int', value: 90_233 },
  { kind: 'text', value: 'paid' },
  { kind: 'null' },
  { kind: 'text', value: REFERENCE_LONGUE },
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

  it('le bouton copie le JSON de la ligne, reparsable et complet', async () => {
    const utilisateur = userEvent.setup()
    const columnsAttendues = COLONNES.length
    // Le paramètre est typé : sans lui, `mock.calls[0]` est un tuple vide et l'accès à `[0]` ne
    // compile pas — `pnpm typecheck` l'a dit, `pnpm vitest` non (défaut n° 50).
    const writeText = vi.fn(async (_texte: string) => {})
    // `navigator.clipboard` n'a qu'un accesseur sous jsdom : `Object.assign` échoue, il faut
    // redéfinir la propriété.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    monter()

    await utilisateur.click(screen.getByRole('tab', { name: 'JSON' }))
    await utilisateur.click(screen.getByRole('button', { name: 'Copier le JSON de la ligne' }))

    const copie = writeText.mock.calls[0]?.[0] ?? ''
    // Le JSON copié se reparse, avec les types de la ligne : c'est la propriété qui compte pour un
    // texte destiné à être recollé ailleurs.
    expect(JSON.parse(copie)).toMatchObject({ id: 184220, status: 'paid' })
    // Et l'objet est **entier** — les huit colonnes, pas celles qui tiennent à l'écran.
    expect(Object.keys(JSON.parse(copie))).toHaveLength(columnsAttendues)

    // **Ce que ce test ne prouve pas.** Le bouton copie le texte source plutôt que le rendu de
    // `JsonColore` — un choix, puisque le rendu est découpé en `<span>` pour la coloration. Mais un
    // sabotage qui copie `textContent` du bloc affiché **passe** : `textContent` recolle les fragments
    // à l'identique. La distinction n'est donc pas observable ici, et prétendre le contraire dans un
    // commentaire de test serait une garantie inventée.
  })

  /** Le presse-papiers, remplacé par un espion. */
  function espionnerLePressePapiers() {
    const writeText = vi.fn(async (_texte: string) => {})
    // `navigator.clipboard` n'a qu'un accesseur sous jsdom : `Object.assign` échoue, il faut
    // redéfinir la propriété.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
  }

  /** La cellule de valeur d'un champ, par le nom de sa colonne. */
  function valeurDe(colonne: string) {
    const champ = screen.getByText(colonne).parentElement as HTMLElement
    return champ.querySelector('dd') as HTMLElement
  }

  it('le clic droit sur la valeur copie la valeur, telle qu’elle s’affiche', async () => {
    const utilisateur = userEvent.setup()
    const writeText = espionnerLePressePapiers()
    monter()

    await utilisateur.pointer({ target: valeurDe('status'), keys: '[MouseRight]' })

    const menu = screen.getByRole('menu', { name: /la valeur de status/ })
    await utilisateur.click(within(menu).getByRole('menuitem', { name: 'Copier la valeur' }))
    expect(writeText).toHaveBeenCalledWith('paid')
  })

  it('le clic droit sur la clé copie la clé, et le libellé le dit', async () => {
    const utilisateur = userEvent.setup()
    const writeText = espionnerLePressePapiers()
    monter()

    await utilisateur.pointer({ target: screen.getByText('status'), keys: '[MouseRight]' })

    // **Le libellé nomme ce qui sera copié**, pas l'endroit du clic : un libellé unique obligerait à
    // se souvenir de ce qu'on visait.
    const menu = screen.getByRole('menu', { name: /la clé de status/ })
    await utilisateur.click(within(menu).getByRole('menuitem', { name: 'Copier la clé' }))
    expect(writeText).toHaveBeenCalledWith('status')
  })

  it('la valeur copiée est celle qu’on lit, `NULL` comprise', async () => {
    const utilisateur = userEvent.setup()
    const writeText = espionnerLePressePapiers()
    monter()

    // **Le cas qui distingue « ce qu'on lit » de « la valeur brute ».** Une cellule nulle affiche
    // `NULL` ; copier une chaîne vide donnerait un presse-papiers qui ne dit pas la même chose que
    // l'écran, et coller ce vide dans une requête produirait autre chose que ce qui était visé.
    await utilisateur.pointer({ target: valeurDe('shipped_at'), keys: '[MouseRight]' })
    await utilisateur.click(screen.getByRole('menuitem', { name: 'Copier la valeur' }))
    expect(writeText).toHaveBeenCalledWith('NULL')
  })

  it('le menu se referme sur `Échap` sans rien copier', async () => {
    const utilisateur = userEvent.setup()
    const writeText = espionnerLePressePapiers()
    monter()

    await utilisateur.pointer({ target: valeurDe('status'), keys: '[MouseRight]' })
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await utilisateur.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('le bouton de copie n’apparaît pas sur les autres onglets', async () => {
    const utilisateur = userEvent.setup()
    monter()
    // Sur Champs, il n'y a pas de JSON à copier — et un bouton qui copierait « la ligne » depuis un
    // onglet qui ne la montre pas en JSON serait une promesse sur un format invisible.
    expect(screen.queryByRole('button', { name: 'Copier le JSON de la ligne' })).toBeNull()

    await utilisateur.click(screen.getByRole('tab', { name: 'Liens' }))
    expect(screen.queryByRole('button', { name: 'Copier le JSON de la ligne' })).toBeNull()
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
