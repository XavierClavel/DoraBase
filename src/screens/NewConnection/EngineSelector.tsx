import { Icon } from '../../design/icons/Icon'
import type { Engine } from '../../domain/config'
import { useT } from '../../i18n/LanguageContext'
import { RadioGroup } from '../../ui/RadioGroup/RadioGroup'
import { ENGINE_ORDER, ENGINES } from './engines'
import styles from './NewConnection.module.css'

type EngineSelectorProps = {
  value: Engine
  onValueChange: (engine: Engine) => void
}

/** Le sélecteur de moteur de `A2` : sept boutons, quatre icônes de moteur, un monogramme. */
export function EngineSelector({ value, onValueChange }: EngineSelectorProps) {
  const t = useT()
  const titre = t('newConnection.engine.title')
  const options = ENGINE_ORDER.map((engine) => {
    const { label, monogram, icon, color } = ENGINES[engine]
    return {
      value: engine,
      label,
      // La couleur est celle du moteur quand le bouton est inactif ; `RadioGroup` la remplace par
      // du blanc translucide quand il est actif, comme le mockup le fait passer `Pg` de
      // `#31648F` à `opacity:.85` sur fond accent — repris ici pour l'icône comme pour le
      // monogramme, `Icon` traçant en `currentColor`.
      prefix: icon ? (
        <span style={{ color }}>
          <Icon name={icon} size={15} strokeWidth={1.9} />
        </span>
      ) : monogram ? (
        <span style={{ color }}>{monogram}</span>
      ) : undefined,
    }
  })

  return (
    <div className={styles.engineBlock}>
      <div className={styles.blockTitle}>{titre}</div>
      <RadioGroup label={titre} options={options} value={value} onValueChange={onValueChange} />
    </div>
  )
}
