import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './Badge.module.css'

type BadgeTone = 'danger' | 'warn' | 'success' | 'violet' | 'muted' | 'engine-mg'
type BadgeSize = 'xs' | 'sm' | 'md' | 'lg'

type BadgeProps = {
  tone?: BadgeTone
  size?: BadgeSize
  /** Icône décorative (ex. `<Icon name="lock" />`) — `Icon` la marque déjà `aria-hidden`. */
  icon?: ReactNode
  children: ReactNode
  className?: string
}

// Étiquette d'état non interactive — PROD/STAGING dans l'arbre, LECTURE SEULE, ÉDITION,
// Trousseau, SSH activé (voir Badge.module.css pour le relevé des quatre tailles). Un
// `<span>`, jamais un bouton : rien ne s'y clique, le texte est la seule information et
// il ne doit jamais être masqué aux lecteurs d'écran (contrairement à l'icône décorative
// qui l'accompagne).
export function Badge({ tone = 'muted', size = 'sm', icon, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.root, styles[tone], styles[size], className)}>
      {icon}
      {children}
    </span>
  )
}
