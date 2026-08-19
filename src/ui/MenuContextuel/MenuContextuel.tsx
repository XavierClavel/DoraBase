import { useEffect, useRef } from 'react'
import styles from './MenuContextuel.module.css'

export type EntreeDeMenu = {
  libelle: string
  onClick: () => void
}

type MenuContextuelProps = {
  /** Où le menu s'ouvre, en coordonnées de fenêtre — celles de l'événement. */
  x: number
  y: number
  entrees: readonly EntreeDeMenu[]
  onFermer: () => void
  /** Nomme le menu : « Actions sur la valeur de status ». */
  label: string
}

/** Marge minimale au bord de la fenêtre : un menu collé au bord est difficile à viser. */
const MARGE = 8

/**
 * Un menu au clic droit, ouvert **au pointeur**.
 *
 * # Pourquoi ce n'est pas un `Popover`
 *
 * `Popover` (`10a`) s'ancre à un déclencheur et s'ouvre au clic sur lui. Un menu contextuel s'ouvre
 * là où le pointeur se trouve, sur un élément qui n'est pas un contrôle, et par un geste que le
 * déclencheur ne connaît pas. Les deux partagent l'idée de panneau flottant et rien d'autre : plier
 * `Popover` pour ce cas aurait ajouté un mode d'ouverture contrôlée à une primitive qui n'en a pas
 * besoin ailleurs.
 *
 * **`position: fixed` et non `absolute`.** Le menu s'ouvre au-dessus de panneaux qui défilent et qui
 * découpent leur contenu ; ancré dans le flux, un `overflow: hidden` d'ancêtre le rognerait sans
 * qu'aucune assertion de visibilité s'en aperçoive — c'est le défaut n° 35, et le test interroge donc
 * `elementFromPoint`.
 *
 * # Les trois fermetures
 *
 * `Échap`, le clic ailleurs, et le défilement. Les deux premières sont celles de `Popover` et pour
 * les mêmes raisons. La troisième lui est propre : un menu posé en coordonnées de fenêtre ne suit pas
 * le contenu qui défile sous lui, et resterait pointé sur une valeur qui n'y est plus.
 */
export function MenuContextuel({ x, y, entrees, onFermer, label }: MenuContextuelProps) {
  const panneau = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const premier = panneau.current?.querySelector('button')
    // Le focus entre dans le menu : sans cela, `Échap` irait à l'élément précédemment focalisé et les
    // flèches ne mèneraient nulle part.
    premier?.focus()
  }, [])

  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.key === 'Escape') onFermer()
    }
    function ailleurs(evenement: MouseEvent) {
      if (!panneau.current?.contains(evenement.target as Node)) onFermer()
    }
    document.addEventListener('keydown', auClavier)
    // En capture : un clic sur un élément qui arrête la propagation refermerait sinon rien.
    document.addEventListener('pointerdown', ailleurs, true)
    document.addEventListener('scroll', onFermer, true)
    return () => {
      document.removeEventListener('keydown', auClavier)
      document.removeEventListener('pointerdown', ailleurs, true)
      document.removeEventListener('scroll', onFermer, true)
    }
  }, [onFermer])

  useEffect(() => {
    const boite = panneau.current
    if (!boite) return
    // **Replacé après mesure, pas avant.** La taille du menu dépend de ses libellés ; la calculer
    // d'avance demanderait de mesurer du texte. Ouvert près du bord droit ou bas, il se replie du
    // côté où il y a la place — la même contrepartie assumée que `Popover`.
    const mesure = boite.getBoundingClientRect()
    const gauche = Math.min(x, window.innerWidth - mesure.width - MARGE)
    const haut = Math.min(y, window.innerHeight - mesure.height - MARGE)
    boite.style.left = `${Math.max(MARGE, gauche)}px`
    boite.style.top = `${Math.max(MARGE, haut)}px`
  }, [x, y])

  return (
    <div
      ref={panneau}
      className={styles.root}
      role="menu"
      aria-label={label}
      style={{ left: x, top: y }}
    >
      {entrees.map((entree) => (
        <button
          key={entree.libelle}
          type="button"
          role="menuitem"
          className={styles.entree}
          onClick={() => {
            entree.onClick()
            onFermer()
          }}
        >
          {entree.libelle}
        </button>
      ))}
    </div>
  )
}
