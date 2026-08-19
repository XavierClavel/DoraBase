import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './ListeDeroulante.module.css'

export type OptionDeListe<T extends string> = {
  value: T
  label: string
  /** Rendu à gauche du libellé, dans la liste **et** dans le champ fermé. */
  ornement?: ReactNode
}

type ListeDeroulanteProps<T extends string> = {
  /** Nomme le contrôle pour un lecteur d'écran. Visible ou non, c'est à l'appelant de le rendre. */
  label: string
  /** L'`id` du `<label>` visible, quand l'appelant en rend un. */
  labelledBy?: string
  options: readonly OptionDeListe<T>[]
  value: T
  onValueChange: (value: T) => void
  /** Classe du champ fermé, pour que l'appelant en porte la géométrie. */
  className?: string
  /** Rendu à gauche de la valeur dans le champ fermé. */
  prefixe?: ReactNode
  disabled?: boolean
  id?: string
}

/**
 * Une liste déroulante **maison**, en remplacement du `<select>` natif.
 *
 * # Pourquoi remplacer le natif
 *
 * Le natif apportait gratuitement le clavier, la recherche à la frappe et le rendu système de la
 * liste — c'est l'argument qu'écrivait `Select` (`08a`), et il était bon tant qu'on ne regardait que
 * l'état fermé. Ouvert, il rend le menu **du système** : une liste grise aux angles et aux ombres de
 * macOS, au milieu d'une interface qui a ses propres rayons, ses encres et ses teintes. Décidé le
 * 19 août 2026 : aucun composant natif visible dans ce produit.
 *
 * Ce qui était gratuit doit donc être écrit, et l'est ici une seule fois :
 *
 * - **le clavier** — `↑`/`↓` pour parcourir, `Début`/`Fin` pour les bouts, `Entrée` et `Espace` pour
 *   choisir, `Échap` pour renoncer, et la frappe d'une lettre pour sauter à la première option qui
 *   commence par elle ;
 * - **le focus** — il revient au champ à la fermeture, sans quoi `Tab` repartirait du `<body>` ;
 * - **les rôles ARIA** — `combobox` sur le champ, `listbox` sur le panneau, `option` sur chaque
 *   entrée, et `aria-activedescendant` pour que l'option courante s'annonce sans quitter le champ.
 *
 * # Ce qui n'est pas repris du natif
 *
 * La recherche à la frappe se limite à **une lettre** et non à un préfixe accumulé. Une liste de ce
 * produit compte au plus une dizaine d'entrées ; accumuler les frappes demanderait un minuteur de
 * remise à zéro pour une différence qui ne se voit pas à cette échelle.
 */
export function ListeDeroulante<T extends string>({
  label,
  labelledBy,
  options,
  value,
  onValueChange,
  className,
  prefixe,
  disabled = false,
  id,
}: ListeDeroulanteProps<T>) {
  const idAuto = useId()
  const idChamp = id ?? idAuto
  const [ouvert, setOuvert] = useState(false)
  const [survolee, setSurvolee] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  )
  const champ = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLUListElement>(null)

  const choisie = options.find((option) => option.value === value)

  // À l'ouverture, l'option courante est celle qu'on parcourt : `↓` doit partir d'où l'on est, pas du
  // haut de la liste.
  useEffect(() => {
    if (ouvert)
      setSurvolee(
        Math.max(
          0,
          options.findIndex((option) => option.value === value),
        ),
      )
  }, [ouvert, options, value])

  useEffect(() => {
    if (!ouvert) return
    function ailleurs(evenement: PointerEvent) {
      const cible = evenement.target as Node
      if (panneau.current?.contains(cible) || champ.current?.contains(cible)) return
      setOuvert(false)
    }
    // En capture : un clic sur un élément qui arrête la propagation ne refermerait sinon rien.
    document.addEventListener('pointerdown', ailleurs, true)
    return () => document.removeEventListener('pointerdown', ailleurs, true)
  }, [ouvert])

  function fermer(rendreLeFocus = true) {
    setOuvert(false)
    // **Le focus revient au champ.** Sans cela, fermer la liste au clavier laisse le focus sur un
    // élément démonté, et la tabulation suivante repart du début du document.
    if (rendreLeFocus) champ.current?.focus()
  }

  function valider(index: number) {
    const option = options[index]
    if (option) onValueChange(option.value)
    fermer()
  }

  function auClavier(evenement: React.KeyboardEvent) {
    const dernier = options.length - 1
    switch (evenement.key) {
      case 'ArrowDown':
        evenement.preventDefault()
        if (!ouvert) {
          setOuvert(true)
          return
        }
        setSurvolee((actuelle) => Math.min(dernier, actuelle + 1))
        return
      case 'ArrowUp':
        evenement.preventDefault()
        if (!ouvert) {
          setOuvert(true)
          return
        }
        setSurvolee((actuelle) => Math.max(0, actuelle - 1))
        return
      case 'Home':
        if (!ouvert) return
        evenement.preventDefault()
        setSurvolee(0)
        return
      case 'End':
        if (!ouvert) return
        evenement.preventDefault()
        setSurvolee(dernier)
        return
      case 'Enter':
      case ' ':
        evenement.preventDefault()
        if (ouvert) valider(survolee)
        else setOuvert(true)
        return
      case 'Escape':
        if (!ouvert) return
        evenement.preventDefault()
        fermer()
        return
      case 'Tab':
        // Tabuler valide ce qui est parcouru puis laisse partir : c'est ce que fait le natif, et
        // abandonner silencieusement serait pire qu'un choix explicite.
        if (ouvert) valider(survolee)
        return
      default: {
        // La frappe d'une lettre saute à la première option qui commence par elle.
        if (evenement.key.length !== 1) return
        const lettre = evenement.key.toLowerCase()
        const index = options.findIndex((option) => option.label.toLowerCase().startsWith(lettre))
        if (index === -1) return
        evenement.preventDefault()
        if (ouvert) setSurvolee(index)
        else onValueChange(options[index]?.value as T)
      }
    }
  }

  return (
    <span className={styles.racine}>
      <button
        ref={champ}
        type="button"
        id={idChamp}
        className={cx(styles.champ, className)}
        // `combobox` et non `button` : c'est un champ qui **porte une valeur** et ouvre une liste. Le
        // motif ARIA 1.2 « combobox avec liste » prescrit exactement ces attributs.
        role="combobox"
        aria-expanded={ouvert}
        aria-haspopup="listbox"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-activedescendant={ouvert ? `${idChamp}-${survolee}` : undefined}
        disabled={disabled}
        onClick={() => setOuvert((etat) => !etat)}
        onKeyDown={auClavier}
      >
        {prefixe}
        <span className={styles.valeur}>{choisie?.label ?? ''}</span>
        <Icon name="chevd" size={13} strokeWidth={2.2} className={styles.chevron} />
      </button>
      {ouvert && (
        /* Un `<ul role="listbox">` est **exactement** ce que prescrit le motif ARIA 1.2 « combobox
           avec liste ». La règle suppose qu'un rôle interactif sur une liste est une erreur, ce qui
           est vrai partout ailleurs ; l'alternative — des `<div>` nus — perdrait la structure que les
           lecteurs d'écran annoncent (« 3 éléments »). */
        <ul
          ref={panneau}
          className={styles.panneau}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: voir la note ci-dessus
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => (
            /* `<li role="option">` est la forme prescrite par le même motif. Et une option **ne doit
               pas** prendre le focus : il reste sur le champ, `aria-activedescendant` désignant
               l'option courante. La rendre focalisable casserait l'annonce et la navigation. */
            // biome-ignore lint/a11y/useFocusableInteractive: voir la note ci-dessus
            <li
              key={option.value}
              id={`${idChamp}-${index}`}
              // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: voir la note ci-dessus
              role="option"
              aria-selected={option.value === value}
              className={cx(styles.option, index === survolee && styles.parcourue)}
              onPointerDown={(evenement) => {
                // `pointerdown` plutôt que `click` : le champ perd le focus au `mousedown`, et un
                // `click` arriverait après la fermeture par clic extérieur.
                evenement.preventDefault()
                valider(index)
              }}
              onPointerEnter={() => setSurvolee(index)}
            >
              {option.ornement}
              <span className={styles.libelle}>{option.label}</span>
              {option.value === value && (
                <Icon name="check" size={12} strokeWidth={2.4} className={styles.coche} />
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
