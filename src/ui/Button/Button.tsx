import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import styles from './Button.module.css'

type ButtonVariant = 'accent' | 'dark' | 'secondary'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Indice visuel de raccourci clavier (ex. « ⌘N ») — décoratif, exclu du nom accessible. */
  shortcut?: string
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

// Cinq tailles (xs 23 / sm 25 / md 28 / lg 31 / xl 34) et trois variantes de couleur
// (accent, encre, secondaire bordé) relevées sur les dix écrans du handoff — voir
// Button.module.css pour la correspondance taille → rayon → police → remplissage.
export function Button({
  variant = 'accent',
  size = 'md',
  shortcut,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.root, styles[variant], styles[size], className)}
      {...rest}
    >
      {children}
      {shortcut !== undefined && (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      )}
    </button>
  )
}
