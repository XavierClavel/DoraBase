import { Icon } from '../../design/icons/Icon'
import type { RowWindow } from '../../domain/engine'
import { MiseAJour } from '../../shell/MiseAJour/MiseAJour'
import { cx } from '../../ui/cx'
import { formatInteger } from '../../ui/format'
import styles from './TableStatusBar.module.css'

type TableStatusBarProps = {
  fenetre: RowWindow | null
  loading: boolean
  error: string | null
  /**
   * Le nombre de modifications en attente (`11b`). Au-dessus de zéro, la barre passe en ambre et
   * dit ce qui attend plutôt que ce qui a été lu.
   */
  pendingChanges?: number
  /** Vrai quand l'onglet est en mode édition — le rappel `⌘E` change de sens. */
  editing?: boolean
}

/**
 * La barre d'état de 26 px : `500 lignes · 41 ms · limit 500`, puis « lecture seule ».
 *
 * **Elle porte l'annonce de mise à jour, et c'est un correctif du 26 août 2026.** `MiseAJour` n'était
 * monté que dans `shell/StatusBar`, que seul `WelcomeScreen` rend : dès qu'un onglet était ouvert —
 * donc pendant toute une session de travail — l'annonce n'existait nulle part. Elle ne rend rien
 * tant qu'aucune version n'est trouvée, et la recherche est rejetée hors de la webview : aucun
 * décor, aucune capture de fidélité ne bouge. **Les deux sorties de cette fonction la portent** —
 * celle du mode édition est exactement le genre de branche qu'on oublie.
 *
 * **Les chiffres viennent de `RowWindow`**, pas d'un recalcul : la durée est celle mesurée par le
 * moteur, et le compte est celui de la fenêtre reçue. Les recalculer côté front produirait des
 * valeurs *plausibles* qui cesseraient d'être vraies au premier écart.
 *
 * Elle vit au niveau de l'**écran**, pas du centre : le mockup la fait courir sous les trois
 * colonnes, sidebar et panneau droit compris.
 */
export function TableStatusBar({
  fenetre,
  loading,
  error,
  pendingChanges = 0,
  editing = false,
}: TableStatusBarProps) {
  // **La barre du mode édition dit autre chose**, et le mockup le montre : « 3 modifications en
  // attente · 0 envoyée · transaction non ouverte ». Le compte de lignes lu n'est plus l'information
  // qui compte quand quelque chose attend d'être écrit.
  if (pendingChanges > 0) {
    return (
      <div className={cx(styles.root, styles.edition)} role="status" aria-label="État de la table">
        <span className={styles.attente}>
          {pendingChanges} modification{pendingChanges > 1 ? 's' : ''} en attente
        </span>
        <span>·</span>
        {/* « 0 envoyée » est **vrai et important** : c'est la promesse que rien n'est parti. Elle
            restera à zéro jusqu'à `11d`, qui écrit. */}
        <span>0 envoyée</span>
        <span>·</span>
        <span>transaction non ouverte</span>
        <span className={styles.espace} />
        <MiseAJour />
        <span>⌘E quitte l’édition</span>
      </div>
    )
  }

  return (
    <div className={styles.root} role="status" aria-label="État de la table">
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
      <MiseAJour />
      {/* **Le rappel `⌘E` est enfin honoré.** `10c` l'avait retiré faute d'écran qui y réponde — un
          raccourci affiché qui ne répond pas est pire qu'un raccourci absent (`09e`). `11b` livre la
          bascule, donc il revient. */}
      <span className={styles.lecture}>
        <Icon name={editing ? 'pencil' : 'lock'} size={11} strokeWidth={2.2} />
        {editing ? 'édition — aucune modification' : 'lecture seule — ⌘E pour éditer'}
      </span>
    </div>
  )
}

/** Le `limit` du SQL réellement exécuté — jamais une valeur reconstruite depuis l'état. */
function limiteLue(sql: string): string {
  return /limit\s+(\d+)/i.exec(sql)?.[1] ?? '—'
}
