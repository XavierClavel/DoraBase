import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './Sidebar.module.css'

type SidebarProps = {
  /** La barre de filtre, en haut. Un `SidebarFilterBar` en pratique. */
  filter: ReactNode
  /** L'arbre et sa section contextuelle, dans une zone défilante. */
  children: ReactNode
  /** Pied optionnel — les sidebars de console (A7, A8) et celle de `A4` en ont un. */
  footer?: ReactNode
  /**
   * Largeur de la colonne.
   *
   * **Deux valeurs, relevées sur le handoff** : 212 px pour `A5` → `A9`, 252 px pour `A4`.
   * L'arbre de `A4` a un niveau de plus — projet → base → schéma → table — donc quarante pixels
   * de plus pour la même profondeur d'indentation.
   *
   * Une variante de largeur, et non un second composant : la structure est identique, seule
   * cette propriété change.
   *
   * **`fill` est la troisième, et elle n'est pas dans le handoff** : elle laisse la largeur au
   * conteneur. L'écran de travail de `10b` place la sidebar dans un `SplitPane` redimensionnable
   * — une largeur fixe y rendrait la poignée sans effet, et le mockup, qui montre des écrans
   * figés, ne peut pas exprimer un panneau que l'utilisateur déplace.
   */
  width?: 'standard' | 'wide' | 'fill'
}

// Colonne de 212 px partagée par A5 → A9. Purement structurelle : elle ne connaît ni
// l'arbre, ni son état d'ouverture, ni la sélection. L'écran consommateur aplatit son
// modèle et place lui-même ses `TreeRow`, son `SidebarSectionTitle` et ses `ColumnRow` —
// voir `specs/04-menu-lateral-standard.md`, qui écarte toute récursion tant qu'aucun écran
// n'en impose la forme.
export function Sidebar({ filter, children, footer, width = 'standard' }: SidebarProps) {
  return (
    <div className={cx(styles.root, styles[width])}>
      {filter}
      <div className={styles.body}>{children}</div>
      {footer}
    </div>
  )
}
