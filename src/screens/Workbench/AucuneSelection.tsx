import styles from './AucuneSelection.module.css'

/**
 * Ce que le corps de l'écran de travail montre quand **rien n'est sélectionné** : le logo décoloré
 * et une phrase.
 *
 * # Pourquoi un écran, et non des panneaux vides
 *
 * Sans sélection ni onglet, le centre affichait la barre de fil d'Ariane avec « — · — », un contrôle
 * segmenté à quatre zéros et une liste d'objets vide, tandis que la colonne de droite montrait le
 * cadre de détail d'un objet inexistant. Trois cadres qui décrivent l'absence tiennent plus de place
 * que l'absence elle-même, et laissent croire qu'une lecture a échoué. La règle est donc : **pas de
 * sélection, pas de chrome** — le logo dit où l'on est, la phrase dit quoi faire.
 *
 * Le logo est **décoloré**, comme la barre de titre se ternit derrière une modale (`08b`) : c'est le
 * même vocabulaire visuel pour « cet écran n'attend pas qu'on le lise », et il évite qu'un logo
 * pleine couleur au milieu de la fenêtre se lise comme un écran d'accueil — `A1` en a déjà un.
 */
export function AucuneSelection() {
  return (
    <div className={styles.root}>
      <svg className={styles.logo} viewBox="0 0 512 512" aria-hidden="true">
        <use href="#logo" />
      </svg>
      <p className={styles.message}>Sélectionner une entité pour commencer</p>
    </div>
  )
}
