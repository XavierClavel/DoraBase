import { Icon } from '../../../design/icons/Icon'
import { useT } from '../../../i18n/LanguageContext'
import { raccourci } from '../../../shell/plateforme'
import { Button } from '../../../ui/Button/Button'
import styles from './WelcomeHero.module.css'

type WelcomeHeroProps = {
  onNewProject: () => void
}

export function WelcomeHero({ onNewProject }: WelcomeHeroProps) {
  const t = useT()
  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <svg className={styles.logo} viewBox="0 0 512 512" aria-hidden="true">
          <use href="#logo" />
        </svg>
        {/* Espace insécable avant le point d'interrogation, porté par le dictionnaire lui-même. */}
        <h1 className={styles.title}>{t('welcome.hero.title')}</h1>
        <p className={styles.subtitle}>{t('welcome.hero.subtitle')}</p>
        <div className={styles.actions}>
          <Button variant="dark" size="xl" shortcut={raccourci('N')} onClick={onNewProject}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            {t('welcome.hero.newProject')}
          </Button>
        </div>
      </div>
    </div>
  )
}
