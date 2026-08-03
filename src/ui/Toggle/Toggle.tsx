import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../cx'
import styles from './Toggle.module.css'

type ToggleProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Nom accessible du contrôle. Obligatoire : un interrupteur anonyme est inutilisable. */
  label: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children' | 'aria-label'>

// Un `<button role="switch">` plutôt qu'une case à cocher : le handoff dessine une piste
// et un bouton glissant, pas une case, et `role="switch"` porte l'état allumé/éteint dans
// `aria-checked` — ce qu'un lecteur d'écran annonce correctement. Espace et Entrée
// fonctionnent nativement, sans gestionnaire clavier à écrire.
export function Toggle({
  checked,
  onCheckedChange,
  label,
  className,
  disabled,
  ...rest
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(styles.root, className)}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className={styles.knob} />
    </button>
  )
}
