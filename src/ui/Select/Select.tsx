import { type SelectHTMLAttributes, useId } from 'react'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './Select.module.css'

type SelectSize = 'sm' | 'md'

export type SelectOption<T extends string> = {
  value: T
  label: string
}

type SelectProps<T extends string> = {
  /** Étiquette visible, et nom accessible — comme `Field`, jamais décorative. */
  label: string
  options: readonly SelectOption<T>[]
  value: T
  onValueChange: (value: T) => void
  size?: SelectSize
  /** Icône à gauche de la valeur — le sac à dos du sélecteur de projet de `A2`. */
  icon?: { name: Parameters<typeof Icon>[0]['name']; color?: string }
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'onChange' | 'children'>

/**
 * Le champ à chevron de `A2` — mode SSL, projet, type de tunnel.
 *
 * Un `<select>` natif habillé, et non une liste déroulante maison : le mockup ne montre que
 * l'état fermé, donc rien n'impose une liste stylée, et le natif apporte gratuitement le
 * clavier, la recherche à la frappe et le rendu système de la liste. Le jour où un écran
 * exige une liste habillée, ce sera sa spec — pas une réécriture spéculative.
 *
 * Le chevron est **dessiné par-dessus**, `appearance: none` retirant celui du système :
 * c'est le seul moyen d'avoir exactement le glyphe du handoff.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  icon,
  className,
  id,
  ...rest
}: SelectProps<T>) {
  const autoId = useId()
  const selectId = id ?? autoId

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <div className={cx(styles.wrap, styles[size], className)}>
        {icon && (
          <span className={styles.icon} style={icon.color ? { color: icon.color } : undefined}>
            <Icon name={icon.name} size={13} strokeWidth={1.8} />
          </span>
        )}
        <select
          id={selectId}
          className={styles.select}
          value={value}
          onChange={(evenement) => onValueChange(evenement.target.value as T)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron}>
          <Icon name="chevd" size={13} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  )
}
