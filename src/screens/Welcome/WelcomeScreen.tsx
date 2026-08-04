import { useEffect } from 'react'
import { StatusBar } from '../../shell/StatusBar/StatusBar'
import { TitleBar } from '../../shell/TitleBar/TitleBar'
import { ProjectSidebar } from './ProjectSidebar/ProjectSidebar'
import { WelcomeHero } from './WelcomeHero/WelcomeHero'
import styles from './WelcomeScreen.module.css'

type WelcomeScreenProps = {
  onNewProject: () => void
  projectCount: number
}

export function WelcomeScreen({ onNewProject, projectCount }: WelcomeScreenProps) {
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
      <TitleBar />
      <div className={styles.body}>
        <ProjectSidebar onNewProject={onNewProject} />
        <WelcomeHero onNewProject={onNewProject} />
      </div>
      <StatusBar projectCount={projectCount} />
    </div>
  )
}
