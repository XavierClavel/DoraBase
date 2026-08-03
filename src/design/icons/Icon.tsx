import type { SVGProps } from 'react'
import type { IconName } from './names'

type IconProps = {
  name: IconName
  size?: number
  strokeWidth?: number
} & Omit<SVGProps<SVGSVGElement>, 'name'>

// Valeurs par défaut alignées sur la spec du handoff : viewBox 0 0 24 24, trait 2, pas
// de remplissage. `aria-hidden` vrai par défaut car ces icônes sont décoratives — le
// libellé porté par le texte voisin est ce qu'un lecteur d'écran doit annoncer, pas
// l'icône elle-même.
export function Icon({ name, size = 14, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <use href={`#i-${name}`} />
    </svg>
  )
}
