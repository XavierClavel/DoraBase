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
import { formatInteger } from '../../ui/format'
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
  const [choisie, setChoisie] = useState<string | null>(null)
  const hauteur = useHauteurDisponible()

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
      <BarreDEtat fenetre={fenetre} loading={loading} error={error} />
    </div>
  )
}

/**
 * La barre d'état de 26 px : `500 lignes · 41 ms · limit 500`, puis « lecture seule ».
 *
 * **Les chiffres viennent de `RowWindow`**, pas d'un recalcul : la durée est celle mesurée par
 * le moteur, et le compte est celui de la fenêtre reçue. Les recalculer côté front produirait
 * des valeurs *plausibles* qui cesseraient d'être vraies au premier écart.
 */
function BarreDEtat({
  fenetre,
  loading,
  error,
}: {
  fenetre: RowWindow | null
  loading: boolean
  error: string | null
}) {
  return (
    <div className={styles.statut} role="status">
      {error ? (
        // **Le message complet vit dans la grille**, là où l'utilisateur cherche ses lignes ; la
        // barre d'état ne porte que le verdict. L'écrire aux deux endroits ferait lire deux fois
        // la même phrase, et allongerait une barre de 26 px.
        <span className={styles.echec}>lecture impossible</span>
      ) : loading ? (
        <span>Lecture…</span>
      ) : fenetre ? (
        <>
          <span className={styles.compte}>
            {formatInteger(fenetre.rows.length)} ligne{fenetre.rows.length > 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>{fenetre.durationMs} ms</span>
          <span>·</span>
          <span>limit {fenetre.rows.length === 0 ? '—' : limiteLue(fenetre.sql)}</span>
        </>
      ) : (
        <span>Aucune lecture</span>
      )}
      <span className={styles.espace} />
      {/* **« ⌘E pour éditer » n'est pas affiché.** L'édition est `11` ; `09e` a déjà tranché ce
          cas en retirant le rappel `⌘P` d'un champ qui ne l'honorait pas — un raccourci affiché
          qui ne répond pas est pire qu'un raccourci absent. « lecture seule » reste, c'est vrai. */}
      <span className={styles.lecture}>
        <Icon name="lock" size={11} strokeWidth={2.2} />
        lecture seule
      </span>
    </div>
  )
}

/** Le `limit` du SQL réellement exécuté — jamais une valeur reconstruite depuis l'état. */
function limiteLue(sql: string): string {
  return /limit\s+(\d+)/i.exec(sql)?.[1] ?? '—'
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
      // La grille, c'est le conteneur **moins** la toolbar (36 px) et la barre d'état (26) : la
      // mesure porte sur le parent, qui les inclut toutes deux. Les oublier ferait dépasser la
      // grille de la hauteur de la fenêtre, et la barre d'état sortirait de l'écran.
      const disponible = element.clientHeight - 36 - 26
      if (disponible > 0) setValeur(disponible)
    })
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])

  return { ref, valeur }
}
