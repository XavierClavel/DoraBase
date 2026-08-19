import { useEffect } from 'react'

/**
 * Le menu contextuel du navigateur, **désactivé partout où il n'est pas voulu**.
 *
 * # Pourquoi
 *
 * Dans une application de bureau, un clic droit ouvre le menu de l'application, pas celui du moteur
 * de rendu. Sans cette règle, WKWebView propose « Recharger », « Inspecter l'élément » et « Services »
 * au-dessus d'une grille de données — trois entrées qui n'ont rien à faire là et qui trahissent la
 * technologie. Décidé le 19 août 2026, avec le remplacement des composants natifs.
 *
 * # Comment on autorise l'exception
 *
 * Par **inscription explicite** : un élément — ou l'un de ses ancêtres — porte `data-menu-natif`, et
 * le menu du système s'ouvre. Rien n'en porte aujourd'hui, et c'est le but : la liste des exceptions
 * doit se voir en revue. Nos propres menus n'en ont pas besoin, ils appellent déjà `preventDefault`
 * là où ils s'ouvrent.
 *
 * **Les saisies ne sont pas exemptées, et c'est un arbitrage.** Le menu natif d'un champ de texte
 * porte « Coller », qui est un geste réel ; mais il porte aussi le reste, et `⌘V` fait la même chose.
 * L'exception se déclarera par `data-menu-natif` le jour où un écran en montre le besoin, plutôt que
 * d'être ouverte par avance.
 */
export function useClicDroitDesactive() {
  useEffect(() => {
    function auClicDroit(evenement: MouseEvent) {
      const cible = evenement.target
      if (cible instanceof Element && cible.closest('[data-menu-natif]')) return
      evenement.preventDefault()
    }
    // **Pas en capture.** Un menu de l'application appelle `preventDefault` sur son propre
    // gestionnaire ; écouter en capture passerait avant lui, ce qui ne changerait rien ici — mais
    // écouter en bulle laisse la possibilité d'arrêter la propagation à un composant qui voudrait
    // gérer le geste autrement.
    document.addEventListener('contextmenu', auClicDroit)
    return () => document.removeEventListener('contextmenu', auClicDroit)
  }, [])
}
