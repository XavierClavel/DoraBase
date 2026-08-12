import { invoke } from '@tauri-apps/api/core'
import type { ConfigLoad, EnvironmentVariant, Project } from '../domain/config'
import type {
  ApplyOutcome,
  ConnectionState,
  ConnectionStateEntry,
  DatabaseKey,
  QueryPlan,
  QueryResult,
  RowLimit,
  RowQuery,
  RowWindow,
  SchemaInfo,
  TableDetail,
  TableSummary,
  UpdatePlan,
  Value,
} from '../domain/engine'

/**
 * Les commandes du câblage de `09b`, en un seul point de contact avec l'IPC.
 *
 * **Regroupées ici** plutôt que dispersées : chaque écran qui appellerait `invoke` directement
 * dupliquerait le nom de la commande et la forme de ses arguments, que rien ne vérifie. Ici, le
 * nom apparaît une fois, et le typage vient des projections de `ts-rs`.
 *
 * Chacune est **injectable** dans les composants qui l'emploient, pour la même raison qu'en
 * `08d` : le pont ne répond pas hors de la webview, et ce qui est testable est le câblage.
 */

/** Lit la configuration. Ses quatre issues sont distinctes, et `09b` les traite toutes. */
export async function loadConfig(): Promise<ConfigLoad> {
  return invoke<ConfigLoad>('load_config')
}

export async function openDatabase(
  key: DatabaseKey,
  variant: EnvironmentVariant,
): Promise<ConnectionState> {
  return invoke<ConnectionState>('open_database', { key, variant })
}

export async function closeDatabase(key: DatabaseKey): Promise<void> {
  return invoke<void>('close_database', { key })
}

/**
 * Les états de toutes les connexions connues, en **triplets** et non en table indexée.
 *
 * Le registre s'indexe bien par `projet/base/environnement`, mais rendre cette chaîne au front
 * l'obligerait à savoir la recomposer — donc à dupliquer la convention. Une première version le
 * faisait ; le test qui devait vérifier l'accord des deux implémentations a montré qu'il valait
 * mieux n'en avoir qu'une.
 */
export async function connectionStates(): Promise<ConnectionStateEntry[]> {
  return invoke<ConnectionStateEntry[]>('connection_states')
}

export async function listSchemas(key: DatabaseKey): Promise<SchemaInfo[]> {
  return invoke<SchemaInfo[]>('list_schemas', { key })
}

export async function listObjects(key: DatabaseKey, schema: string): Promise<TableSummary[]> {
  return invoke<TableSummary[]>('list_objects', { key, schema })
}

export async function describeTable(
  key: DatabaseKey,
  schema: string,
  table: string,
): Promise<TableDetail> {
  return invoke<TableDetail>('describe_table', { key, schema, table })
}

/**
 * Une **fenêtre** de lignes — jamais un jeu complet.
 *
 * `RowQuery.limit` est une énumération fermée (`RowLimit`) : « demander tout » n'est pas
 * exprimable, et la contrainte IPC transverse tient donc par le type. `06d` avait livré la
 * lecture ; `10c` a ajouté la commande, qui manquait.
 */
export async function readRows(key: DatabaseKey, query: RowQuery): Promise<RowWindow> {
  return invoke<RowWindow>('read_rows', { key, query })
}

/**
 * Une ligne rendue en `INSERT` exécutable, que `A5` copie (`10f`).
 *
 * **Composé côté Rust**, où vit la connaissance du moteur : citer les identifiants et
 * littéraliser les valeurs demanderait au JavaScript de connaître les règles de sept moteurs — le
 * couplage que le projet a déjà refusé pour la clé de base (`09b`) et la référence de secret
 * (`08e`). Le presse-papiers, lui, reste côté front : c'est une API de la webview.
 */
export async function rowAsInsert(
  key: DatabaseKey,
  schema: string,
  table: string,
  values: readonly Value[],
): Promise<string> {
  return invoke<string>('row_as_insert', { key, schema, table, values })
}

/**
 * Le SQL qu'`Appliquer` exécutera, rendu par le moteur (`11c`).
 *
 * **Même arbitrage que `rowAsInsert`, et une raison de plus** : le panneau annonce « SQL qui sera
 * exécuté ». S'il n'est pas exactement celui qui partira, il est pire qu'absent — c'est le dernier
 * endroit où l'on vérifie avant d'écrire en production. `11d` exécutera cette suite.
 */
export async function previewUpdates(key: DatabaseKey, plan: UpdatePlan): Promise<string> {
  return invoke<string>('preview_updates', { key, plan })
}

/**
 * **La première écriture du projet** (`11d`). Tout le reste, depuis `01`, est en lecture.
 *
 * Le SQL exécuté est celui que `11c` a montré — la même fonction le produit côté moteur, et il n'y a
 * qu'un texte. Rend le nombre de lignes écrites et le SQL qui les défait.
 */
export async function applyChanges(key: DatabaseKey, plan: UpdatePlan): Promise<ApplyOutcome> {
  return invoke<ApplyOutcome>('apply_changes', { key, plan })
}

/**
 * Exécute le SQL **écrit par l'utilisateur** (`12c`).
 *
 * La limite est ajoutée par le moteur aux requêtes qui rendent des lignes et n'en portent pas, et
 * **rendue** dans `appliedLimit` : une limite silencieuse ferait croire à une table de mille lignes.
 */
/**
 * Le plan d'exécution d'une requête (`12e`), **sans l'exécuter**.
 *
 * `EXPLAIN` et non `EXPLAIN ANALYZE` : ce dernier exécute la requête pour la mesurer, et sur une
 * console où l'on écrit aussi, « Expliquer » deviendrait un bouton qui écrit.
 */
export async function explainSql(key: DatabaseKey, sql: string): Promise<QueryPlan> {
  return invoke<QueryPlan>('explain_sql', { key, sql })
}

export async function runSql(key: DatabaseKey, sql: string, limit: RowLimit): Promise<QueryResult> {
  return invoke<QueryResult>('run_sql', { key, sql, limit })
}

/**
 * La clé d'une base, composée **côté Rust**.
 *
 * Le front envoie les trois chaînes ; c'est `registry::cle` qui les assemble. Composer ici
 * dupliquerait la convention, et une convention dupliquée diverge — le même arbitrage qu'en
 * `08e` pour la référence de secret.
 */
export function databaseKey(project: string, database: string, environment: string): DatabaseKey {
  return { project, database, environment }
}

/**
 * L'état d'une base parmi les triplets rendus, `never` par défaut.
 *
 * `never` et non `offline` : afficher en rouge une base qu'on n'a pas ouverte serait faux, et
 * c'est ce que la décision « l'arbre se lit sans réseau » impose de distinguer.
 */
export function etatDe(
  entrees: readonly ConnectionStateEntry[],
  project: string,
  database: string,
  environment: string,
): ConnectionState {
  const trouve = entrees.find(
    (e) =>
      e.key.project === project && e.key.database === database && e.key.environment === environment,
  )
  return trouve?.state ?? { kind: 'never' }
}

/**
 * Les projets d'une issue de lecture, et ce qu'il faut en dire.
 *
 * **Les quatre issues ne se réduisent pas à « des projets ou rien ».** Un fichier illisible ou
 * d'une version trop récente n'a pas zéro projet : il a des projets qu'on ne sait pas lire, et
 * l'écriture est bloquée (`05b`). Les présenter comme « aucun projet » inviterait à en créer un,
 * ce qui écraserait le fichier qu'on vient de refuser d'ouvrir.
 */
export type EtatDeConfiguration =
  | { kind: 'fresh'; projects: Project[] }
  | { kind: 'loaded'; projects: Project[] }
  | { kind: 'blocked'; projects: Project[]; reason: string; quarantinedTo?: string }

export function interpreter(issue: ConfigLoad): EtatDeConfiguration {
  switch (issue.kind) {
    case 'fresh':
      return { kind: 'fresh', projects: [] }
    case 'loaded':
      return { kind: 'loaded', projects: issue.projects }
    case 'unreadable':
      return {
        kind: 'blocked',
        projects: [],
        reason: issue.reason,
        quarantinedTo: issue.quarantinedTo,
      }
    case 'tooNew':
      return {
        kind: 'blocked',
        projects: [],
        reason: `le fichier de configuration est en version ${issue.found}, cette version de DoraBase comprend la version ${issue.supported}`,
      }
  }
}
