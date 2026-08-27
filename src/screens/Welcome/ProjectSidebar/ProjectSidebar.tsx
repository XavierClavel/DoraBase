import { Icon } from '../../../design/icons/Icon'
import { useT } from '../../../i18n/LanguageContext'
import { Button } from '../../../ui/Button/Button'
import styles from './ProjectSidebar.module.css'

type ProjectSidebarProps = {
  onNewProject: () => void
}

export function ProjectSidebar({ onNewProject }: ProjectSidebarProps) {
  const t = useT()
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Icon name="bag" size={13} strokeWidth={2} />
        {t('welcome.sidebar.header')}
      </div>
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Icon name="db" size={20} strokeWidth={1.8} />
        </div>
        <div className={styles.emptyTitle}>{t('welcome.sidebar.emptyTitle')}</div>
        <div className={styles.emptyText}>{t('welcome.sidebar.emptyText')}</div>
      </div>
      <div className={styles.footer}>
        <Button variant="accent" size="md" className={styles.newProject} onClick={onNewProject}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          {t('welcome.sidebar.newProject')}
        </Button>
      </div>
    </div>
  )
}
