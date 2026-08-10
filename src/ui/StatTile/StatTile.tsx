import { cx } from '../cx'
import styles from './StatTile.module.css'

type StatTileProps = {
  /** Intitulé, rendu en capitales — « LIGNES », « TAILLE ». */
  label: string
  /** Valeur déjà formatée. Le formatage appartient à `format.ts`, pas à l'affichage. */
  value: string
  /**
   * Précision de la valeur, quand elle n'est pas exacte.
   *
   * **Le compte de lignes de `A4` est une estimation** — `reltuples`, que `06c` traduit — là où
   * la taille est exacte. Les présenter à l'identique est un mensonge de précision, que le
   * handoff commet et que `09f` corrige par cette mention. Elle porte le `title` de la tuile et
   * un astérisque discret, faute de forme maquettée.
   */
  approximate?: boolean
  /**
   * Explique un tiret cadratin, quand la valeur est **inconnue** plutôt qu'absente.
   *
   * Sans elle, une tuile « Lignes — » ne dit pas si la table est vide, si l'information manque ou
   * si l'écran a échoué. C'est le cas d'une relation jamais analysée (`RowCount::Unknown`).
   */
  unknownHint?: string
  className?: string
}

/**
 * Une tuile de statistique du panneau de détail de `A4`.
 *
 * La valeur est en **mono 15 px gras**, l'intitulé en Nunito 9.5 px capitales : le contraste de
 * fonte fait le travail que ferait ailleurs une hiérarchie de taille. C'est aussi la règle du
 * produit — une valeur technique est en mono (`08b`).
 */
export function StatTile({
  label,
  value,
  approximate = false,
  unknownHint,
  className,
}: StatTileProps) {
  return (
    <div
      className={cx(styles.root, className)}
      title={
        approximate ? `${label} : estimation du catalogue, non un comptage exact` : unknownHint
      }
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {value}
        {approximate && (
          <span className={styles.approx} aria-hidden="true">
            *
          </span>
        )}
      </div>
    </div>
  )
}
