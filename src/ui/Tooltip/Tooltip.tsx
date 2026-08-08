import { cloneElement, type ReactElement, useId, useState } from 'react'
import styles from './Tooltip.module.css'

type TooltipProps = {
  /** Le texte de l'infobulle. */
  label: string
  /** L'élément qui la déclenche. Il reçoit `aria-describedby` et les gestionnaires. */
  children: ReactElement<Record<string, unknown>>
  /** Position, quand le placement par défaut sortirait de la fenêtre. */
  placement?: 'top' | 'bottom'
}

/**
 * Une infobulle, déclenchée au survol **et au focus clavier**.
 *
 * `08a` l'avait écartée faute d'écran la réclamant ; `09f` la réclame, pour dire quel écran
 * apportera chacune de ses quatre actions désactivées.
 *
 * **`aria-describedby` et non `aria-label`.** L'infobulle *décrit* le contrôle, elle ne le
 * *nomme* pas : « Ouvrir les données » reste le nom du bouton, « viendra avec l'écran A5 » en
 * est la description. Un `aria-label` remplacerait le nom par l'explication, et le bouton
 * s'annoncerait par sa limite plutôt que par sa fonction.
 *
 * **Le déclencheur peut être désactivé**, et c'est justement le cas de `09f`. Un `<button
 * disabled>` ne reçoit ni survol ni focus dans la plupart des navigateurs : l'infobulle serait
 * donc inatteignable là où elle est le plus utile. D'où l'enveloppe, qui porte les gestionnaires
 * de survol à sa place — et `aria-disabled` plutôt que `disabled` sur le bouton, pour qu'il
 * reste focalisable et annoncé comme indisponible.
 */
export function Tooltip({ label, children, placement = 'top' }: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  const declencheur = cloneElement(children, {
    'aria-describedby': visible ? id : undefined,
    onFocus: () => setVisible(true),
    onBlur: () => setVisible(false),
  })

  return (
    // L'enveloppe n'est pas un contrôle : elle porte le survol **à la place** du déclencheur,
    // qui peut être désactivé et ne le recevrait alors pas. Le clavier passe par
    // `onFocus`/`onBlur` du déclencheur lui-même, donc rien n'est perdu.
    // biome-ignore lint/a11y/noStaticElementInteractions: voir ci-dessus
    <span
      className={styles.root}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {declencheur}
      {visible && (
        // `role="tooltip"` et non `status` : ce n'est pas une annonce, c'est la description d'un
        // élément, et `aria-describedby` la relie à lui.
        <span id={id} role="tooltip" className={styles[placement]}>
          {label}
        </span>
      )}
    </span>
  )
}
