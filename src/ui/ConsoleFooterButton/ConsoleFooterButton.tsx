import { Icon } from '../../design/icons/Icon'
import styles from './ConsoleFooterButton.module.css'

type ConsoleFooterButtonProps = {
  onClick: () => void
}

// Pied de la sidebar des consoles (A7, A8). Proche de `Button variant="secondary"` — même
// fond blanc bordé — mais il en diffère sur trois points mesurés : hauteur 26 px (absente
// de l'échelle `--h-btn-*`, qui va de 23 à 34 sans passer par 26), graisse 700 au lieu de
// 600, et encre pleine au lieu de `--ink-2`.
//
// Dette assumée : 26 px avec rayon 8 revient **onze fois** dans le mockup, mais toutes les
// autres occurrences appartiennent à A10 (préférences) — hors périmètre de la spec 04. Au
// moment d'écrire la spec 15, promouvoir 26 px dans l'échelle de `Button` et réécrire cette
// brique par-dessus, plutôt que de dupliquer une troisième fois.
export function ConsoleFooterButton({ onClick }: ConsoleFooterButtonProps) {
  return (
    <div className={styles.root}>
      <button type="button" className={styles.button} onClick={onClick}>
        <Icon name="plus" size={12} strokeWidth={2.2} />
        Nouvelle console
      </button>
    </div>
  )
}
