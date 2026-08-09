import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { ColumnInfo, DatabaseKey, RowWindow, Value } from '../../domain/engine'
import { formatInteger } from '../../ui/format'
import { type GridColumn, VirtualGrid } from '../../ui/VirtualGrid/VirtualGrid'
import { estNumerique, rendreValeur } from './cellule'
import styles from './TableView.module.css'
import { LIMITE_PAR_DEFAUT, type PasserelleLignes, useLignes } from './useLignes'

type TableViewProps = {
  cle: DatabaseKey
  schema: string
  table: string
  /** Les colonnes du catalogue — elles nomment les en-têtes et donnent l'ordre. */
  columns: readonly ColumnInfo[]
  passerelle?: PasserelleLignes
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
 */
export function TableView({ cle, schema, table, columns, passerelle }: TableViewProps) {
  const { fenetre, loading, error } = useLignes(cle, schema, table, LIMITE_PAR_DEFAUT, passerelle)
  const [choisie, setChoisie] = useState<string | null>(null)
  const hauteur = useHauteurDisponible()

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
      ...columns.map((colonne, rang) => ({
        key: colonne.name,
        header: colonne.name,
        width: LARGEUR_COLONNE,
        // L'alignement suit la **valeur**, pas le nom de la colonne : une colonne numérique
        // dont une cellule est `NULL` garde son `NULL` à gauche, comme le mockup le montre.
        numeric: colonne.category === 'number',
        cell: (ligne: Ligne) => {
          const valeur = ligne.valeurs[rang]
          if (valeur === undefined) return null
          return (
            <span className={estNumerique(valeur) ? styles.nombre : undefined}>
              {rendreValeur(valeur)}
            </span>
          )
        },
      })),
    ],
    [columns],
  )

  return (
    <div className={styles.root} ref={hauteur.ref}>
      <div className={styles.grille}>
        <VirtualGrid
          label={`Lignes de ${schema}.${table}`}
          columns={colonnes}
          rows={lignes}
          rowId={(ligne) => String(ligne.rang)}
          viewportHeight={hauteur.valeur}
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
      // La grille moins la barre d'état, que la mesure du parent inclut.
      const disponible = element.clientHeight - 26
      if (disponible > 0) setValeur(disponible)
    })
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])

  return { ref, valeur }
}
