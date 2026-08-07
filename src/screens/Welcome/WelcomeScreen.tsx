import { useEffect } from 'react'
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

export function WelcomeScreen({ onNewProject, projectCount, dimmed = false }: WelcomeScreenProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNewProject()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNewProject])

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
