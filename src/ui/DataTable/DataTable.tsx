import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './DataTable.module.css'

export type Column<Row> = {
  /** Clé stable, employée pour le rendu et l'association en-tête ↔ cellule. */
  key: string
  header: string
  /** Le contenu de la cellule. Rendre un nœud plutôt qu'une chaîne permet les icônes de `A4`. */
  cell: (row: Row) => ReactNode
  /** Aligne à droite — les nombres, dans `A4`. */
  numeric?: boolean
  /**
   * Rend la cellule en Nunito au lieu du mono.
   *
   * **L'inverse de ce qu'on attendrait**, et c'est le mockup qui tranche : sa feuille de style
   * pose `td { font: 500 11.5px JetBrains Mono }` pour **toutes** les cellules, et seule la
   * colonne du nom y échappe (`font: 600 12px Nunito`). Le tableau liste des identifiants de
   * catalogue — noms de colonnes, comptes, tailles, dates — donc le mono est la règle et
   * Nunito l'exception. Une première version avait posé `mono?: boolean`, ce qui aurait fait de
   * six colonnes sur sept une exception.
   */
  ui?: boolean
  /**
   * Largeur fixe. Le mockup emploie `table-layout: fixed` avec un `<colgroup>` :
   * 210 · 88 · 78 · 66 · 150 · 120 · auto. Sans largeurs, le navigateur les calcule d'après le
   * contenu et elles changeraient d'un schéma à l'autre.
   */
  width?: string
}

type DataTableProps<Row> = {
  /** Nom accessible du tableau. Un tableau anonyme est illisible à la voix. */
  label: string
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  /** Identifiant stable d'une ligne — pour la clé React et la sélection. */
  rowId: (row: Row) => string
  selectedId?: string | null
  onSelect?: (row: Row) => void
  /** Rendu quand `rows` est vide. Absent, aucune ligne n'est rendue. */
  empty?: ReactNode
}

/**
 * Le tableau dense d'objets de `A4` : Nom, Lignes, Taille, Col., Clé primaire, Dernier
 * ANALYZE, Commentaire.
 *
 * **Un vrai `<table>`**, et c'est un choix. Avec `<th scope="col">`, un lecteur d'écran annonce
 * l'en-tête de chaque cellule pendant la navigation, et le fait gratuitement — une grille de
 * `<div>` doit réimplémenter tout cela en `role="grid"` et `aria-colindex`.
 *
 * La grille de `A5` (`10`) aura besoin de l'inverse : virtualisation, donc des `<div>`
 * positionnés, colonnes redimensionnables, cellules éditables. C'est précisément pourquoi les
 * deux composants sont séparés — les fondre donnerait une abstraction qui ne sert bien ni l'une
 * ni l'autre.
 */
export function DataTable<Row>({
  label,
  columns,
  rows,
  rowId,
  selectedId = null,
  onSelect,
  empty,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) {
    return <div className={styles.empty}>{empty}</div>
  }

  return (
    <table className={styles.root}>
      <caption className={styles.caption}>{label}</caption>
      {/* `<colgroup>` plutôt que des largeurs sur les `<th>` : avec `table-layout: fixed`, c'est
          le groupe de colonnes qui fait autorité, et la largeur ne dépend plus du contenu. */}
      <colgroup>
        {columns.map((colonne) => (
          <col key={colonne.key} style={colonne.width ? { width: colonne.width } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((colonne) => (
            <th
              key={colonne.key}
              scope="col"
              className={cx(styles.th, colonne.numeric && styles.numeric)}
            >
              {colonne.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = rowId(row)
          const selectionnee = id === selectedId
          return (
            <tr
              key={id}
              // `aria-selected` sur une ligne de `<table>` n'est valable que si la ligne est
              // sélectionnable — ce qui est le cas ici, et que `onSelect` matérialise.
              aria-selected={onSelect ? selectionnee : undefined}
              className={cx(styles.tr, selectionnee && styles.selected)}
              onClick={onSelect ? () => onSelect(row) : undefined}
            >
              {columns.map((colonne, rang) => {
                const contenu = colonne.cell(row)
                const classes = cx(
                  styles.td,
                  colonne.numeric && styles.numeric,
                  colonne.ui && styles.ui,
                )
                // La première colonne est l'en-tête **de sa ligne** : c'est le nom de l'objet,
                // et c'est lui qui identifie la ligne à la voix. Sans `scope="row"`, un lecteur
                // d'écran annonce « Nom, orders » puis « Lignes, 1.9 M » sans jamais relier la
                // seconde cellule à l'objet dont elle parle.
                return rang === 0 ? (
                  <th key={colonne.key} scope="row" className={cx(classes, styles.rowHeader)}>
                    {contenu}
                  </th>
                ) : (
                  <td key={colonne.key} className={classes}>
                    {contenu}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
