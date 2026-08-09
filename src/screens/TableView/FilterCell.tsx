import { useEffect, useState } from 'react'
import type { FilterOperator } from '../../domain/engine'
import { cx } from '../../ui/cx'
import { Popover } from '../../ui/Popover/Popover'
import styles from './FilterCell.module.css'
import { OPERATEURS, signeDe } from './tri'

type FilterCellProps = {
  column: string
  operator: FilterOperator
  /** La valeur **appliquée**, celle qui est partie au serveur. */
  value: string
  onApply: (operator: FilterOperator, value: string) => void
}

/**
 * Un champ de filtre d'en-tête de colonne, avec son popover d'opérateur.
 *
 * **Le filtre part au serveur ; il ne trie pas la fenêtre.** Filtrer les 500 lignes déjà reçues
 * serait immédiat et faux : l'utilisateur croirait voir toutes les commandes payées de la table
 * alors qu'il ne verrait que celles des 500 premières lignes lues.
 *
 * **Appliqué sur `Entrée` et à la perte de focus**, jamais à la frappe : un filtre relancé à
 * chaque caractère enverrait cinq requêtes pour `paid`. Un anti-rebond au jugé aurait demandé
 * une durée que rien ne fonde.
 */
export function FilterCell({ column, operator, value, onApply }: FilterCellProps) {
  const [saisie, setSaisie] = useState(value)

  // La valeur appliquée fait autorité : vider un chip de la toolbar (`10e`) doit vider le champ,
  // sans quoi les deux affichages du même filtre divergeraient.
  useEffect(() => setSaisie(value), [value])

  const modifie = saisie !== value
  const actif = value !== '' || operator === 'isNull'

  function appliquer() {
    if (modifie) onApply(operator, saisie)
  }

  return (
    <div className={cx(styles.root, actif && styles.actif, modifie && styles.modifie)}>
      <Popover
        title={`Opérateur · ${column}`}
        content={(fermer) => (
          <ul className={styles.liste}>
            {OPERATEURS.map((o) => (
              <li key={o.valeur}>
                <button
                  type="button"
                  className={cx(styles.option, o.valeur === operator && styles.choisi)}
                  aria-current={o.valeur === operator}
                  onClick={() => {
                    // `is null` s'applique **sans valeur** : attendre une saisie qui ne viendra
                    // jamais laisserait le filtre inerte.
                    onApply(o.valeur, o.valeur === 'isNull' ? '' : saisie)
                    fermer()
                  }}
                >
                  <span className={styles.signe}>{o.signe}</span>
                  {o.libelle}
                </button>
              </li>
            ))}
          </ul>
        )}
      >
        <button type="button" className={styles.operateur} aria-label={`Opérateur de ${column}`}>
          {signeDe(operator)}
        </button>
      </Popover>
      <input
        className={styles.saisie}
        aria-label={`Filtrer ${column}`}
        value={operator === 'isNull' ? '' : saisie}
        disabled={operator === 'isNull'}
        onChange={(evenement) => setSaisie(evenement.target.value)}
        onKeyDown={(evenement) => {
          if (evenement.key === 'Enter') appliquer()
          // `Échap` rend la saisie à sa valeur appliquée plutôt que de fermer quoi que ce soit.
          if (evenement.key === 'Escape') setSaisie(value)
        }}
        onBlur={appliquer}
      />
    </div>
  )
}
