import { Icon } from '../../design/icons/Icon'
import styles from './SidebarFilterBar.module.css'

type SidebarFilterBarProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Nombre de lignes retenues. Avec `totalCount`, affiche un compteur `n/m` à droite. */
  matchCount?: number
  totalCount?: number
}

// Barre de filtre de la sidebar standard (A5 → A9). Contrôlée : elle ne filtre rien
// elle-même, l'écran consommateur détient la valeur et la liste.
export function SidebarFilterBar({
  value,
  onChange,
  placeholder = "Filtrer l'arborescence…",
  matchCount,
  totalCount,
}: SidebarFilterBarProps) {
  const showCount = matchCount !== undefined && totalCount !== undefined

  return (
    <div className={styles.root}>
      <Icon name="search" size={12} strokeWidth={2} className={styles.icon} />
      {/* Pas d'étiquette visible dans la maquette, mais un champ sans nom accessible est
          muet pour un lecteur d'écran : le placeholder ne fait pas office de nom. D'où
          `aria-label`, qui reprend le même texte. */}
      <input
        type="text"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {showCount && (
        <span className={styles.count}>
          {matchCount}/{totalCount}
        </span>
      )}
    </div>
  )
}
