import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import styles from './SidebarFooter.module.css'

/**
 * Le pied d'une sidebar et ses actions de création (`04`, `A4`, `A7`), refondu le 20 août 2026.
 *
 * **Ce qui ne marchait pas** : le pied portait deux factures visuelles empilées. « Nouvelle console »
 * était un bouton bordé pleine largeur, tandis que « Connexion » et « Projet » étaient deux pastilles
 * nues de 20 px partageant une barre de 28 px avec une icône « Rafraîchir » poussée à droite. Trois
 * actions de même nature — créer quelque chose — s'annonçaient de trois façons différentes, et la
 * plus rare des trois (créer un projet) était la moins visible.
 *
 * **La forme retenue** donne une seule facture aux trois, et porte la hiérarchie par la **largeur**
 * plutôt que par la présence ou l'absence de bordure : l'action de travail prend la ligne entière,
 * les deux actions de structure se partagent la suivante. Le pied passe de 28 px à 78 px ; c'est le
 * prix de l'homogénéité, pris sur la hauteur de l'arbre, et il a été arbitré comme tel.
 *
 * **`box-sizing: border-box`, et la hauteur a été convertie avec** — la mémoire du défaut n° 67,
 * héritée de `ConsoleFooterButton` que cette primitive remplace. La hauteur du handoff (26 px)
 * désigne le *contenu*, le filet s'ajoutant par-dessus, et `<button>` est en `border-box` par la
 * feuille du navigateur. Mais `box-sizing` ne se règle pas par axe : en `content-box`, la même
 * déclaration s'applique à la **largeur**, et avec `width: 100%` les deux filets s'ajoutent aux
 * 100 % du pied — le bouton sort de la colonne par la droite. Écrire **28 en `border-box`** rend
 * exactement ce que rendait 26 en `content-box`, et la largeur cesse de déborder. *Quand une valeur
 * du handoff désigne le contenu et qu'une largeur vaut 100 %, c'est la valeur qu'il faut convertir,
 * pas le modèle de boîte qu'il faut changer.*
 *
 * **C'est aussi pourquoi `Button` n'est pas réemployé ici**, et la dette écrite dans
 * `ConsoleFooterButton` (« promouvoir 26 px dans l'échelle de `Button` ») se solde par la négative :
 * `Button.root` impose `content-box` — choix documenté de `02`, le mockup cotant le contenu — donc
 * `size="md" variant="secondary"` rendrait 30 px, et lui poser `width: 100%` reproduirait la cause
 * exacte du défaut n° 67 à un endroit où `Button` ne peut pas la corriger sans raccourcir ses cinq
 * tailles partout ailleurs. Un `fullWidth` qui basculerait `box-sizing` ferait de `Button` un
 * composant à deux modèles de boîte. Une primitive séparée, dont la raison d'être écrite est
 * « pleine largeur, donc `border-box` », est plus honnête que cette surcharge.
 */
export function SidebarFooter({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>
}

/**
 * Une rangée de deux actions qui se partagent la largeur.
 *
 * `flex: 1 1 0` et non `1 1 auto` : les enfants se partagent la place **également** et rétrécissent
 * avant de déborder, quel que soit le mot qu'ils portent. À 180 px — la largeur minimale de la
 * sidebar (`SplitPane min={180}`) — chaque bouton tombe à 79 px, et c'est le libellé qui cède.
 */
export function SidebarFooterRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>
}

type SidebarFooterButtonProps = {
  icon: IconName
  /** Le libellé **visible**, court : c'est lui qui cède par l'ellipse quand la colonne rétrécit. */
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

/**
 * Une action de création du pied.
 *
 * `aria-label` et `title` passent par `...rest`, et c'est délibéré : le libellé visible est court
 * (« Connexion »), le nom accessible reste entier (« Ajouter une connexion »), et le raccourci vit
 * dans l'infobulle. **Ce que la voix annonce ne rétrécit donc pas avec la colonne**, et les tests
 * continuent de désigner l'action par son vrai nom.
 */
export function SidebarFooterButton({ icon, children, ...rest }: SidebarFooterButtonProps) {
  return (
    <button type="button" className={styles.button} {...rest}>
      <Icon name={icon} size={12} strokeWidth={2.2} />
      {/* **`nowrap` et ellipse plutôt que retour à la ligne.** Une ligne de 28 px ne peut pas
          grandir : c'est donc au texte de céder. Il ne cédait pas, et le retour à la ligne
          détachait chaque icône de son texte — l'icône restant en haut, le mot descendant. */}
      <span className={styles.label}>{children}</span>
    </button>
  )
}
