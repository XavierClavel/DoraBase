import { type ReactNode, useEffect, useRef } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import { cx } from '../cx'
import styles from './Modal.module.css'

type ModalProps = {
  /** Titre de l'en-tête, et **nom accessible** de la boîte de dialogue. */
  title: string
  /** Icône de la pastille de l'en-tête. */
  icon: IconName
  onClose: () => void
  /** Contenu du pied. Absent, aucune bande de pied n'est rendue. */
  footer?: ReactNode
  /**
   * Superpose un second voile, plus opaque, pour une sous-modale par-dessus une modale.
   * `A3` en a besoin ; `A2` non.
   */
  nested?: boolean
  className?: string
  children: ReactNode
}

/**
 * Ce qu'un navigateur considère comme focalisable, restreint à ce que le produit emploie.
 *
 * `[tabindex]:not([tabindex="-1"])` est inclus pour les composants qui gèrent leur focus à
 * la main — `TreeRow` et la grille de `10` en auront besoin.
 *
 * **`a[href]` et non `[href]`.** Le sélecteur large, qu'on recopie partout, attrape les
 * `<use href="#i-db">` de nos icônes SVG : le piège plaçait alors un élément SVG en tête de
 * liste, et `.focus()` sur un `<use>` ne fait rien — donc le bouclage de tabulation était
 * muet et le focus restait sur place. Trois tests l'ont attrapé.
 */
const FOCALISABLES =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * La pile des modales ouvertes, de la plus ancienne à la plus récente.
 *
 * **Pourquoi une pile plutôt qu'un simple écouteur.** Chaque instance écoute `keydown` sur
 * `document` : quand `A3` se superpose à `A2`, les deux écouteurs sont armés et un `esc`
 * fermait donc **les deux**. `stopPropagation` n'y change rien — les deux écouteurs sont sur la
 * même cible, ils se déclenchent tous les deux. Seule la modale au sommet doit répondre.
 *
 * Défaut trouvé par un test e2e de `08d`, pas par les tests unitaires de `08a` : ceux-ci
 * n'avaient qu'une modale à la fois.
 */
const pile: symbol[] = []

function focalisablesDe(racine: HTMLElement): HTMLElement[] {
  return Array.from(racine.querySelectorAll<HTMLElement>(FOCALISABLES)).filter(
    // `offsetParent` nul signale un élément non rendu — le contenu d'un
    // `CollapsiblePanel` replié, par exemple. Le piéger ferait sauter le focus dans le
    // vide. jsdom ne calcule pas `offsetParent`, d'où le repli sur `hidden`.
    (el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true',
  )
}

export function Modal({
  title,
  icon,
  onClose,
  footer,
  nested = false,
  className,
  children,
}: ModalProps) {
  const coquille = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  // Une identité par instance, stable entre les rendus.
  const identite = useRef(Symbol('modal'))

  // `onClose` est lu par les écouteurs ; le garder dans une ref évite de les reposer à
  // chaque rendu, ce qui reviendrait à réarmer `esc` en boucle.
  const fermer = useRef(onClose)
  fermer.current = onClose

  // --- Exigence 3 : restituer le focus. Posée en premier, et volontairement dans son
  // propre effet : mêlée à la mise au point initiale, la restitution partirait de
  // l'élément que *nous* venons de focaliser, pas de celui d'avant l'ouverture.
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null
    return () => origine?.focus?.()
  }, [])

  // --- Exigence 1 : entrer dans la modale.
  useEffect(() => {
    const premierDuCorps = corps.current ? focalisablesDe(corps.current)[0] : undefined
    if (premierDuCorps) {
      premierDuCorps.focus()
      return
    }
    // Repli sur le premier focalisable de la coquille — la croix. Sans lui, le focus
    // resterait sur `<body>`, hors de la modale, et le piège n'aurait rien à retenir.
    if (coquille.current) focalisablesDe(coquille.current)[0]?.focus()
  }, [])

  // --- Exigence 2 : piéger la tabulation. Et `esc`.
  useEffect(() => {
    const moi = identite.current
    pile.push(moi)

    function auSommet() {
      return pile.at(-1) === moi
    }

    function auClavier(evenement: KeyboardEvent) {
      // Seule la modale du sommet répond : sinon `esc` sur `A3` fermerait `A2` avec elle.
      if (!auSommet()) return
      if (evenement.key === 'Escape') {
        evenement.preventDefault()
        fermer.current()
        return
      }
      if (evenement.key !== 'Tab' || !coquille.current) return

      const cibles = focalisablesDe(coquille.current)
      if (cibles.length === 0) return

      const premier = cibles.at(0)
      const dernier = cibles.at(-1)
      if (!premier || !dernier) return
      const actif = document.activeElement

      // Le bouclage n'est explicite qu'aux deux extrémités : entre elles, la tabulation
      // native fait le travail, et la doubler produirait des sauts.
      if (!evenement.shiftKey && actif === dernier) {
        evenement.preventDefault()
        premier.focus()
      } else if (evenement.shiftKey && actif === premier) {
        evenement.preventDefault()
        dernier.focus()
      }
    }

    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('keydown', auClavier)
      const rang = pile.indexOf(moi)
      if (rang !== -1) pile.splice(rang, 1)
    }
  }, [])

  return (
    // Le voile n'est pas un contrôle. En faire un `<button>` le rendrait focalisable et
    // annoncé — un lecteur d'écran lirait un bouton anonyme avant le contenu de la modale.
    // La fermeture au clavier passe par `esc`, testé, et par la croix, un vrai bouton nommé.
    // biome-ignore lint/a11y/noStaticElementInteractions: voir ci-dessus
    <div
      className={cx(styles.veil, nested && styles.veilNested)}
      data-testid="veil"
      // Le voile ferme au clic, mais uniquement quand il est lui-même la cible : sans ce
      // test, tout clic dans la coquille remonterait jusqu'ici et fermerait la modale.
      onMouseDown={(evenement) => {
        if (evenement.target === evenement.currentTarget) onClose()
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: `<dialog>` impose son propre voile et
          sa pile de superposition, incompatibles avec les deux voiles superposés de `A3`. */}
      <div
        ref={coquille}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(styles.shell, nested && styles.shellNested, className)}
      >
        <div className={styles.header}>
          <span className={cx(styles.badge, nested && styles.badgeNested)}>
            <Icon name={icon} size={nested ? 17 : 15} strokeWidth={1.9} />
          </span>
          <span className={cx(styles.title, nested && styles.titleNested)}>{title}</span>
          <span className={styles.spacer} />
          {!nested && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
              <Icon name="x" size={16} strokeWidth={1.9} />
            </button>
          )}
        </div>

        <div ref={corps} className={styles.body}>
          {children}
        </div>

        {footer && (
          <div className={styles.footer} data-testid="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
