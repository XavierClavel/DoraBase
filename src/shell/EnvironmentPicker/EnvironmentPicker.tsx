import { useId } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { Environment } from '../../domain/config'
import { ENVIRONMENT_ORDER, ENVIRONMENTS } from '../../screens/NewConnection/environments'
import styles from './EnvironmentPicker.module.css'

type EnvironmentPickerProps = {
  value: Environment
  onValueChange: (environment: Environment) => void
}

/**
 * Le commutateur d'environnement de la barre de titre, **dans sa propre boîte**.
 *
 * Le handoff insiste : la pastille projet est une boîte blanche, puis « dans une seconde boîte
 * blanche séparée (margin-left 8 px) » vient ce sélecteur. Les fondre donnerait un bandeau
 * unique, où l'environnement se lirait comme une propriété du fil d'Ariane plutôt que comme un
 * commutateur — et le rendrait atteignable au clavier seulement après l'avoir traversé.
 *
 * Un `<select>` natif habillé, comme `Select` de `08a` : le mockup ne montre que l'état fermé,
 * et le natif apporte le clavier gratuitement. Il n'emploie pas `Select` parce que la boîte est
 * de 19 px avec un point de couleur — trois écarts sur quatre propriétés, ce qui ferait des
 * surcharges plus longues que le composant.
 */
export function EnvironmentPicker({ value, onValueChange }: EnvironmentPickerProps) {
  const id = useId()

  return (
    <div className={styles.root}>
      {/* « ENV » est un vrai `<label>` : sans lui, le sélecteur s'annoncerait sans nom. */}
      <label className={styles.legend} htmlFor={id}>
        env
      </label>
      <span className={styles.field}>
        <span className={styles.dot} data-environment={value} aria-hidden="true" />
        <select
          id={id}
          className={styles.select}
          value={value}
          onChange={(evenement) => onValueChange(evenement.target.value as Environment)}
        >
          {ENVIRONMENT_ORDER.map((environnement) => (
            <option key={environnement} value={environnement}>
              {ENVIRONMENTS[environnement].label}
            </option>
          ))}
        </select>
        <Icon name="chevd" size={11} strokeWidth={2.6} className={styles.chevron} />
      </span>
    </div>
  )
}
