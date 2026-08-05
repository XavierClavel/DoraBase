import type { ReactNode } from 'react'
import styles from './Sidebar.module.css'

type SidebarProps = {
  /** La barre de filtre, en haut. Un `SidebarFilterBar` en pratique. */
  filter: ReactNode
  /** L'arbre et sa section contextuelle, dans une zone défilante. */
  children: ReactNode
  /** Pied optionnel — les sidebars de console (A7, A8) seules en ont un. */
  footer?: ReactNode
}

// Colonne de 212 px partagée par A5 → A9. Purement structurelle : elle ne connaît ni
// l'arbre, ni son état d'ouverture, ni la sélection. L'écran consommateur aplatit son
// modèle et place lui-même ses `TreeRow`, son `SidebarSectionTitle` et ses `ColumnRow` —
// voir `specs/04-menu-lateral-standard.md`, qui écarte toute récursion tant qu'aucun écran
// n'en impose la forme.
export function Sidebar({ filter, children, footer }: SidebarProps) {
  return (
    <div className={styles.root}>
      {filter}
      <div className={styles.body}>{children}</div>
      {footer}
    </div>
  )
}
