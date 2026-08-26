import { StatusBar } from '../../shell/StatusBar/StatusBar'
import { TitleBar } from '../../shell/TitleBar/TitleBar'
import { ProjectSidebar } from './ProjectSidebar/ProjectSidebar'
import { WelcomeHero } from './WelcomeHero/WelcomeHero'
import styles from './WelcomeScreen.module.css'

type WelcomeScreenProps = {
  onNewProject: () => void
  projectCount: number
  /** Vrai quand une modale bloque la fenêtre : la barre de titre se ternit (`08b`). */
  dimmed?: boolean
}

/**
 * `A1`, l'écran des débuts.
 *
 * **`⌘N` n'est plus monté ici** (`24d`) : il vivait dans cet écran, donc il ne répondait que sur `A1`.
 * `useRaccourcisDeCreation` le tient une fois pour l'application entière — et lui seul depuis que
 * `⇧⌘N` a été retiré (26 août 2026).
 */
export function WelcomeScreen({ onNewProject, projectCount, dimmed = false }: WelcomeScreenProps) {
  return (
    <div className={styles.root}>
      <TitleBar dimmed={dimmed} />
      <div className={styles.body}>
        <ProjectSidebar onNewProject={onNewProject} />
        <WelcomeHero onNewProject={onNewProject} />
      </div>
      <StatusBar projectCount={projectCount} />
    </div>
  )
}
