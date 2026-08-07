import type { Engine } from '../../domain/config'
import { RadioGroup } from '../../ui/RadioGroup/RadioGroup'
import { ENGINE_ORDER, ENGINES } from './engines'
import styles from './NewConnection.module.css'

type EngineSelectorProps = {
  value: Engine
  onValueChange: (engine: Engine) => void
}

/** Le sélecteur de moteur de `A2` : sept boutons, cinq monogrammes. */
export function EngineSelector({ value, onValueChange }: EngineSelectorProps) {
  const options = ENGINE_ORDER.map((engine) => {
    const { label, monogram, color } = ENGINES[engine]
    return {
      value: engine,
      label,
      prefix: monogram ? (
        // La couleur du monogramme est celle du moteur quand le bouton est inactif ;
        // `RadioGroup` la remplace par du blanc translucide quand il est actif, comme le
        // mockup le fait passer `Pg` de `#31648F` à `opacity:.85` sur fond accent.
        <span style={{ color }}>{monogram}</span>
      ) : undefined,
    }
  })

  return (
    <div className={styles.engineBlock}>
      <div className={styles.blockTitle}>Moteur</div>
      <RadioGroup label="Moteur" options={options} value={value} onValueChange={onValueChange} />
    </div>
  )
}
