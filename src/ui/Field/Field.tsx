import { type InputHTMLAttributes, useId } from 'react'
import { cx } from '../cx'
import styles from './Field.module.css'

type FieldSize = 'sm' | 'md'

type FieldProps = {
  /** Étiquette visible, et nom accessible du champ — obligatoire, jamais décorative. */
  label: string
  size?: FieldSize
  /** Rend la valeur en mono, comme le handoff le fait pour toute valeur technique. */
  mono?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>

export function Field({ label, size = 'md', mono = false, className, id, ...rest }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={styles.root}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={cx(styles.input, styles[size], mono && styles.mono, className)}
        {...rest}
      />
    </div>
  )
}
