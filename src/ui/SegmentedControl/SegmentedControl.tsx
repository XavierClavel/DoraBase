import { useId } from 'react'
import { cx } from '../cx'
import styles from './SegmentedControl.module.css'

export type Segment<T extends string> = {
  value: T
  label: string
  /** Le compte affiché à droite du libellé, à `opacity .55`. */
  count: number
}

type SegmentedControlProps<T extends string> = {
  /** Nom accessible du groupe. */
  label: string
  segments: readonly Segment<T>[]
  value: T
  onValueChange: (value: T) => void
}

/**
 * Le filtre exclusif de `A4` : Tables 8 · Vues 2 · Fonctions 6 · Index 31.
 *
 * **Ce n'est pas un `RadioGroup`**, malgré la tentation. Trois écarts relevés sur le mockup :
 * hauteur 25 px contre 30, actif en `--dark` contre l'accent, et un compte accolé au libellé.
 *
 * Le fond sombre est le point qui compte, et ce n'est pas une variante de couleur mais une autre
 * intention : l'accent signale « ce que vous avez choisi de faire », l'encre « ce que vous
 * regardez ». Réemployer `RadioGroup` avec des surcharges donnerait un composant dont la moitié
 * des règles se battent — ce que `.envOption` a coûté en `08d`.
 *
 * Ce qui **est** réemployé, c'est la mécanique : des radios natives partageant un `name`, donc
 * les flèches et le bouclage gratuits, et une seule tabulation pour traverser le groupe.
 */
export function SegmentedControl<T extends string>({
  label,
  segments,
  value,
  onValueChange,
}: SegmentedControlProps<T>) {
  const nom = useId()

  return (
    <fieldset className={styles.root}>
      <legend className={styles.legend}>{label}</legend>
      {segments.map((segment) => (
        <label
          key={segment.value}
          className={cx(styles.segment, segment.value === value && styles.active)}
        >
          <input
            type="radio"
            name={nom}
            className={styles.input}
            value={segment.value}
            checked={segment.value === value}
            onChange={() => onValueChange(segment.value)}
          />
          {segment.label}
          {/* L'espace est **explicite**. Sans lui le nom accessible sort « Tables8 » : JSX
              supprime l'espace entre une expression et un élément, et `textContent` ne connaît
              pas le `gap` CSS qui les sépare à l'écran. Même piège qu'en `08a` avec le
              monogramme de `RadioGroup`, mais l'inverse en conclusion — ici le compte **doit**
              faire partie du nom, parce que « Tables 8 » est l'information et qu'elle n'est
              écrite nulle part ailleurs. */}{' '}
          <span className={styles.count}>{segment.count}</span>
        </label>
      ))}
    </fieldset>
  )
}
