// Les trois règles suivantes sont désactivées pour ce fichier, et pour une seule raison : ce
// composant existe **parce que** `<table>` ne convient pas. `09a` a livré `DataTable`, un vrai
// tableau, pour tous les cas où il convient ; ici la virtualisation impose des lignes
// positionnées, donc des `<div>` porteurs de rôles ARIA. Les silencer à la ligne demanderait une
// dizaine d'annotations dans un même fichier, ce qui les rendrait invisibles.
//
// - `useSemanticElements` : proposerait `<table>`, voir ci-dessus.
// - `useFocusableInteractive` : les cellules ne sont pas focalisables **par choix** — le focus
//   reste sur la grille, qui désigne la ligne courante par `aria-activedescendant`.
// - `useKeyWithClickEvents` : le clavier est géré une fois sur la grille (`↑`, `↓`) plutôt que
//   sur chaque ligne, ce que le motif « grid » de l'APG demande.
// biome-ignore-all lint/a11y/useSemanticElements: voir ci-dessus
// biome-ignore-all lint/a11y/useFocusableInteractive: voir ci-dessus
// biome-ignore-all lint/a11y/useKeyWithClickEvents: voir ci-dessus

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cx } from '../cx'
import styles from './VirtualGrid.module.css'

export type GridColumn<Row> = {
  /** Clé stable, employée pour le rendu et l'association en-tête ↔ cellule. */
  key: string
  header: ReactNode
  /** Largeur en pixels. Le mockup emploie un `<colgroup>` fixe ; ici, une grille CSS. */
  width: number
  /** Aligne à droite — les nombres, dans `A5`. */
  numeric?: boolean
  /** Teinte de fond, pour les colonnes filtrées et triées de `10d`. */
  tint?: 'filtered' | 'sorted'
  cell: (row: Row, index: number) => ReactNode
  /** Cellule de la seconde ligne d'en-tête, quand `filterRow` est demandée. */
  filter?: ReactNode
}

type VirtualGridProps<Row> = {
  /** Nom accessible de la grille. Une grille anonyme est illisible à la voix. */
  label: string
  columns: readonly GridColumn<Row>[]
  rows: readonly Row[]
  rowId: (row: Row, index: number) => string
  /**
   * Hauteur du conteneur de défilement, **en pixels et non mesurée**.
   *
   * jsdom ne calcule aucune mise en page : une virtualisation qui lit `clientHeight` rendrait
   * zéro ligne sous Vitest, et le test « seules les lignes visibles sont montées » passerait
   * pour la mauvaise raison. L'hôte passe une hauteur mesurée, le test une hauteur choisie, et
   * c'est Playwright qui vérifie que la mesure réelle suit le panneau.
   */
  viewportHeight: number
  /**
   * Densité de ligne, en pixels. 26 px dans le mockup.
   *
   * **Une prop et non le jeton `--rowh`**, alors que le jeton existe : la virtualisation a besoin
   * d'un **nombre** — elle calcule quelles lignes monter en divisant le défilement par le pas. Lire
   * une variable CSS depuis le JavaScript demanderait un `getComputedStyle` à chaque rendu, et
   * surtout un observateur pour réagir à son changement. La préférence de `15c` descend donc par les
   * props, du seul endroit qui la détient.
   *
   * Le jeton reste employé par le CSS pour l'en-tête ; c'est cette prop qui règle les lignes.
   */
  rowHeight?: number
  /** Lignes montées en marge de la fenêtre visible, pour que le défilement ne clignote pas. */
  overscan?: number
  /** Rend la seconde ligne d'en-tête, celle des filtres de `10d`. */
  filterRow?: boolean
  selectedId?: string | null
  onSelect?: (row: Row, index: number) => void
  /**
   * Teinte une **ligne** entière — celles qui portent une modification en attente (`11b`).
   *
   * Symétrique du `tint` de colonne : la grille connaît trois raisons de teinter, `filtered`,
   * `sorted` et `modified`, toutes venues du handoff. Passer une classe CSS à la place ferait fuir
   * l'habillage hors du module qui le porte.
   */
  rowTint?: (row: Row, index: number) => 'modified' | undefined
  /** Teinte une **cellule**, et lui ajoute le coin ambre du mockup (`11b`). */
  cellTint?: (row: Row, column: string) => 'modified' | undefined
  /** Rendu à la place des lignes quand `rows` est vide. */
  empty?: ReactNode
}

/**
 * La grille virtualisée de `A5`.
 *
 * **Une seconde grille, et non `DataTable` virtualisé.** `09a` a séparé les deux
 * délibérément : un vrai `<table>` donne gratuitement l'annonce « en-tête, valeur » à la voix,
 * mais ne se virtualise pas sans mentir sur sa hauteur. `A5` doit tenir 5 000 lignes — le
 * palier maximal de `RowLimit`.
 *
 * **`aria-rowcount` porte le total, `aria-rowindex` l'indice réel.** C'est ce qui permet
 * d'annoncer « ligne 812 sur 5 000 » alors que 812 est la troisième ligne présente dans le
 * DOM. Sans ces deux attributs, la virtualisation ment à l'arbre d'accessibilité au lieu de
 * mentir seulement au navigateur.
 */
export function VirtualGrid<Row>({
  label,
  columns,
  rows,
  rowId,
  viewportHeight,
  rowHeight = 26,
  overscan = 4,
  filterRow = false,
  selectedId = null,
  onSelect,
  rowTint,
  cellTint,
  empty,
}: VirtualGridProps<Row>) {
  const [scrollTop, setScrollTop] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  // Préfixe des identifiants de ligne : `aria-activedescendant` désigne un `id` du document,
  // qui doit donc être unique même avec deux grilles montées côte à côte.
  const idGrille = useId()

  const lignesDEnTete = filterRow ? 2 : 1
  const premiere = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibles = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const derniere = Math.min(rows.length, premiere + visibles)
  const fenetre = rows.slice(premiere, derniere)

  const gabarit = columns.map((colonne) => `${colonne.width}px`).join(' ')
  /**
   * La largeur du **contenu**, somme des colonnes.
   *
   * Elle est portée par l'en-tête et par la toile, faute de quoi tous deux prennent celle du
   * conteneur : le fond de la ligne sélectionnée s'arrêtait alors au bord droit de la fenêtre, et
   * disparaissait dès qu'on défilait horizontalement. Constaté à l'écran le 10 août 2026, sur une
   * table de trente-quatre colonnes.
   */
  const largeurContenu = columns.reduce((somme, colonne) => somme + colonne.width, 0)

  // Ramener la ligne sélectionnée dans la fenêtre visible : sans cela, `↓` déplacerait une
  // sélection invisible dès qu'elle sort du bas de l'écran.
  useEffect(() => {
    if (selectedId === null) return
    const index = rows.findIndex((row, rang) => rowId(row, rang) === selectedId)
    if (index === -1) return
    const haut = index * rowHeight
    const bas = haut + rowHeight
    setScrollTop((actuel) => {
      const cible =
        haut < actuel ? haut : bas > actuel + viewportHeight ? bas - viewportHeight : actuel
      if (cible !== actuel) viewport.current?.scrollTo({ top: cible })
      return cible
    })
  }, [selectedId, rows, rowId, rowHeight, viewportHeight])

  function deplacer(evenement: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect || (evenement.key !== 'ArrowDown' && evenement.key !== 'ArrowUp')) return
    evenement.preventDefault()
    const courante = rows.findIndex((row, rang) => rowId(row, rang) === selectedId)
    const suivante =
      evenement.key === 'ArrowDown'
        ? Math.min(rows.length - 1, courante + 1)
        : Math.max(0, courante === -1 ? 0 : courante - 1)
    const row = rows[suivante]
    if (row !== undefined) onSelect(row, suivante)
  }

  return (
    <div
      className={styles.root}
      role="grid"
      aria-label={label}
      // Le **total**, pas le nombre de lignes montées. Les en-têtes comptent : ce sont des
      // lignes de la grille au sens ARIA.
      aria-rowcount={rows.length + lignesDEnTete}
      aria-activedescendant={
        selectedId !== null && onSelect ? `${idGrille}-${selectedId}` : undefined
      }
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={deplacer}
    >
      {/* `role="presentation"` : un `role="grid"` attend des `rowgroup`/`row` pour enfants, et ce
          conteneur de défilement n'existe que pour porter le débordement. Même arbitrage que
          l'enveloppe d'onglet de `TabStrip`. */}
      <div
        ref={viewport}
        role="presentation"
        className={styles.viewport}
        style={{ height: viewportHeight }}
        /*
         * **`flushSync`, et c'est la correction d'un vide au défilement rapide.**
         *
         * Un `scroll` est un événement *continu* pour React, donc la mise à jour qu'il déclenche est
         * de priorité non urgente : React a le droit de la différer d'une trame ou plus. Le temps
         * qu'elle passe, la toile est à sa nouvelle position et les lignes montées sont restées à
         * l'ancienne — mesuré sur un saut de 6 000 px : **621 px de vide au bas de la fenêtre**, et
         * les lignes montées à près de 6 000 px au-dessus. C'est le clignotement blanc qu'on voit en
         * lâchant un défilement rapide.
         *
         * Différer est le bon défaut de React presque partout ; ici l'affichage *est* la position de
         * défilement, et une position différée n'est pas une position. `flushSync` rend donc la trame
         * courante avant qu'elle ne soit peinte. Le coût est réel et connu — un rendu synchrone par
         * événement — et il est borné par ce que le navigateur émet : un `scroll` par trame au plus.
         */
        onScroll={(evenement) => {
          const haut = evenement.currentTarget.scrollTop
          flushSync(() => setScrollTop(haut))
        }}
      >
        {/* **L'en-tête vit dans la zone défilante**, collé en haut. Hors d'elle, il ne suivait pas
            le défilement **horizontal** : au-delà de la largeur de la fenêtre, les en-têtes ne
            désignaient plus les colonnes sous eux. Le `sticky` garde le comportement vertical que
            le test de `10a` vérifie.

            **Rendu à une seule position de l'arbre**, hors de toute branche : une première version
            le plaçait dans les deux issues du ternaire « vide / rempli », et React le démontait au
            passage de l'une à l'autre — donc à l'arrivée de la première lecture. Une saisie de
            filtre en cours et un popover ouvert étaient perdus à cet instant. Attrapé par les tests
            de `10d`, pas par l'œil. */}
        <EnTete
          columns={columns}
          gabarit={gabarit}
          largeur={largeurContenu}
          filterRow={filterRow}
        />
        {rows.length === 0 && empty !== undefined ? (
          <div className={styles.empty}>{empty}</div>
        ) : (
          // La toile porte la hauteur **totale** : c'est elle qui donne à la barre de défilement
          // la bonne course, alors que seules quelques lignes sont montées.
          <div
            role="rowgroup"
            className={styles.canvas}
            style={{ height: rows.length * rowHeight, width: largeurContenu }}
          >
            {fenetre.map((row, rang) => {
              const index = premiere + rang
              const id = rowId(row, index)
              const selectionnee = id === selectedId
              return (
                <div
                  key={id}
                  id={`${idGrille}-${id}`}
                  role="row"
                  // Focalisable par programme seulement : le focus clavier reste sur la grille,
                  // qui désigne la ligne courante par `aria-activedescendant`. C'est le motif
                  // « grid » de l'APG, et il survit à la virtualisation — une ligne qui portait
                  // le focus et qu'on démonte en défilant le perdrait au profit du `<body>`.
                  tabIndex={-1}
                  aria-rowindex={index + 1 + lignesDEnTete}
                  aria-selected={onSelect ? selectionnee : undefined}
                  className={cx(
                    styles.row,
                    styles.tr,
                    // La teinte de modification **avant** la sélection dans l'ordre des classes :
                    // une ligne à la fois modifiée et sélectionnée doit se lire comme sélectionnée,
                    // c'est l'état que l'utilisateur vient de produire.
                    rowTint?.(row, index) === 'modified' && styles.rowModified,
                    selectionnee && styles.selected,
                  )}
                  style={{
                    gridTemplateColumns: gabarit,
                    height: rowHeight,
                    // La densité descend aux cellules, qui y centrent leur texte : elles sont
                    // étirées, et seule la ligne connaît sa hauteur.
                    ['--pitch' as string]: `${rowHeight}px`,
                    transform: `translateY(${index * rowHeight}px)`,
                  }}
                  onClick={onSelect ? () => onSelect(row, index) : undefined}
                >
                  {columns.map((colonne) => (
                    <div
                      key={colonne.key}
                      role="gridcell"
                      className={cx(
                        styles.td,
                        colonne.numeric && styles.numeric,
                        colonne.tint === 'filtered' && styles.filtered,
                        colonne.tint === 'sorted' && styles.sorted,
                        cellTint?.(row, colonne.key) === 'modified' && styles.cellModified,
                      )}
                    >
                      {colonne.cell(row, index)}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Les une ou deux lignes d'en-tête, **collées en haut de la zone défilante**.
 *
 * Extrait pour tenir en un seul endroit du rendu — sa place dans l'arbre doit être **stable**,
 * sans quoi React le démonte et les `FilterCell` perdent leur saisie.
 *
 * Il porte la largeur du contenu : sans elle, il prend celle du conteneur et cesse de désigner les
 * colonnes dès qu'on défile horizontalement.
 */
function EnTete<Row>({
  columns,
  gabarit,
  largeur,
  filterRow,
}: {
  columns: readonly GridColumn<Row>[]
  gabarit: string
  largeur: number
  filterRow: boolean
}) {
  return (
    <div className={styles.head} role="rowgroup" style={{ width: largeur }}>
      <div
        className={styles.row}
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns: gabarit }}
      >
        {columns.map((colonne) => (
          <div
            key={colonne.key}
            role="columnheader"
            className={cx(
              styles.th,
              colonne.numeric && styles.numeric,
              colonne.tint === 'filtered' && styles.filtered,
              colonne.tint === 'sorted' && styles.sorted,
            )}
          >
            {colonne.header}
          </div>
        ))}
      </div>
      {filterRow && (
        <div
          className={cx(styles.row, styles.filterRow)}
          role="row"
          aria-rowindex={2}
          style={{ gridTemplateColumns: gabarit }}
        >
          {columns.map((colonne) => (
            <div
              key={colonne.key}
              role="columnheader"
              className={cx(
                styles.tf,
                colonne.tint === 'filtered' && styles.filtered,
                colonne.tint === 'sorted' && styles.sorted,
              )}
            >
              {colonne.filter}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
