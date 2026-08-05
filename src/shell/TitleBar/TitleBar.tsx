import { Icon } from '../../design/icons/Icon'
import styles from './TitleBar.module.css'

type TitleBarProps = {
  /**
   * Affiche l'accès à la console, à gauche des préférences. Absent par défaut : l'écran
   * d'accueil (A1) n'a que l'engrenage dans le mockup, les écrans de travail (A4 à A9) ont
   * les deux. Un ajout inconditionnel casserait A1.
   */
  showConsole?: boolean
}

// `data-tauri-drag-region` rend la fenêtre déplaçable : sous `titleBarStyle: Overlay`
// (spec 01), macOS ne fournit plus de zone de glissement native. Tauri ne rend
// glissables que les éléments qui portent l'attribut ; les boutons enfants restent
// cliquables sans traitement particulier.
export function TitleBar({ showConsole = false }: TitleBarProps) {
  return (
    <div className={styles.root} data-tauri-drag-region>
      <div className={styles.wordmark}>
        <svg className={styles.logo} viewBox="0 0 512 512" aria-hidden="true">
          <use href="#logo" />
        </svg>
        <span className={styles.name}>DoraBase</span>
      </div>
      <div className={styles.spacer} />
      <div className={styles.actions}>
        {showConsole && (
          <button type="button" className={styles.action} aria-label="Console">
            <Icon name="term" size={15} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" className={styles.action} aria-label="Préférences">
          <Icon name="gear" size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
