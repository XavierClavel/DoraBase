import { useEffect, useRef } from 'react'
import styles from './BarresDeDefilement.module.css'

/** Combien de temps un curseur reste visible après le dernier événement de défilement. */
const REMANENCE_MS = 700
/** Un curseur plus court que cela devient introuvable à la souris. */
const LONGUEUR_MINIMALE = 24

type Axe = 'vertical' | 'horizontal'

type Etat = {
  pouces: Partial<Record<Axe, HTMLDivElement>>
  minuteur: number | undefined
}

/**
 * Les barres de défilement du produit : **superposées, et visibles seulement pendant le geste**.
 *
 * # Pourquoi elles sont dessinées ici et non déclarées en CSS
 *
 * Les deux exigences se contredisent en CSS pur. `::-webkit-scrollbar` permet de rendre une barre
 * discrète — c'est ce que faisait la correction du défaut n° 70 — mais **styler ce pseudo-élément
 * force WebKit à rendre une barre classique**, c'est-à-dire une barre qui *réserve sa place* dans la
 * mise en page et reste affichée en permanence. Il n'existe pas de propriété qui demande « une barre
 * en survol » : c'est un réglage du système, et l'utilisateur qui a choisi « Afficher les barres de
 * défilement : toujours » l'a réglé dans l'autre sens pour tout son bureau.
 *
 * Les barres natives sont donc **masquées partout** (voir `reset.css`), et celles-ci sont dessinées
 * dans une couche `position: fixed` qui recouvre la fenêtre sans rien y occuper.
 *
 * # Pourquoi un seul composant, monté une fois, et non un habillage par panneau
 *
 * Quatorze feuilles déclarent un conteneur défilant, et il en viendra d'autres. Un composant
 * d'habillage aurait demandé de reprendre quatorze chaînes de `flex` — chacune un risque de
 * régression de mise en page pour un dispositif qui n'en concerne aucune. Celui-ci écoute les
 * événements `scroll` en phase de **capture** sur le document : un `scroll` ne remonte pas, mais il
 * se capture. N'importe quel conteneur, présent ou futur, y a donc droit sans le savoir.
 *
 * # Ce qu'elles font, et ce qu'elles ne font pas
 *
 * Elles apparaissent au défilement, restent tant que le pointeur les touche ou les traîne, et
 * s'effacent {@link REMANENCE_MS} ms après le dernier geste. Elles se saisissent à la souris, comme
 * celles de macOS. Elles ne s'élargissent pas au survol du bord de la fenêtre — le système le fait,
 * mais cela demande de deviner qu'un pointeur *approche* d'une barre invisible, ce qui n'a de sens
 * que si l'on rend aussi la piste. Laissé dehors sciemment.
 */
export function BarresDeDefilement() {
  const couche = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hote = couche.current
    if (!hote) return

    const etats = new Map<Element, Etat>()

    function etatDe(zone: Element): Etat {
      const existant = etats.get(zone)
      if (existant) return existant
      const etat: Etat = { pouces: {}, minuteur: undefined }
      etats.set(zone, etat)
      return etat
    }

    function pouceDe(zone: HTMLElement, axe: Axe): HTMLDivElement {
      const etat = etatDe(zone)
      const existant = etat.pouces[axe]
      if (existant) return existant
      const pouce = document.createElement('div')
      // `?? ''` : les modules CSS sont typés comme un dictionnaire ouvert, donc chaque classe peut
      // être `undefined` pour le compilateur. Une classe manquante rendrait un curseur invisible, pas
      // une erreur — c'est le genre de faute que seule une mesure attrape.
      pouce.className = (axe === 'vertical' ? styles.vertical : styles.horizontal) ?? ''
      installerLeGlissement(pouce, zone, axe)
      hote?.appendChild(pouce)
      etat.pouces[axe] = pouce
      return pouce
    }

    /**
     * Traîner le curseur défile la zone.
     *
     * Le rapport est celui des courses : un pixel de curseur vaut `course de contenu / course de
     * curseur` pixels de contenu. Sans ce facteur, traîner d'un centimètre sur une table de cent
     * mille lignes ne bougerait de rien.
     */
    function installerLeGlissement(pouce: HTMLDivElement, zone: HTMLElement, axe: Axe) {
      pouce.addEventListener('pointerdown', (evenement) => {
        evenement.preventDefault()
        pouce.setPointerCapture(evenement.pointerId)
        pouce.dataset.tenu = 'oui'
        const depart = axe === 'vertical' ? evenement.clientY : evenement.clientX
        const departDuDefilement = axe === 'vertical' ? zone.scrollTop : zone.scrollLeft

        const deplacer = (mouvement: PointerEvent) => {
          const delta = (axe === 'vertical' ? mouvement.clientY : mouvement.clientX) - depart
          const visible = axe === 'vertical' ? zone.clientHeight : zone.clientWidth
          const total = axe === 'vertical' ? zone.scrollHeight : zone.scrollWidth
          // **La même piste qu'au placement.** Deux définitions divergentes feraient dériver le
          // curseur sous le doigt — d'autant plus vite que l'en-tête collé est haut.
          const piste = visible - (axe === 'vertical' ? hauteurCollee(zone) : 0)
          const longueurDuPouce = Math.max(LONGUEUR_MINIMALE, (piste * visible) / total)
          const courseDuPouce = piste - longueurDuPouce
          if (courseDuPouce <= 0) return
          const facteur = (total - visible) / courseDuPouce
          if (axe === 'vertical') zone.scrollTop = departDuDefilement + delta * facteur
          else zone.scrollLeft = departDuDefilement + delta * facteur
        }
        const relacher = () => {
          delete pouce.dataset.tenu
          pouce.removeEventListener('pointermove', deplacer)
          pouce.removeEventListener('pointerup', relacher)
          pouce.removeEventListener('pointercancel', relacher)
          effacerPlusTard(zone)
        }
        pouce.addEventListener('pointermove', deplacer)
        pouce.addEventListener('pointerup', relacher)
        pouce.addEventListener('pointercancel', relacher)
      })
    }

    /**
     * La hauteur de ce qui est **collé en haut** de la zone : un en-tête `sticky`, et la ligne de
     * filtres qui le suit.
     *
     * La piste du curseur commence en dessous. Sans cela, elle démarrait au niveau des en-têtes de
     * colonnes — donc au-dessus de la première ligne de données — et le curseur semblait décrire un
     * contenu qui commence plus haut qu'il ne commence. Signalé à l'écran le 19 août 2026.
     *
     * Mesuré sur l'arbre plutôt que déclaré : ce composant ne connaît aucun de ses quatorze
     * conteneurs, et une constante de 55 px serait fausse dès qu'un panneau colle autre chose — ou
     * dès qu'un réglage de densité change la hauteur de l'en-tête (`15c`).
     */
    function hauteurCollee(zone: HTMLElement): number {
      let total = 0
      for (const enfant of zone.children) {
        if (!(enfant instanceof HTMLElement)) continue
        const style = getComputedStyle(enfant)
        if (style.position !== 'sticky') continue
        // `top: 0` : seul ce qui se colle **en haut** décale le début de la piste. Un pied collé en
        // bas la raccourcirait par l'autre bout, ce qu'aucun panneau ne fait aujourd'hui.
        if (Number.parseFloat(style.top || 'NaN') !== 0) continue
        total += enfant.getBoundingClientRect().height
      }
      return total
    }

    function placer(zone: HTMLElement, axe: Axe) {
      const visible = axe === 'vertical' ? zone.clientHeight : zone.clientWidth
      const total = axe === 'vertical' ? zone.scrollHeight : zone.scrollWidth
      const position = axe === 'vertical' ? zone.scrollTop : zone.scrollLeft
      // Un pixel de tolérance : un filet en `content-box` suffit à créer un débordement qui ne se
      // voit pas, et une barre pour un pixel serait du bruit (défaut n° 69).
      if (total <= visible + 1) {
        etats.get(zone)?.pouces[axe]?.style.setProperty('opacity', '0')
        return
      }
      const boite = zone.getBoundingClientRect()
      // La piste : la partie de la zone que le curseur peut parcourir, en-tête collé exclu.
      const debut = axe === 'vertical' ? hauteurCollee(zone) : 0
      const piste = visible - debut
      const longueur = Math.max(LONGUEUR_MINIMALE, (piste * visible) / total)
      const decalage = ((piste - longueur) * position) / (total - visible)
      const pouce = pouceDe(zone, axe)
      // **Coordonnées de fenêtre, sur une couche `fixed`.** Positionner le curseur dans le conteneur
      // demanderait un `position: relative` sur chacun des quatorze — donc de toucher leur mise en
      // page pour un dispositif qui n'en fait pas partie.
      if (axe === 'vertical') {
        pouce.style.top = `${boite.top + debut + decalage}px`
        pouce.style.left = `${boite.right - 8}px`
        pouce.style.height = `${longueur}px`
      } else {
        pouce.style.left = `${boite.left + decalage}px`
        pouce.style.top = `${boite.bottom - 8}px`
        pouce.style.width = `${longueur}px`
      }
      pouce.style.opacity = '1'
    }

    function effacerPlusTard(zone: Element) {
      const etat = etatDe(zone)
      window.clearTimeout(etat.minuteur)
      etat.minuteur = window.setTimeout(() => {
        for (const pouce of Object.values(etat.pouces)) {
          // Ni pendant un glissement, ni sous le pointeur : c'est le moment où la barre sert.
          if (pouce.dataset.tenu === 'oui' || pouce.matches(':hover')) {
            effacerPlusTard(zone)
            return
          }
          pouce.style.opacity = '0'
        }
      }, REMANENCE_MS)
    }

    function auDefilement(evenement: Event) {
      const zone = evenement.target
      // Le document lui-même ne défile pas (`overflow: hidden` sur `html`/`body`), et un `scroll` sur
      // lui n'aurait pas de boîte à mesurer.
      if (!(zone instanceof HTMLElement)) return
      placer(zone, 'vertical')
      placer(zone, 'horizontal')
      effacerPlusTard(zone)
    }

    // **En capture.** Un événement `scroll` ne remonte pas l'arbre, mais il le descend : c'est ce qui
    // permet d'écouter tous les conteneurs, y compris ceux qui n'existent pas encore, sans que
    // chacun ait à se déclarer.
    document.addEventListener('scroll', auDefilement, true)
    return () => {
      document.removeEventListener('scroll', auDefilement, true)
      for (const etat of etats.values()) {
        window.clearTimeout(etat.minuteur)
        for (const pouce of Object.values(etat.pouces)) pouce.remove()
      }
    }
  }, [])

  // `aria-hidden` : une barre de défilement n'est pas du contenu, et le clavier défile déjà sans
  // elle. L'annoncer ajouterait deux éléments muets au parcours de chaque panneau.
  return <div ref={couche} className={styles.couche} aria-hidden="true" />
}
