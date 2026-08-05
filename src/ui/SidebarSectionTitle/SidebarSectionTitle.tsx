import type { ReactNode } from 'react'
import styles from './SidebarSectionTitle.module.css'

type SidebarSectionTitleProps = {
  children: ReactNode
}

// Bandeau de section contextuelle en bas de l'arbre : « Colonnes de <table> » (A5, A6, A9),
// « Mes requêtes » (A7), « Schéma déduit » (A8). Les capitales viennent de `text-transform`,
// pas du contenu — un lecteur d'écran annonce ainsi la casse naturelle.
export function SidebarSectionTitle({ children }: SidebarSectionTitleProps) {
  return <div className={styles.root}>{children}</div>
}
