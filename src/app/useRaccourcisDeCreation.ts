import { useEffect } from 'react'

type Gestes = {
  /** `⌘N`. */
  nouveauProjet: () => void
  /** `⇧⌘N`. */
  ajouterUneConnexion: () => void
}

/**
 * Les deux raccourcis de création (`24d`) : `⌘N` un projet, `⇧⌘N` une connexion.
 *
 * # Pourquoi ils vivent ici, et pas dans les écrans
 *
 * `⌘N` était monté par `WelcomeScreen`, donc il ne répondait que sur `A1` — la spec le veut « sur tous
 * les écrans », et un raccourci par écran finit par diverger : celui de `A4` n'aurait jamais existé.
 * `App` est le seul composant que les deux écrans ont en commun, et c'est aussi lui qui tient les
 * états que ces gestes ouvrent.
 *
 * **`⌘N` garde le même sens partout**, contre la recommandation de la conception UX qui suivait la
 * fréquence (`⌘N` devenant « Nouvelle connexion » sur `A4`) : un raccourci qui change de sens selon
 * l'écran demande de savoir où l'on est avant de le presser. Arbitrage du commanditaire du 19 août
 * 2026, consigné dans `24d`.
 *
 * # Ce qu'ils refusent de faire
 *
 * **Rien pendant qu'une modale est ouverte.** Un `⇧⌘N` frappé devant l'étape 2 remplacerait le
 * formulaire en cours de saisie par un autre, sans le dire — c'est la perte silencieuse que `12c`
 * refuse déjà ailleurs. La présence d'un `[role=dialog]` est le test : il vaut pour les modales à
 * venir sans que ce fichier ait à les connaître.
 *
 * **Rien dans une zone de saisie**, pour la même raison qu'un `⌘E` : `⌘N` n'a pas de sens dans un
 * champ, mais `⇧⌘N` frappé de travers pendant qu'on tape une requête ne doit pas emporter l'écran.
 */
export function useRaccourcisDeCreation({ nouveauProjet, ajouterUneConnexion }: Gestes) {
  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (!evenement.metaKey || evenement.key.toLowerCase() !== 'n') return
      if (evenement.ctrlKey || evenement.altKey) return
      if (document.querySelector('[role=dialog]') !== null) return
      const cible = evenement.target
      if (
        cible instanceof HTMLElement &&
        (cible.isContentEditable || cible.matches('input, textarea'))
      )
        return
      // **Avant le tri des deux gestes** : sans cette ligne, le navigateur ouvre une fenêtre — et il
      // l'ouvrirait aussi dans les cas rendus au-dessus, ce qui est voulu : là, le raccourci n'est
      // pas à nous.
      evenement.preventDefault()
      if (evenement.shiftKey) ajouterUneConnexion()
      else nouveauProjet()
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [nouveauProjet, ajouterUneConnexion])
}
