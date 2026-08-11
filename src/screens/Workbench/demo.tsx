import { useState } from 'react'
import type { Database, Project } from '../../domain/config'
import type { SchemaInfo, TableDetail, TableSummary } from '../../domain/engine'
import { NewConnection } from '../NewConnection/NewConnection'
import type { PasserelleLignes } from '../TableView/useLignes'
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
  // Assez de tables pour que la bande d'onglets déborde : c'est ce qui a révélé, le 10 août 2026,
  // qu'elle passait **sous** « Données / Structure » au lieu de défiler.
  objet('flyway_schema_history'),
  objet('catalogue_session'),
  objet('intervals_connection'),
  objet('prescribed_session'),
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

const DETAIL_USERS: TableDetail = {
  ...DETAIL,
  name: 'users',
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
      name: 'email',
      typeName: 'text',
      category: 'text',
      nullable: false,
      default: null,
      key: null,
      comment: null,
    },
    {
      position: 3,
      name: 'name',
      typeName: 'text',
      category: 'text',
      nullable: true,
      default: null,
      key: null,
      comment: null,
    },
  ],
  relations: [],
}

const PASSERELLE_DETAIL: PasserelleDetail = {
  describeTable: async (_cle, _schema, table) => (table === 'users' ? DETAIL_USERS : DETAIL),
}

/**
 * Cinq cents lignes — le palier par défaut de `RowLimit`, et ce que la barre d'état de `A5`
 * affiche dans le mockup. La table prétendue en compte 1,9 million : la fenêtre est justement
 * ce qui les sépare.
 */
const LIGNES = Array.from({ length: 500 }, (_, i) => [
  { kind: 'int' as const, value: 184_220 - i },
  { kind: 'int' as const, value: 44_019 + i * 7 },
  { kind: 'text' as const, value: ['paid', 'pending', 'refunded', 'cancelled'][i % 4] ?? 'paid' },
  { kind: 'int' as const, value: 12_900 - i * 3 },
  { kind: 'text' as const, value: 'EUR' },
  { kind: 'timestamp' as const, value: '2026-07-31 09:41:02' },
  i % 3 === 0
    ? { kind: 'null' as const }
    : { kind: 'timestamp' as const, value: '2026-07-31 11:02:10' },
  i % 2 === 0 ? { kind: 'null' as const } : { kind: 'text' as const, value: 'SUMMER26' },
])

const PASSERELLE_LIGNES: PasserelleLignes = {
  readRows: async (_cle, requete) => ({
    offset: 0,
    // Une requête filtrée sur une seule clé est celle de l'aperçu de ligne liée : elle rend la
    // ligne de `users`, dont `email` et `name` sont détectables.
    rows:
      requete.table === 'users'
        ? [
            [
              { kind: 'int', value: 90_233 },
              { kind: 'text', value: 'marie.l@example.com' },
              { kind: 'text', value: 'Marie Lefèvre' },
            ],
          ]
        : LIGNES,
    total: { kind: 'estimated', value: 1_904_220 },
    sql: `select * from ${requete.schema}.${requete.table} limit 500 offset 0`,
    durationMs: 41,
  }),
}

/**
 * L'`INSERT` de démonstration.
 *
 * En production, ce SQL vient de Rust : citer les identifiants et littéraliser les valeurs
 * demande de connaître les règles du moteur. Ici, une chaîne figée suffit — la démo vérifie le
 * câblage, pas la génération, que les tests Rust exercent contre la vraie base.
 */
const rowAsInsert = async () =>
  'INSERT INTO "public"."orders" ("id", "user_id", "status")\nVALUES (184220, 44019, \'paid\');'

export function WorkbenchDemo() {
  // **La démo monte `A2` en mode édition**, et ce n'est pas de la décoration. Elle se contentait
  // d'inscrire la cible dans le titre du document, ce qui vérifiait un *proxy* du chemin : un test
  // vert sur `document.title` n'aurait rien dit de la modale — le piège d'`A4`, qui n'existait que
  // dans la galerie. Les commandes du formulaire ne répondent pas en Chromium ; ce qui se vérifie
  // ici est qu'il s'ouvre, et sur la bonne base.
  const [edition, setEdition] = useState<{ project: string; database: Database } | null>(null)

  return (
    <>
      {edition && <NewConnection edition={edition} onClose={() => setEdition(null)} />}
      <Workbench
        projects={PROJETS}
        passerelle={PASSERELLE}
        passerelleDetail={PASSERELLE_DETAIL}
        passerelleLignes={PASSERELLE_LIGNES}
        rowAsInsert={rowAsInsert}
        // `?demo` ouvre l'écran en **mode édition** : c'est le seul moyen de voir `A6` sans base
        // réelle, Playwright ne pilotant pas le pont Tauri.
        onEditDatabase={(projet, base) => setEdition({ project: projet, database: base })}
        // La démo renomme **pour de faux** : le pont ne répond pas en Chromium. Ce qui se vérifie ici
        // est le chemin jusqu'à la modale, et le rapport qu'elle sait afficher — d'où un secret
        // introuvable annoncé, cas que la commande réelle produit sur un Trousseau nettoyé à la main.
        // La démo retire **pour de faux** — le pont ne répond pas en Chromium. Un mot de passe
        // résiduel est annoncé : le cas que la commande réelle produit sur un Trousseau verrouillé.
        onDelete={async () => ({ leftoverSecrets: ['Atelier Nord/analytics/prod'] })}
        onRenameProject={async (projet) => ({
          missingSecrets: [`${projet}/analytics/prod`],
          leftoverSecrets: [],
        })}
      />
    </>
  )
}
