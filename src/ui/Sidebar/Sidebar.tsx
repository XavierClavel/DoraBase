import type { ReactNode } from 'react'
import { cx } from '../cx'
import styles from './Sidebar.module.css'

type SidebarProps = {
  /**
   * La bande d'actions, **au-dessus du filtre**. Un `SidebarToolbar` en pratique (26 août 2026).
   *
   * Optionnelle : une sidebar sans action de structure à offrir n'en rend pas.
   * Au-dessus et non en dessous : on filtre ce qu'on voit, on agit sur le panneau — la bande
   * appartient au panneau, la barre de filtre à sa liste.
   */
  toolbar?: ReactNode
  /** La barre de filtre, en haut. Un `SidebarFilterBar` en pratique. */
  filter: ReactNode
  /** L'arbre et sa section contextuelle, dans une zone défilante. */
  children: ReactNode
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
// toute récursion est écartée tant qu'aucun écran
// n'en impose la forme.
export function Sidebar({ toolbar, filter, children, width = 'standard' }: SidebarProps) {
  return (
    <div className={cx(styles.root, styles[width])}>
      {toolbar}
      {filter}
      <div className={styles.body}>{children}</div>
    </div>
  )
}
