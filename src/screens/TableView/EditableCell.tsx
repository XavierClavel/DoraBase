import { useEffect, useRef, useState } from 'react'
import type { Value } from '../../domain/engine'
import { cx } from '../../ui/cx'
import styles from './EditableCell.module.css'
import type { Saisie } from './modifications'
import { texteBrutDe } from './modifications'

type EditableCellProps = {
  /** La valeur d'origine, telle que la base l'a rendue. */
  valeur: Value
  /** La saisie retenue pour cette cellule, s'il y en a une — elle prime sur l'origine. */
  retenue?: Saisie
  onValider: (saisie: Saisie) => void
  onAbandonner: () => void
}

/**
 * La cellule en saisie de `A6` : une **boîte flottante** par-dessus la trame.
 *
 * **Flottante, et c'est structurel.** Le mockup la fait déborder de 3 px en haut et en bas de sa
 * ligne, avec une bordure de 2 px et une ombre portée. Une cellule éditée *dans* la trame aurait à
 * choisir entre rogner son texte et pousser ses voisines ; celle-ci ne fait ni l'un ni l'autre.
 *
 * **Pas de caret décoratif.** Le mockup en dessine un de 1.5 × 14 px parce qu'une maquette statique
 * n'a pas de champ : le nôtre en a un vrai, avec un vrai curseur. En ajouter un second le laissait
 * orphelin à l'autre bout de la boîte dès que la colonne s'alignait à gauche — vu à la capture.
 *
 * **Trois touches, trois portées** (`11a`) : `↩` valide — la modification est *retenue*, rien n'est
 * envoyé ; `esc` abandonne la saisie ; `⌥⌫` pose `NULL`. `⌘Z` n'est pas ici : il annule la dernière
 * modification **retenue**, ce qui est l'affaire de l'écran, pas d'un champ.
 */
export function EditableCell({ valeur, retenue, onValider, onAbandonner }: EditableCellProps) {
  // La saisie part de ce qui est **retenu** s'il y a déjà une modification, de l'origine sinon :
  // rouvrir une cellule déjà modifiée doit montrer ce qu'on y a mis.
  const depart =
    retenue === undefined ? texteBrutDe(valeur) : retenue.kind === 'null' ? '' : retenue.texte
  const [texte, setTexte] = useState(depart)
  // `NULL` est un état de la saisie, pas une chaîne : il faut le distinguer d'un champ vidé, que le
  // moteur lirait comme la chaîne vide.
  const [nul, setNul] = useState(retenue?.kind === 'null')
  const champ = useRef<HTMLInputElement>(null)

  // Le champ prend le focus à l'ouverture, texte sélectionné : la frappe suivante remplace, ce qui
  // est le geste attendu d'une cellule qu'on vient d'ouvrir.
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])

  function valider() {
    onValider(nul ? { kind: 'null' } : { kind: 'texte', texte })
  }

  return (
    // `data-saisie` : la cellule qui nous contient s'en sert pour cesser de découper son débordement
    // (voir `VirtualGrid.module.css`). Un attribut plutôt qu'une classe, pour ne pas faire dépendre
    // un module CSS d'un nom hashé par un autre.
    <div className={cx(styles.root, nul && styles.nul)} data-saisie>
      <input
        ref={champ}
        className={styles.champ}
        aria-label="Nouvelle valeur"
        value={nul ? 'NULL' : texte}
        readOnly={nul}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        onChange={(evenement) => setTexte(evenement.target.value)}
        onKeyDown={(evenement) => {
          if (evenement.key === 'Enter') {
            evenement.preventDefault()
            valider()
            return
          }
          if (evenement.key === 'Escape') {
            // **`esc` abandonne la saisie, pas la modification retenue.** Les confondre ferait
            // perdre un changement validé en voulant sortir d'un champ — le défaut qu'`esc` dans
            // une modale a déjà produit une fois.
            evenement.preventDefault()
            evenement.stopPropagation()
            onAbandonner()
            return
          }
          // `⌥⌫` pose `NULL`. Le handoff ne le maquette pas : vider le champ donnerait la chaîne
          // vide, et la distinction est l'une des rares qu'un client de bases ne doit pas brouiller.
          if (evenement.altKey && evenement.key === 'Backspace') {
            evenement.preventDefault()
            setNul(true)
            return
          }
          // Sortir de `NULL` : n'importe quelle frappe imprimable rend la main au texte.
          if (nul && evenement.key.length === 1) {
            setNul(false)
            setTexte(evenement.key)
            evenement.preventDefault()
          }
        }}
        // Perdre le focus **valide**, comme un champ de filtre (`10d`) : abandonner serait perdre
        // une saisie sur un clic ailleurs, et l'utilisateur n'a pas dit qu'il renonçait.
        onBlur={valider}
      />
    </div>
  )
}
