import type { TableSummary } from '../../domain/engine'
import { type Column, DataTable } from '../../ui/DataTable/DataTable'
import { ABSENT, formatBytes, formatRowCount } from '../../ui/format'
import type { TypeObjet } from './BreadcrumbBar'

type ObjectTableProps = {
  schema: string
  objects: readonly TableSummary[]
  type: TypeObjet
  selectedName?: string | null
  onSelect: (objet: TableSummary) => void
  /** Ouvre l'objet dans un onglet — double-clic ou `Entrée`. Voir `10b`. */
  onOpen?: (objet: TableSummary) => void
  /** Vrai pendant le chargement des objets du schéma. */
  loading?: boolean
  /** Le message d'échec, quand le chargement a échoué. */
  error?: string | null
}

/**
 * Le tableau des objets d'un schéma : sept colonnes, ligne sélectionnable.
 *
 * **Les colonnes sans objet portent un tiret cadratin**, jamais zéro ni du vide. Un index n'a ni
 * « Lignes », ni « Clé primaire », ni « Dernier ANALYZE » — trois des sept colonnes — et le
 * mockup ne montre jamais le segment « Index » actif. « 0 ligne » sur un index serait un
 * mensonge ; du vide ressemblerait à une donnée manquante. Un jeu de colonnes propre à chaque
 * type serait la vraie réponse, et c'est du design : consigné au § « À trancher ».
 */
export function ObjectTable({
  schema,
  objects,
  type,
  selectedName = null,
  onSelect,
  onOpen,
  loading = false,
  error = null,
}: ObjectTableProps) {
  return (
    <DataTable
      label={`Objets du schéma ${schema}`}
      columns={COLONNES}
      rows={objects}
      rowId={(objet) => objet.name}
      selectedId={selectedName}
      onSelect={onSelect}
      onOpen={onOpen}
      // **Vide, chargement et échec se distinguent, et aucun ne ressemble aux deux autres.** Le
      // handoff n'en maquette aucun des trois ; le minimum défendable est une ligne de texte,
      // sans illustration inventée.
      empty={<span>{messageVide(type, schema, loading, error)}</span>}
    />
  )
}

function messageVide(
  type: TypeObjet,
  schema: string,
  loading: boolean,
  error: string | null,
): string {
  if (error) return error
  if (loading) return 'Chargement des objets…'
  const quoi = { tables: 'table', views: 'vue', functions: 'fonction', indexes: 'index' }[type]
  // Un schéma sans table est normal — `public` d'une base neuve. Le dire, plutôt que de laisser
  // un tableau à zéro ligne qui ressemble à un chargement inachevé.
  return `Le schéma ${schema} ne contient aucune ${quoi}.`
}

/**
 * Les sept colonnes du mockup, avec leurs largeurs de `<colgroup>`.
 *
 * `ui: true` sur la seule colonne du nom : le mockup pose `td { font: 500 11.5px JetBrains
 * Mono }` pour toutes les cellules, et seule celle-là y échappe.
 */
const COLONNES: Column<TableSummary>[] = [
  { key: 'name', header: 'Nom', cell: (o) => o.name, ui: true, width: '210px' },
  {
    key: 'rows',
    header: 'Lignes',
    // `RowCount` distingue `estimated` de `exact` au niveau du type (`06c`). Le tableau n'affiche
    // qu'un nombre — la distinction sert à `09f`, dont la tuile ne doit pas présenter une
    // estimation comme un fait exact.
    cell: (o) => formatRowCount(o.rows),
    numeric: true,
    width: '88px',
  },
  {
    key: 'size',
    header: 'Taille',
    // `None` quand le moteur ne sait pas donner de taille physique — une vue, par exemple.
    cell: (o) => (o.sizeBytes === null ? ABSENT : formatBytes(o.sizeBytes)),
    numeric: true,
    width: '78px',
  },
  { key: 'columns', header: 'Col.', cell: (o) => o.columnCount, numeric: true, width: '66px' },
  {
    key: 'pk',
    header: 'Clé primaire',
    cell: (o) => o.primaryKey ?? ABSENT,
    width: '150px',
  },
  {
    key: 'analyze',
    header: 'Dernier ANALYZE',
    cell: (o) => o.lastAnalyze ?? ABSENT,
    width: '120px',
  },
  { key: 'comment', header: 'Commentaire', cell: (o) => o.comment ?? ABSENT },
]
