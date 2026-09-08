import {
  type CSSProperties,
  cloneElement,
  type ReactElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styles from './Tooltip.module.css'

type TooltipProps = {
  /** Le texte de l'infobulle. */
  label: string
  /** L'élément qui la déclenche. Il reçoit `aria-describedby` et les gestionnaires. */
  children: ReactElement<Record<string, unknown>>
  /**
   * De quel côté elle paraît.
   *
   * **Explicite, et non mesuré** — c'est mot pour mot l'arbitrage d'`ouvertureVers` chez `Popover`,
   * et pour la même raison : le décalage horizontal se mesure parce qu'il dépend de la largeur du
   * contenu, donc de la fenêtre, du texte et des polices chargées ; le côté vertical, lui, est
   * **structurel** chez chaque appelant, et aucune mesure ne le changerait. Une bascule automatique
   * a été écrite le 8 septembre 2026 puis retirée le jour même : aucun déclencheur du produit n'est
   * assez haut dans la fenêtre pour la déclencher, donc c'était une branche que rien ne pouvait
   * exercer — et une branche qu'aucun test ne peut atteindre ne se dénonce pas le jour où elle est
   * fausse.
   */
  placement?: 'top' | 'bottom'
}

/** Ce qu'on laisse entre l'infobulle et le bord de la fenêtre. */
const MARGE = 6

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
 *
 * **Elle se place elle-même** (8 septembre 2026, rapporté à l'usage : « l'infobulle est illisible,
 * la fenêtre est trop courte »). Elle ne le faisait pas, et le défaut n'était pas celui qu'on
 * croyait :
 *
 * - **la largeur retombait sur celle du déclencheur.** Un élément absolument positionné se
 *   dimensionne contre son bloc conteneur, ici l'enveloppe, qui épouse le contrôle. Sur un carré de
 *   27 px de la barre d'outils de `A5`, l'infobulle rendait **55 px de large et 98 px de haut** —
 *   un mot par ligne — et `max-width: 220px` ne s'appliquait jamais, faute de 220 px disponibles.
 *   `width: max-content` est le remède, et il vit dans la feuille ;
 * - **le débordement par le haut en était la conséquence, pas la cause.** Ces 98 px la portaient à
 *   `top: -23`, hors de la fenêtre — coupée par elle, et par aucun ancêtre en `overflow: hidden` :
 *   ce n'était pas le défaut n° 35. Une fois la largeur rendue, la même infobulle tient au-dessus,
 *   sans qu'aucun appelant ait à choisir son côté ;
 * - **et rendre la largeur a ouvert l'autre bord.** Mesuré sur « Exporter CSV » du panneau de
 *   détail : l'infobulle finissait à 1367 px dans une fenêtre de 1360. Une largeur bornée par le
 *   déclencheur ne dépassait jamais ; une largeur bornée par son contenu, oui.
 *
 * **Mesuré depuis l'ancre, jamais depuis l'infobulle déjà décalée** — c'est la leçon de `Popover` :
 * une condition portant sur la position *courante* oscillerait. Seule la largeur vient de
 * l'infobulle, et elle ne dépend pas du décalage qu'on lui applique.
 *
 * **Pas de portail**, pour la raison de `Popover` : rendue sur place, elle suit son déclencheur dans
 * l'ordre du document. Et `getBoundingClientRect` rendant des zéros sous jsdom, le placement y est
 * inerte — c'est Playwright qui le juge, comme toute exigence de mise en page (règle n° 9).
 */
export function Tooltip({ label, children, placement = 'top' }: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [decalage, setDecalage] = useState(0)
  const racine = useRef<HTMLSpanElement>(null)
  const bulle = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!visible) return
    function placer() {
      const ancre = racine.current?.getBoundingClientRect()
      const boite = bulle.current?.getBoundingClientRect()
      if (!ancre || !boite || boite.width === 0) return

      const centre = ancre.left + ancre.width / 2
      const demi = boite.width / 2
      const debordeADroite = centre + demi - (window.innerWidth - MARGE)
      const debordeAGauche = MARGE - (centre - demi)
      setDecalage(debordeADroite > 0 ? -debordeADroite : debordeAGauche > 0 ? debordeAGauche : 0)
    }
    placer()
    // La fenêtre change de taille, ou la mise en page se pose après coup — polices, contenu
    // asynchrone. Une mesure unique daterait du mauvais instant, ce que `Popover` a déjà payé.
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(placer)
    observateur?.observe(document.documentElement)
    window.addEventListener('resize', placer)
    return () => {
      observateur?.disconnect()
      window.removeEventListener('resize', placer)
    }
  }, [visible])

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
      ref={racine}
      className={styles.root}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {declencheur}
      {visible && (
        // `role="tooltip"` et non `status` : ce n'est pas une annonce, c'est la description d'un
        // élément, et `aria-describedby` la relie à lui.
        <span
          ref={bulle}
          id={id}
          role="tooltip"
          /* Le côté, dans le DOM — la raison qu'a déjà `data-ouverture` chez `Popover` : une classe
             de CSS module ne se nomme qu'en `string | undefined`, donc rien d'autre ne dit de quel
             côté l'infobulle est posée. */
          data-cote={placement}
          className={styles[placement]}
          style={{ '--decalage': `${decalage}px` } as CSSProperties}
        >
          {label}
        </span>
      )}
    </span>
  )
}
