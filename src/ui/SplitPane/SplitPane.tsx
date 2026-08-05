import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
  start,
  end,
}: SplitPaneProps) {
  const [size, setSize] = useState(() => readStoredSize(storageKey, defaultSize, min, max))

  function commit(next: number) {
    const clamped = clamp(next, min, max)
    setSize(clamped)
    try {
      localStorage.setItem(storageKeyFor(storageKey), String(clamped))
    } catch {
      // Stockage indisponible : la taille reste en mémoire pour la session.
    }
  }

  // Événements pointeur plutôt que souris : ils couvrent aussi le trackpad et le tactile
  // sans code supplémentaire. L'écoute se fait sur `window`, pas sur la poignée, pour que
  // le glissement survive à un curseur qui sort de ses 5 px de large.
  function handlePointerDown(event: ReactPointerEvent) {
    const originX = event.clientX
    const originSize = size

    function onMove(moveEvent: PointerEvent) {
      commit(originSize + (moveEvent.clientX - originX))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowLeft') commit(size - KEYBOARD_STEP)
    if (event.key === 'ArrowRight') commit(size + KEYBOARD_STEP)
  }

  return (
    <div className={styles.root}>
      <div className={styles.pane} style={{ width: size }}>
        {start}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: la règle propose `<hr>`, inutilisable
          ici pour deux raisons — c'est un élément void, qui ne peut donc pas porter la
          pastille enfant, et un `<hr>` reste un séparateur thématique inerte. Le motif
          WAI-ARIA « window splitter » prescrit exactement ce qui est écrit ici :
          `role="separator"` focalisable, avec `aria-valuenow`/`min`/`max`. */}
      <div
        className={cx(styles.handle, handleShadow === 'end' && styles.handleEnd)}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.grip} />
      </div>
      <div className={styles.end}>{end}</div>
    </div>
  )
}
