import { cx } from '../cx'
import styles from './Dot.module.css'

type DotTone = 'success' | 'gold'

type DotProps = {
  tone: DotTone
  className?: string
}

// Pastille de couleur d'état, purement décorative — l'information qu'elle porte est
// toujours doublée d'un texte à proximité (« pg 16.2 · tunnel ssh actif », « 3
// modifications en attente »…). `aria-hidden` est fixe, jamais une prop : aucun
// appelant ne peut en faire un élément porteur d'information à lui seul, et le
// composant n'accepte ni enfants ni rôle qui permettraient de contourner ça.
export function Dot({ tone, className }: DotProps) {
  return <span className={cx(styles.root, styles[tone], className)} aria-hidden="true" />
}
