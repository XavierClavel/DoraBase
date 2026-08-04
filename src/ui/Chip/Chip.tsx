import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './Chip.module.css'

type ChipVariant = 'default' | 'accent' | 'selected'
type ChipSize = 'sm' | 'md' | 'lg'

type ChipProps = {
  variant?: ChipVariant
  size?: ChipSize
  /** Icône décorative en tête (ex. `<Icon name="filter" />`) — déjà `aria-hidden`. */
  icon?: ReactNode
  onClick?: () => void
  onRemove?: () => void
  /** Nom accessible de la croix de suppression — obligatoire dès qu'`onRemove` est fourni. */
  removeLabel?: string
  children: ReactNode
  className?: string
}

// Trois usages du handoff (chip de filtre actif, chip de tri, chip de moteur du
// sélecteur) partagent la même forme — pastille arrondie, icône + texte — mais pas
// la même interactivité : voir Chip.module.css pour le relevé complet.
//
// Sans `onClick`, le chip n'est qu'un affichage (<span>), comme le chip de tri qui ne
// se clique jamais dans le handoff. Avec `onClick`, la racine devient interactive —
// mais pas un vrai <button> : la croix de suppression est elle-même un vrai bouton, et
// le HTML interdit un <button> dans un <button> (erreur d'hydratation, arbre
// d'accessibilité corrompu). On reprend donc le motif ARIA standard d'un élément
// composite avec action nichée : un <div role="button" tabIndex={0}>, focalisable et
// actionnable au clavier (Espace/Entrée gérés à la main puisqu'un <div> ne le fait pas
// nativement), qui peut sans souci contenir un vrai <button> pour la croix.
export function Chip({
  variant = 'default',
  size = 'sm',
  icon,
  onClick,
  onRemove,
  removeLabel,
  children,
  className,
}: ChipProps) {
  const classes = cx(styles.root, styles[variant], styles[size], className)

  const remove = onRemove && (
    <button
      type="button"
      className={styles.remove}
      aria-label={removeLabel}
      onClick={(event: MouseEvent) => {
        event.stopPropagation()
        onRemove()
      }}
    >
      <Icon name="x" size={11} strokeWidth={2.4} />
    </button>
  )

  if (onClick) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: <button> imbriqué interdit, voir plus haut.
      <div
        role="button"
        tabIndex={0}
        className={classes}
        onClick={onClick}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
      >
        {icon}
        {children}
        {remove}
      </div>
    )
  }

  return (
    <span className={classes}>
      {icon}
      {children}
      {remove}
    </span>
  )
}
