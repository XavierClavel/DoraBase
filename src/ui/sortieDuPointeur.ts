import { useCallback, useEffect, useRef } from 'react'

/**
 * Le délai de grâce avant de fermer, en millisecondes.
 *
 * **Il n'est pas cosmétique.** Un panneau flottant n'est pas collé à son déclencheur — `Popover`
 * l'ouvre à `100% + 2px` — et descendre du « … » vers le menu traverse donc quelques pixels qui
 * n'appartiennent ni à l'un ni à l'autre. Fermer sèchement au premier départ rendrait le menu
 * inatteignable une fois sur trois, selon la vitesse du geste.
 *
 * 150 ms : assez pour traverser un interstice ou couper un angle, trop court pour qu'un menu
 * abandonné traîne à l'écran.
 */
const GRACE_MS = 150

/**
 * Ferme un panneau quand le pointeur quitte sa zone, et **seulement s'il ne revient pas**.
 *
 * # Pourquoi ce comportement
 *
 * Un menu qu'on a quitté à la souris n'est plus celui qu'on visait : le laisser ouvert oblige à
 * cliquer dans le vide pour s'en débarrasser. Pour le menu d'une ligne d'arbre, c'était pire qu'un
 * désagrément — le panneau vit dans la gouttière `.actions`, que `TreeRow` repasse en
 * `visibility: hidden` hors survol. Le menu ne se fermait donc pas, il **disparaissait**, et
 * resurgissait au survol suivant de la ligne sans qu'on ait cliqué. Un menu qui réapparaît tout seul
 * ne s'explique pas.
 *
 * # Ce que ça ne change pas
 *
 * **Le clavier n'est pas concerné** : sans pointeur, il n'y a pas de départ de pointeur, et les
 * fermetures existantes — `Échap`, le clic ailleurs, la perte de focus — restent seules aux commandes.
 *
 * # Usage
 *
 * Les deux gestionnaires vont sur l'élément qui **contient le panneau et son déclencheur** : le
 * départ n'est réel que lorsque le pointeur quitte l'ensemble.
 *
 * ```tsx
 * const sortie = useSortieDuPointeur(ouvert, () => setOuvert(false))
 * return <span {...sortie}>…</span>
 * ```
 */
export function useSortieDuPointeur(
  actif: boolean,
  fermer: () => void,
): { onPointerLeave: () => void; onPointerEnter: () => void } {
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `fermer` est lu par une minuterie qui survit au rendu : passer par une ref évite de replanifier
  // à chaque rendu du parent, ce qui rallongerait le délai à l'infini sous la souris.
  const fermeture = useRef(fermer)
  fermeture.current = fermer

  const annuler = useCallback(() => {
    if (minuterie.current !== null) {
      clearTimeout(minuterie.current)
      minuterie.current = null
    }
  }, [])

  // **Le démontage annule.** Sans cela, un panneau retiré par un autre chemin — une ligne qui
  // disparaît de l'arbre, un `Échap` — laisserait une minuterie appeler `fermer` sur un composant
  // parti. React 19 le tolère, les tests non : la fuite ferait échouer le test *suivant*.
  useEffect(() => annuler, [annuler])

  // Fermé, il n'y a rien à annuler ni à planifier : la minuterie en cours est jetée pour qu'un
  // panneau rouvert dans l'intervalle ne soit pas refermé par le départ précédent.
  useEffect(() => {
    if (!actif) annuler()
  }, [actif, annuler])

  return {
    onPointerLeave: () => {
      if (!actif) return
      annuler()
      minuterie.current = setTimeout(() => {
        minuterie.current = null
        fermeture.current()
      }, GRACE_MS)
    },
    onPointerEnter: annuler,
  }
}
