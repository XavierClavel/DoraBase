import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEffect, useRef } from 'react'
import { facteurSuivant, ZOOM_NEUTRE } from './zoom'

export type PasserelleZoom = {
  /** Applique un facteur à la webview. */
  appliquer: (facteur: number) => Promise<void>
}

export const PASSERELLE_ZOOM: PasserelleZoom = {
  appliquer: (facteur) => getCurrentWebview().setZoom(facteur),
}

/**
 * Sous Tauri, et seulement là.
 *
 * Le zoom est une capacité de la **coquille**, pas un style de la page : c'est la webview entière qui
 * grossit, barres de défilement comprises. Dans un navigateur — donc en développement, dans la
 * galerie et sous Playwright — il n'y a pas de webview à piloter, et reprendre le geste pour ne rien
 * en faire retirerait le zoom du navigateur sans rien offrir à la place. Le geste y reste donc natif.
 */
function dansTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Le zoom au geste, à pas fin (`⌘`/`ctrl` + molette, et le pincement du trackpad).
 *
 * # Pourquoi reprendre un geste que la webview traite déjà
 *
 * WKWebView zoome de dix à vingt-cinq pour cent par cran : deux crans et la grille est méconnaissable.
 * Aucun réglage n'expose ce pas — c'est une constante du moteur. La seule façon de l'adoucir est
 * d'intercepter le geste et d'appliquer son propre facteur, ce que fait ce crochet. Signalé à l'usage
 * le 19 août 2026.
 *
 * # Ce que « pincement » veut dire ici
 *
 * WebKit et Chromium traduisent tous deux le pincement du trackpad en `wheel` avec `ctrlKey` — une
 * convention, pas un accident. Écouter `wheel` couvre donc les deux gestes, celui du trackpad et
 * celui de la souris avec `⌘`, sans distinguer le matériel.
 */
export function useZoom(passerelle: PasserelleZoom = PASSERELLE_ZOOM) {
  const facteur = useRef(ZOOM_NEUTRE)

  useEffect(() => {
    if (!dansTauri()) return

    function auGeste(evenement: WheelEvent) {
      if (!evenement.ctrlKey && !evenement.metaKey) return
      // `passive: false` plus `preventDefault` : sans les deux, le zoom natif s'applique **en plus**
      // du nôtre, et les deux pas s'additionnent.
      evenement.preventDefault()
      const suivant = facteurSuivant(facteur.current, evenement.deltaY)
      if (suivant === facteur.current) return
      facteur.current = suivant
      void passerelle.appliquer(suivant)
    }

    function auClavier(evenement: KeyboardEvent) {
      // `⌘0` rend sa taille d'origine, comme partout ailleurs. Sans ce retour, un zoom fin est long à
      // défaire — c'est le corollaire d'un petit pas.
      if (!(evenement.metaKey && evenement.key === '0')) return
      evenement.preventDefault()
      facteur.current = ZOOM_NEUTRE
      void passerelle.appliquer(ZOOM_NEUTRE)
    }

    window.addEventListener('wheel', auGeste, { passive: false })
    window.addEventListener('keydown', auClavier)
    return () => {
      window.removeEventListener('wheel', auGeste)
      window.removeEventListener('keydown', auClavier)
    }
  }, [passerelle])
}
