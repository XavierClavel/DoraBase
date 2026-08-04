import { appVersion } from '../../app/version'
import styles from './StatusBar.module.css'

type StatusBarProps = {
  projectCount: number
}

export function StatusBar({ projectCount }: StatusBarProps) {
  return (
    <div className={styles.root}>
      <span>
        {projectCount} projet{projectCount > 1 ? 's' : ''}
      </span>
      <span>·</span>
      <span>⌘K palette</span>
      <span className={styles.spacer} />
      <span>DoraBase {appVersion}</span>
    </div>
  )
}
