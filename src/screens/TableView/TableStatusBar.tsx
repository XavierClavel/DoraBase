import { Icon } from '../../design/icons/Icon'
import type { RowWindow } from '../../domain/engine'
import { formatInteger } from '../../ui/format'
import styles from './TableStatusBar.module.css'

type TableStatusBarProps = {
  fenetre: RowWindow | null
  loading: boolean
  error: string | null
}

/**
 * La barre d'état de 26 px : `500 lignes · 41 ms · limit 500`, puis « lecture seule ».
 *
 * **Les chiffres viennent de `RowWindow`**, pas d'un recalcul : la durée est celle mesurée par le
 * moteur, et le compte est celui de la fenêtre reçue. Les recalculer côté front produirait des
 * valeurs *plausibles* qui cesseraient d'être vraies au premier écart.
 *
 * Elle vit au niveau de l'**écran**, pas du centre : le mockup la fait courir sous les trois
 * colonnes, sidebar et panneau droit compris.
 */
export function TableStatusBar({ fenetre, loading, error }: TableStatusBarProps) {
  return (
    <div className={styles.root} role="status">
      {error ? (
        // Le message complet vit dans la grille, là où l'utilisateur cherche ses lignes ; la barre
        // ne porte que le verdict. L'écrire aux deux endroits ferait lire deux fois la même
        // phrase, et allongerait une barre de 26 px.
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
      {/* **« ⌘E pour éditer » n'est pas affiché.** L'édition est `11` ; `09e` a déjà tranché ce cas
          en retirant le rappel `⌘P` d'un champ qui ne l'honorait pas — un raccourci affiché qui ne
          répond pas est pire qu'un raccourci absent. « lecture seule » reste, c'est vrai. */}
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
