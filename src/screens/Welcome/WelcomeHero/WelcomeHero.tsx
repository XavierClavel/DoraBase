import { Icon } from '../../../design/icons/Icon'
import { Button } from '../../../ui/Button/Button'
import styles from './WelcomeHero.module.css'

type WelcomeHeroProps = {
  onNewProject: () => void
}

export function WelcomeHero({ onNewProject }: WelcomeHeroProps) {
  return (
    <div className={styles.root}>
      <div className={styles.content}>
        <svg className={styles.logo} viewBox="0 0 512 512" aria-hidden="true">
          <use href="#logo" />
        </svg>
        {/* Espace insécable avant le point d'interrogation, tel que le mockup le pose. */}
        <h1 className={styles.title}>{'Prêt à explorer ?'}</h1>
        <p className={styles.subtitle}>
          Crée un projet, branche ses bases, puis bascule de dev à prod d'un seul clic. Pas d'IDE à
          lancer.
        </p>
        <div className={styles.actions}>
          <Button variant="dark" size="xl" shortcut="⌘N" onClick={onNewProject}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Nouveau projet
          </Button>
        </div>
      </div>
    </div>
  )
}
