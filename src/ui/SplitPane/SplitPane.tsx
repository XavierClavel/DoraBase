import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import styles from './SplitPane.module.css'

type SplitPaneProps = {
  /** Discrimine l'entrée de `localStorage` — une par emplacement d'écran. */
  storageKey: string
  defaultSize: number
  min: number
  max: number
  /** Côté d'où part le dégradé de la poignée, selon le panneau qu'elle borde. */
  handleShadow?: 'start' | 'end'
  /**
   * Lequel des deux panneaux porte `defaultSize` ; l'autre prend la place restante.
   *
   * **`end` manquait, et son absence a cassé un écran.** `03` ne dimensionnait que le panneau de
   * gauche, ce qui convient à une sidebar. Mais l'écran de travail (`10b`) a un **panneau droit**
   * de largeur fixe : sans cette option, c'est le centre qui recevait 296 px et le panneau qui
   * prenait tout le reste. Constaté le 10 août 2026 en mesurant la grille de `A5`, qui tombait à
   * zéro pixel de large — un test de fidélité par écran ne l'avait pas vu, aucun ne mesurait le
   * centre.
   */
  sized?: 'start' | 'end'
  /**
   * L'axe du partage. `vertical` empile les deux zones et la poignée se saisit en hauteur (`12a`).
   *
   * `03` n'avait posé que des colonnes, ce qui suffisait à une sidebar. La console d'`A7` demande
   * deux **lignes** — éditeur au-dessus, résultat en dessous.
   */
  orientation?: 'horizontal' | 'vertical'
  start: ReactNode
  end: ReactNode
}

/** Pas de redimensionnement au clavier, en pixels. */
const KEYBOARD_STEP = 8

function storageKeyFor(storageKey: string) {
  return `dorabase:split:${storageKey}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Les bornes sont réappliquées à la lecture, pas seulement à l'écriture : une taille
// stockée reste valide indéfiniment, alors que les bornes d'un écran peuvent changer
// d'une version à l'autre. Sans ce recadrage, une ancienne valeur rouvrirait un panneau
// hors de ses limites actuelles.
function readStoredSize(storageKey: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(storageKeyFor(storageKey))
    if (raw === null) return fallback
    const parsed = Number(raw)
    return Number.isNaN(parsed) ? fallback : clamp(parsed, min, max)
  } catch {
    // Stockage inaccessible : la valeur par défaut fait l'affaire pour la session.
    return fallback
  }
}

// Deux zones seulement, côte à côte. Une disposition à trois zones s'obtient en
// imbriquant deux `SplitPane` — voir `specs/03-coquille-panneaux-onglets.md`, qui écarte
// délibérément un composant à N zones tant qu'aucun écran n'en réclame un.
export function SplitPane({
  storageKey,
  defaultSize,
  min,
  max,
  handleShadow = 'start',
  sized = 'start',
  orientation = 'horizontal',
  start,
  end,
}: SplitPaneProps) {
  const [size, setSize] = useState(() => readStoredSize(storageKey, defaultSize, min, max))
  /** Le panneau qui porte la largeur : écrit directement pendant le glissement. */
  const dimensionne = useRef<HTMLDivElement>(null)

  /** Écrit la taille dans le stockage. **Appelée à la fin d'un geste, jamais pendant.** */
  function memoriser(taille: number) {
    try {
      localStorage.setItem(storageKeyFor(storageKey), String(taille))
    } catch {
      // Stockage indisponible : la taille reste en mémoire pour la session.
    }
  }

  // Événements pointeur plutôt que souris : ils couvrent aussi le trackpad et le tactile
  // sans code supplémentaire.
  function handlePointerDown(event: ReactPointerEvent) {
    // **`preventDefault` : sans lui, le navigateur commence une sélection de texte.** Glisser la
    // poignée surlignait les lignes de la grille sur tout le passage du curseur. Signalé à l'usage
    // le 11 août 2026.
    event.preventDefault()

    // L'axe décide de la coordonnée suivie : rien d'autre ne change dans le geste.
    const vertical = orientation === 'vertical'
    const originX = vertical ? event.clientY : event.clientX
    const originSize = size
    // La poignée capture le pointeur : le glissement survit à un curseur qui sort de ses 5 px, sans
    // écouter sur `window` — et les événements cessent d'être dirigés vers les éléments survolés,
    // ce qui supprime au passage l'autre source de sélection.
    const poignee = event.currentTarget as HTMLElement
    // Le garde n'est pas de la prudence rituelle : jsdom ne l'implémente pas, et un environnement
    // sans capture de pointeur doit rester utilisable — le glissement y reste correct, il cesse
    // seulement de survivre à un curseur sorti de la poignée.
    poignee.setPointerCapture?.(event.pointerId)

    // **`user-select: none` sur le document, le temps du geste.** `preventDefault` suffit pour la
    // sélection qui *démarre* sur la poignée ; il ne fait rien contre une sélection déjà en cours
    // ni contre les moteurs qui la relancent. La classe est retirée au relâchement, pour ne pas
    // rendre la page inélectable après coup.
    document.body.classList.add(styles.pendantLeGlissement as string)

    // **Aucun rendu React pendant le geste.** La largeur est écrite directement dans le style du
    // panneau ; `setSize` n'a lieu qu'au relâchement. Chaque `setSize` intermédiaire faisait
    // retraverser la grille virtualisée — vingt-six lignes fois trente-sept colonnes chez
    // l'utilisateur qui a signalé la latence, à chaque trame du glissement.
    //
    // Le compromis : entre le premier mouvement et le relâchement, le DOM est en avance sur l'état
    // React. Un rendu venu d'ailleurs pendant ce court instant remettrait la largeur d'avant — c'est
    // sans conséquence, le mouvement suivant la corrige, et rien d'autre ne rend pendant qu'on
    // glisse une poignée.
    let derniere = originSize

    function onMove(moveEvent: PointerEvent) {
      // Vers la droite agrandit le panneau de gauche et **rétrécit** celui de droite : le geste
      // suit toujours la poignée, quel que soit le panneau dimensionné.
      const delta = (vertical ? moveEvent.clientY : moveEvent.clientX) - originX
      derniere = clamp(originSize + (sized === 'start' ? delta : -delta), min, max)
      // Écrit à chaque événement, sans `requestAnimationFrame`. Une trame de regroupement avait été
      // ajoutée en ceinture : elle ne changeait aucune mesure, et pour une raison de fond — écrire
      // une propriété de style ne force pas de recalcul, seul le *lire* le ferait. Le navigateur
      // groupe déjà les changements avant la peinture. Retirée, comme les trois autres ceintures de
      // ce projet.
      if (dimensionne.current) {
        dimensionne.current.style[vertical ? 'height' : 'width'] = `${derniere}px`
      }
    }

    function onUp() {
      poignee.removeEventListener('pointermove', onMove)
      poignee.removeEventListener('pointerup', onUp)
      poignee.removeEventListener('pointercancel', onUp)
      document.body.classList.remove(styles.pendantLeGlissement as string)
      setSize(derniere)
      // **Une seule écriture, à la fin.** Elle avait lieu à *chaque* `pointermove` :
      // `localStorage.setItem` est synchrone, et soixante écritures par seconde suffisaient à
      // rendre le glissement saccadé. C'était la cause de la latence signalée le 11 août 2026.
      memoriser(derniere)
    }

    poignee.addEventListener('pointermove', onMove)
    poignee.addEventListener('pointerup', onUp)
    // Un geste interrompu par le système — changement de fenêtre, geste tactile — passe par
    // `pointercancel` et non `pointerup` : sans lui, la page resterait inélectable.
    poignee.addEventListener('pointercancel', onUp)
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    const pas = sized === 'start' ? KEYBOARD_STEP : -KEYBOARD_STEP
    // Les flèches suivent l'axe : haut/bas pour un partage empilé, gauche/droite sinon. Écouter les
    // quatre serait plus permissif et moins prévisible — une flèche latérale sur une poignée
    // horizontale ne veut rien dire.
    const [avant, apres] =
      orientation === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    // Au clavier, un pas est un geste complet : la mémorisation immédiate est juste ici.
    if (event.key === avant) {
      const suivante = clamp(size - pas, min, max)
      setSize(suivante)
      memoriser(suivante)
    }
    if (event.key === apres) {
      const suivante = clamp(size + pas, min, max)
      setSize(suivante)
      memoriser(suivante)
    }
  }

  const taille = (portee: 'start' | 'end') =>
    sized === portee ? (orientation === 'vertical' ? { height: size } : { width: size }) : undefined

  return (
    <div className={cx(styles.root, orientation === 'vertical' && styles.vertical)}>
      <div
        ref={sized === 'start' ? dimensionne : undefined}
        className={sized === 'start' ? styles.pane : styles.end}
        style={taille('start')}
      >
        {start}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: la règle propose `<hr>`, inutilisable
          ici pour deux raisons — c'est un élément void, qui ne peut donc pas porter la
          pastille enfant, et un `<hr>` reste un séparateur thématique inerte. Le motif
          WAI-ARIA « window splitter » prescrit exactement ce qui est écrit ici :
          `role="separator"` focalisable, avec `aria-valuenow`/`min`/`max`. */}
      <div
        className={cx(
          styles.handle,
          handleShadow === 'end' && styles.handleEnd,
          orientation === 'vertical' && styles.handleH,
        )}
        role="separator"
        // **L'orientation ARIA est celle du séparateur, pas celle du partage** : un partage en
        // colonnes est séparé par une barre *verticale*. Les deux mots désignent des choses
        // opposées, et les confondre annoncerait l'inverse de ce qu'on voit.
        aria-orientation={orientation === 'vertical' ? 'horizontal' : 'vertical'}
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.grip} />
      </div>
      <div
        ref={sized === 'end' ? dimensionne : undefined}
        className={sized === 'end' ? styles.pane : styles.end}
        style={taille('end')}
      >
        {end}
      </div>
    </div>
  )
}
