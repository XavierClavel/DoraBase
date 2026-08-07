import { type ReactNode, useId } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import { cx } from '../cx'
import styles from './CollapsiblePanel.module.css'

type CollapsiblePanelProps = {
  title: string
  /** Icône de l'en-tête — le bouclier violet du panneau proxy de `A2`. */
  icon?: IconName
  /** Contenu à droite du titre : le badge « SSH activé » de `A2`. */
  badge?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: ReactNode
}

/**
 * L'encadré à chevron du panneau « Proxy / tunnel » de `A2`.
 *
 * L'en-tête entier est le bouton, pas seulement le chevron : c'est ce que le mockup
 * suggère (aucun cadre autour du chevron seul) et c'est une cible bien plus grande.
 *
 * Replié, le contenu est **retiré du DOM** plutôt que masqué en CSS. Deux raisons : il
 * sort de l'arbre d'accessibilité, donc un lecteur d'écran ne l'annonce pas ; et ses
 * champs sortent de l'ordre de tabulation, donc le piège de focus de `Modal` ne les
 * compte plus — un `display:none` y suffirait, mais un `visibility` ou une hauteur nulle
 * non, et la différence est invisible à la relecture.
 */
export function CollapsiblePanel({
  title,
  icon,
  badge,
  open,
  onOpenChange,
  className,
  children,
}: CollapsiblePanelProps) {
  const contenuId = useId()

  return (
    <section className={cx(styles.root, className)}>
      <button
        type="button"
        className={cx(styles.header, open && styles.headerOpen)}
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={contenuId}
      >
        <span className={cx(styles.chevron, open && styles.chevronOpen)}>
          <Icon name="chevd" size={14} strokeWidth={2} />
        </span>
        {icon && (
          <span className={styles.icon}>
            <Icon name={icon} size={14} strokeWidth={1.9} />
          </span>
        )}
        <span className={styles.title}>{title}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
      </button>
      {open && (
        <div id={contenuId} className={styles.body}>
          {children}
        </div>
      )}
    </section>
  )
}
