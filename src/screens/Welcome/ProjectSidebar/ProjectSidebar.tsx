import { Icon } from '../../../design/icons/Icon'
import { Button } from '../../../ui/Button/Button'
import styles from './ProjectSidebar.module.css'

type ProjectSidebarProps = {
  onNewProject: () => void
}

export function ProjectSidebar({ onNewProject }: ProjectSidebarProps) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Icon name="bag" size={13} strokeWidth={2} />
        Mes projets
      </div>
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Icon name="db" size={20} strokeWidth={1.8} />
        </div>
        <div className={styles.emptyTitle}>Aucun projet</div>
        <div className={styles.emptyText}>
          Un projet regroupe plusieurs bases ; chacune se décline par environnement.
        </div>
      </div>
      <div className={styles.footer}>
        <Button variant="accent" size="md" className={styles.newProject} onClick={onNewProject}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          Nouveau projet
        </Button>
      </div>
    </div>
  )
}
