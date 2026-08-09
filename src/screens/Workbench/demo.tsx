import type { Project } from '../../domain/config'
import type { SchemaInfo, TableDetail, TableSummary } from '../../domain/engine'
import type { PasserelleArbre } from './useArbre'
import type { PasserelleDetail } from './useDetailTable'
import { Workbench } from './Workbench'

/**
 * L'écran de travail sur des données figées, **en développement seulement**.
 *
 * Il existe pour une raison précise : Playwright pilote Chromium, où le pont Tauri ne répond
 * pas. Sans ce montage, l'écran de travail ne serait vérifiable qu'en galerie — exactement le
 * trou que `10b` corrige pour `A4`. Un test qui part de `/` doit donc pouvoir atteindre l'écran
 * sans base réelle.
 *
 * Monté derrière **deux** conditions, comme la galerie : `import.meta.env.DEV` ET `?demo` dans
 * l'URL. `import.meta.env.DEV` devient `false` à la construction de production, et le bloc
 * entier est élagué.
 */

const PROJETS: Project[] = [
  {
    name: 'Atelier Nord',
    activeEnvironment: 'prod',
    databases: [
      {
        name: 'analytics',
        engine: 'postgresql',
        variants: [
          {
            environment: 'prod',
            host: 'localhost',
            port: 5432,
            defaultDatabase: 'analytics',
            username: 'dorabase',
            password: null,
            sslMode: 'prefer',
            readOnly: true,
            reconnectOnStartup: false,
            tunnel: null,
          },
        ],
      },
    ],
  },
  { name: 'Outils internes', activeEnvironment: 'dev', databases: [] },
]

const SCHEMAS: SchemaInfo[] = [
  { name: 'public', counts: { tables: 3, views: 1, functions: 0, indexes: 4 } },
]

const objet = (name: string, over: Partial<TableSummary> = {}): TableSummary => ({
  name,
  kind: 'table',
  rows: { kind: 'estimated', value: 1_904_220 },
  sizeBytes: 2.1 * 1024 ** 3,
  columnCount: 18,
  primaryKey: 'id',
  lastAnalyze: '2026-08-06 04:12',
  comment: null,
  ...over,
})

const OBJETS: TableSummary[] = [
  objet('orders'),
  objet('order_items', { rows: { kind: 'estimated', value: 6_400_000 } }),
  objet('users', { rows: { kind: 'estimated', value: 92_800 } }),
  objet('orders_daily', { kind: 'view', rows: { kind: 'estimated', value: 0 }, primaryKey: null }),
]

const DETAIL: TableDetail = {
  schema: 'public',
  name: 'orders',
  rows: { kind: 'estimated', value: 1_904_220 },
  sizeBytes: 2.1 * 1024 ** 3,
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
      name: 'user_id',
      typeName: 'int8',
      category: 'number',
      nullable: false,
      default: null,
      key: 'foreign',
      comment: null,
    },
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
    {
      position: 4,
      name: 'total_cents',
      typeName: 'int4',
      category: 'number',
      nullable: false,
      default: null,
      key: null,
      comment: null,
    },
    {
      position: 5,
      name: 'currency',
      typeName: 'bpchar',
      category: 'text',
      nullable: false,
      default: null,
      key: null,
      comment: null,
    },
    {
      position: 6,
      name: 'created_at',
      typeName: 'timestamptz',
      category: 'timestamp',
      nullable: false,
      default: null,
      key: null,
      comment: null,
    },
    {
      position: 7,
      name: 'shipped_at',
      typeName: 'timestamptz',
      category: 'timestamp',
      nullable: true,
      default: null,
      key: null,
      comment: null,
    },
    {
      position: 8,
      name: 'coupon_code',
      typeName: 'text',
      category: 'text',
      nullable: true,
      default: null,
      key: null,
      comment: null,
    },
  ],
  indexes: [],
  constraints: [],
  triggers: [],
  relations: [
    {
      constraintName: 'orders_user_id_fkey',
      direction: 'outgoing',
      columns: ['user_id'],
      targetSchema: 'public',
      targetTable: 'users',
      targetColumns: ['id'],
    },
  ],
  ddl: 'CREATE TABLE public.orders (…);',
}

const PASSERELLE: PasserelleArbre = {
  openDatabase: async () => ({
    kind: 'connected',
    serverVersion: 'PostgreSQL 17.6',
    tunnelLocalPort: null,
  }),
  closeDatabase: async () => {},
  connectionStates: async () => [
    {
      key: { project: 'Atelier Nord', database: 'analytics', environment: 'prod' },
      state: { kind: 'connected', serverVersion: 'PostgreSQL 17.6', tunnelLocalPort: null },
    },
  ],
  listSchemas: async () => SCHEMAS,
  listObjects: async () => OBJETS,
}

const PASSERELLE_DETAIL: PasserelleDetail = { describeTable: async () => DETAIL }

export function WorkbenchDemo() {
  return (
    <Workbench projects={PROJETS} passerelle={PASSERELLE} passerelleDetail={PASSERELLE_DETAIL} />
  )
}
