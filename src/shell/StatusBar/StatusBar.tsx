import { appVersion } from '../../app/version'
import { useT } from '../../i18n/LanguageContext'
import { MiseAJour } from '../MiseAJour/MiseAJour'
import styles from './StatusBar.module.css'

type StatusBarProps = {
  projectCount: number
}

export function StatusBar({ projectCount }: StatusBarProps) {
  const t = useT()
  return (
    <div className={styles.root}>
      <span>{t('shell.statusBar.projectCount', { count: projectCount })}</span>
      <span>·</span>
      <span>{t('shell.statusBar.paletteHint')}</span>
      <span className={styles.spacer} />
      {/*
       * **Avant le numéro de version, pas après.** L'ordre de lecture est « une version
       * existe, celle-ci tourne » : le contraire ferait passer l'annonce pour un commentaire
       * du numéro. Et rien ne s'affiche tant qu'aucune version n'est trouvée — donc la barre
       * garde exactement sa mise en page d'avant dans tous les décors de test.
       */}
      <MiseAJour />
      <span>{t('shell.statusBar.version', { version: appVersion })}</span>
    </div>
  )
}
