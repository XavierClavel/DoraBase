import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type {
  ColumnInfo,
  DatabaseKey,
  Filter,
  FilterOperator,
  RowLimit,
  RowQuery,
  RowWindow,
  SortKey,
  Value,
} from '../../domain/engine'
import { type GridColumn, VirtualGrid } from '../../ui/VirtualGrid/VirtualGrid'
import { estNumerique, rendreValeur } from './cellule'
import { FilterCell } from './FilterCell'
import styles from './TableView.module.css'
import { Toolbar } from './Toolbar'
import { basculerTri, filtreDe, poserFiltre, rangDeTri } from './tri'
import { LIMITE_PAR_DEFAUT, type PasserelleLignes, useLignes } from './useLignes'

type TableViewProps = {
  cle: DatabaseKey
  schema: string
  table: string
  /** Les colonnes du catalogue — elles nomment les en-têtes et donnent l'ordre. */
  columns: readonly ColumnInfo[]
  passerelle?: PasserelleLignes
  /**
   * Publie filtres et tri vers l'écran de travail, qui en annote la liste de colonnes de la
   * sidebar. **Un seul état, deux lecteurs** : une copie dans la sidebar divergerait à la
   * première modification.
   */
  onEtatChange?: (etat: { filters: readonly Filter[]; sort: readonly SortKey[] }) => void
  /**
   * Remonte la fenêtre lue et la ligne choisie.
   *
   * **La barre d'état et le panneau de ligne vivent au-dessus de cette vue**, parce que le mockup
   * les y place : le panneau droit longe tout le corps de l'écran et la barre d'état court sur
   * toute la largeur, sous les trois colonnes. Les rendre ici les enfermerait dans le centre.
   */
  onLectureChange?: (etat: {
    fenetre: RowWindow | null
    loading: boolean
    error: string | null
    ligne: readonly Value[] | null
    rang: number | null
    total: number
  }) => void
  /** Le rang sélectionné, piloté depuis l'écran pour que les flèches du panneau y répondent. */
  rang?: number | null
  onRangChange?: (rang: number | null) => void
}

/** Une ligne de la fenêtre, avec son rang — la gouttière `#` du mockup. */
type Ligne = { rang: number; valeurs: readonly Value[] }

/** Largeur par défaut d'une colonne de données, faute de mesure du contenu. */
const LARGEUR_COLONNE = 130
/** La gouttière `#`, à 30 px dans le mockup. */
const LARGEUR_GOUTTIERE = 30

/**
 * `A5` : les lignes d'une table.
 *
 * **Le premier écran qui emploie la lecture paginée de `06d`**, écrite et testée le 6 août et
 * appelée par personne jusqu'ici.
 *
 * **Changer de table doit remonter ce composant** — l'appelant lui donne une `key` par onglet.
 * Garder l'état ferait appliquer `status = paid` à une table qui n'a pas cette colonne, et la
 * lecture échouerait sans que rien ne l'explique. Le faire par un effet de remise à zéro coûtait
 * une seconde requête à chaque montage : mesuré, pas supposé.
 */
export function TableView({
  cle,
  schema,
  table,
  columns,
  passerelle,
  onEtatChange,
  onLectureChange,
  rang = null,
  onRangChange,
}: TableViewProps) {
  const [filters, setFilters] = useState<readonly Filter[]>([])
  const [sort, setSort] = useState<readonly SortKey[]>([])
  // L'opérateur choisi par colonne, y compris pour un filtre pas encore appliqué. Séparé des
  // filtres : `= ` sur une colonne vide n'est pas un filtre, c'est un champ prêt à recevoir.
  const [operateurs, setOperateurs] = useState<Record<string, FilterOperator>>({})
  const [limite, setLimite] = useState<RowLimit>(LIMITE_PAR_DEFAUT)
  // Les colonnes **masquées**, et non les visibles : une table dont on n'a rien masqué a un
  // ensemble vide, quel que soit le nombre de colonnes qu'elle finira par avoir.
  const [masquees, setMasquees] = useState<ReadonlySet<string>>(new Set())
  const hauteur = useHauteurDisponible()
  // La sélection est **pilotée par l'écran** : le panneau de ligne et ses flèches vivent au-dessus
  // de cette vue, et deux copies du même rang divergeraient.
  const choisie = rang === null ? null : String(rang)
  const setChoisie = (valeur: string | null) =>
    onRangChange?.(valeur === null ? null : Number(valeur))

  // Mémoïsée : `useLignes` relance sa lecture quand la requête change, et une requête
  // reconstruite à chaque rendu la relancerait indéfiniment.
  const query: RowQuery = useMemo(
    () => ({
      schema,
      table,
      filters: [...filters],
      sort: [...sort],
      offset: 0,
      limit: limite,
    }),
    [schema, table, filters, sort, limite],
  )

  const { fenetre, loading, error, relire } = useLignes(cle, query, passerelle)

  useEffect(() => onEtatChange?.({ filters, sort }), [filters, sort, onEtatChange])

  // `useCallback` : la fonction entre dans le `useMemo` des colonnes, qu'une nouvelle identité à
  // chaque rendu recalculerait pour rien.
  const appliquerFiltre = useCallback(
    (column: string, operator: FilterOperator, saisie: string) => {
      setOperateurs((precedent) => ({ ...precedent, [column]: operator }))
      setFilters((precedent) => poserFiltre(precedent, column, filtreDe(column, operator, saisie)))
    },
    [],
  )

  const lignes: Ligne[] = useMemo(
    () => (fenetre?.rows ?? []).map((valeurs, rang) => ({ rang: rang + 1, valeurs })),
    [fenetre],
  )

  const ligneChoisie = lignes.find((l) => String(l.rang) === choisie)

  useEffect(
    () =>
      onLectureChange?.({
        fenetre,
        loading,
        error,
        ligne: ligneChoisie?.valeurs ?? null,
        rang: ligneChoisie?.rang ?? null,
        total: lignes.length,
      }),
    [fenetre, loading, error, ligneChoisie, lignes.length, onLectureChange],
  )

  const colonnes: GridColumn<Ligne>[] = useMemo(
    () => [
      {
        key: '#',
        header: '#',
        width: LARGEUR_GOUTTIERE,
        cell: (ligne) => <span className={styles.gouttiere}>{ligne.rang}</span>,
      },
      // Masquer une colonne ne change pas la requête : `SELECT *` reste, et la colonne est
      // retirée du **rendu**. Restreindre la projection rendrait le SQL affiché dépendant d'un
      // réglage d'affichage, ce qui est déroutant dans un client de bases. Le rang, lui, reste
      // celui du catalogue — c'est l'indice de la valeur dans la ligne reçue.
      ...columns
        .map((colonne, rang) => ({ colonne, rang }))
        .filter(({ colonne }) => !masquees.has(colonne.name))
        .map(({ colonne, rang }) => {
          const filtre = filters.find((f) => f.column === colonne.name)
          const critere = sort.find((c) => c.column === colonne.name)
          const rangDuTri = rangDeTri(sort, colonne.name)
          return {
            key: colonne.name,
            header: (
              <button
                type="button"
                className={styles.entete}
                // Le `⌘`-clic empile un second critère : la convention de tous les tableurs et de
                // tous les clients SQL, que le handoff ne dit pas et qu'inventer autrement serait
                // gratuit. `aria-sort` porte l'état pour qui n'en voit pas la flèche.
                onClick={(evenement) =>
                  setSort((precedent) =>
                    basculerTri(precedent, colonne.name, evenement.metaKey || evenement.ctrlKey),
                  )
                }
                aria-label={`Trier par ${colonne.name}`}
              >
                {colonne.name}
                {critere && (
                  <Icon
                    name={critere.direction === 'ascending' ? 'asc' : 'desc'}
                    size={11}
                    strokeWidth={2.4}
                  />
                )}
                {/* La pastille de rang n'apparaît qu'à partir de **deux** critères : un « 1 »
                  solitaire sur la seule colonne triée serait du bruit. */}
                {rangDuTri !== null && sort.length > 1 && (
                  <span className={styles.rang}>{rangDuTri}</span>
                )}
              </button>
            ),
            width: LARGEUR_COLONNE,
            // L'alignement suit la **valeur**, pas le nom de la colonne : une colonne numérique
            // dont une cellule est `NULL` garde son `NULL` à gauche, comme le mockup le montre.
            numeric: colonne.category === 'number',
            tint: filtre ? ('filtered' as const) : critere ? ('sorted' as const) : undefined,
            filter: (
              <FilterCell
                column={colonne.name}
                operator={operateurs[colonne.name] ?? 'eq'}
                value={filtre?.value ?? ''}
                onApply={(operator, saisie) => appliquerFiltre(colonne.name, operator, saisie)}
              />
            ),
            cell: (ligne: Ligne) => {
              const valeur = ligne.valeurs[rang]
              if (valeur === undefined) return null
              return (
                <span className={estNumerique(valeur) ? styles.nombre : undefined}>
                  {rendreValeur(valeur)}
                </span>
              )
            },
          }
        }),
    ],
    [columns, filters, sort, operateurs, appliquerFiltre, masquees],
  )

  return (
    <div className={styles.root} ref={hauteur.ref}>
      <Toolbar
        limite={limite}
        onLimiteChange={setLimite}
        filters={filters}
        // La croix d'un chip et le vidage du champ correspondant font exactement la même chose :
        // un seul état, deux commandes.
        onRemoveFilter={(column) => setFilters((precedent) => poserFiltre(precedent, column, null))}
        sort={sort}
        columns={columns}
        masquees={masquees}
        onToggleColonne={(name) =>
          setMasquees((precedent) => {
            const suivant = new Set(precedent)
            if (suivant.has(name)) suivant.delete(name)
            else suivant.add(name)
            return suivant
          })
        }
        sql={fenetre?.sql ?? null}
        onRefresh={relire}
      />
      <div className={styles.centre}>
        <div className={styles.grille}>
          <VirtualGrid
            label={`Lignes de ${schema}.${table}`}
            columns={colonnes}
            rows={lignes}
            rowId={(ligne) => String(ligne.rang)}
            viewportHeight={hauteur.valeur}
            filterRow
            selectedId={choisie}
            onSelect={(ligne) => setChoisie(String(ligne.rang))}
            empty={<span>{messageVide(loading, error, schema, table)}</span>}
          />
        </div>
      </div>
    </div>
  )
}

function messageVide(
  loading: boolean,
  error: string | null,
  schema: string,
  table: string,
): string {
  if (error) return error
  if (loading) return 'Lecture des lignes…'
  // Vide **lu** n'est pas vide **non lu** : une table sans ligne est un état normal, et ne rien
  // dire laisserait croire que la lecture n'a pas abouti.
  return `${schema}.${table} ne contient aucune ligne.`
}

/**
 * La hauteur du conteneur, mesurée.
 *
 * `VirtualGrid` prend une hauteur en **valeur** — jsdom ne calculant aucune mise en page, une
 * virtualisation qui lit `clientHeight` rendrait zéro ligne sous Vitest. La mesure vit donc ici,
 * dans l'écran, où un test n'en dépend pas.
 */
function useHauteurDisponible() {
  const ref = useRef<HTMLDivElement>(null)
  // 400 px : ce que rend un conteneur non mesuré, sous jsdom notamment. Une valeur nulle ne
  // monterait aucune ligne et ferait passer les tests pour la mauvaise raison.
  const [valeur, setValeur] = useState(400)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observateur = new ResizeObserver(() => {
      // La grille, c'est le conteneur **moins la toolbar** (36 px). La barre d'état, elle, vit au
      // niveau de l'écran depuis `10f` : la retirer ici laisserait vingt-six pixels vides sous la
      // grille. Mesuré, pas supposé.
      const disponible = element.clientHeight - 36
      if (disponible > 0) setValeur(disponible)
    })
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])

  return { ref, valeur }
}
