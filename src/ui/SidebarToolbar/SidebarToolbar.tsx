import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import styles from './SidebarToolbar.module.css'

/**
 * La bande d'actions en tête de sidebar (26 août 2026, à la demande).
 *
 * # Ce qu'elle remplace, et pourquoi en haut
 *
 * Le pied de la sidebar portait deux boutons à libellé, « Connexion » et « Projet ». Le premier est
 * parti au menu d'une ligne d'environnement, qui sait dans quel environnement la connexion se déclare
 * — le pied devait le deviner. Restait un geste seul, et un pied de 78 px pour lui : la place se prend
 * sur la hauteur de l'arbre, qui est ce qu'on vient lire.
 *
 * En tête, la bande coûte 35 px et vit là où l'on cherche les actions d'un panneau. Elle porte des
 * **icônes seules**, ce que le pied ne pouvait pas faire : le sac est le glyphe du projet dans tout le
 * produit — pastille de la barre de titre, arbre, modales — et se lit sans son libellé.
 *
 * # Un composant, pas un `<div>` dans l'écran
 *
 * `Sidebar` est purement structurelle et le reste : la bande est un `ReactNode` qu'elle place, comme
 * la barre de filtre et le pied. Ce fichier existe pour que la facture — hauteur, filet, taille des
 * carrés, survol — soit écrite une fois, et non recopiée dans chaque sidebar qui en voudra une.
 */
export function SidebarToolbar({ children }: { children: ReactNode }) {
  return (
    // `role="toolbar"` : un groupe de contrôles de même nature. C'est ce qui fait annoncer « barre
    // d'outils, 1 élément » plutôt qu'un bouton isolé au milieu de rien.
    <div className={styles.root} role="toolbar" aria-label="Actions de l’arborescence">
      {children}
    </div>
  )
}

type SidebarToolbarButtonProps = {
  icon: IconName
  /**
   * Le nom accessible, **obligatoire** : le bouton n'a pas de libellé visible, donc rien d'autre ne le
   * nomme. Un `aria-label` optionnel aurait fini par manquer (« Tables8 », défaut n° 1 de la liste
   * d'accessibilité) ; ici le compilateur le réclame.
   */
  label: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>

/** Une action de la bande : une icône en trait, carrée, nommée. */
export function SidebarToolbarButton({ icon, label, ...rest }: SidebarToolbarButtonProps) {
  return (
    <button type="button" className={styles.bouton} aria-label={label} {...rest}>
      <Icon name={icon} size={14} strokeWidth={2} />
    </button>
  )
}
