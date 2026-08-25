import styles from './AucuneSelection.module.css'

type AucuneSelectionProps = {
  /**
   * Où le vide est rendu : le centre de l'écran, ou la colonne de droite.
   *
   * **Un seul composant pour les deux**, parce que c'est un seul état. Deux composants auraient
   * dérivé — le logo changé d'un côté, la teinte de l'autre — et l'écart ne se voit qu'en regardant
   * les deux moitiés en même temps, ce qu'on ne fait jamais en relisant un fichier.
   */
  variante?: 'centre' | 'colonne'
}

/**
 * Ce que le corps de l'écran de travail montre quand **il n'y a rien à montrer** : le logo décoloré,
 * et une phrase au centre.
 *
 * # Quand
 *
 * Aucun onglet ouvert, et aucun schéma en vue — donc rien de sélectionné, ou une sélection qui
 * s'arrête avant le schéma : un projet, un environnement, une connexion. Ces trois paliers n'ont pas
 * d'écran : ils n'ont ni liste d'objets ni structure, seulement des enfants dans l'arbre. Le schéma,
 * lui, est le premier palier qui a quelque chose à dire — c'est `A4`, et il reste.
 *
 * # Pourquoi un écran, et non des panneaux vides
 *
 * Le centre affichait la barre de fil d'Ariane avec « — · — », un contrôle segmenté à quatre zéros et
 * une liste d'objets vide, tandis que la colonne de droite montrait le cadre de détail d'un objet
 * inexistant. Trois cadres qui décrivent l'absence tiennent plus de place que l'absence elle-même, et
 * laissent croire qu'une lecture a échoué. La règle est donc : **rien à dire, pas de chrome** — le
 * logo dit où l'on est, la phrase dit quoi faire.
 *
 * # Pourquoi la colonne de droite reste
 *
 * Elle porte la largeur que l'utilisateur a réglée, et sa poignée avec elle. La faire disparaître
 * ferait sauter la mise en page de 296 px à chaque aller-retour entre un projet et une table — le
 * genre de saut qu'on remarque à la troisième fois. Elle garde donc sa place et sa teinte, avec le
 * même logo en plus petit : la colonne est plus étroite, le décor suit.
 *
 * Le logo est **décoloré**, comme la barre de titre se ternit derrière une modale (`08b`) : c'est le
 * même vocabulaire visuel pour « cet écran n'attend pas qu'on le lise », et il évite qu'un logo
 * pleine couleur au milieu de la fenêtre se lise comme un écran d'accueil — `A1` en a déjà un.
 */
export function AucuneSelection({ variante = 'centre' }: AucuneSelectionProps) {
  const colonne = variante === 'colonne'
  return (
    <div className={colonne ? styles.colonne : styles.root}>
      <svg
        className={colonne ? styles.logoPetit : styles.logo}
        viewBox="0 0 512 512"
        aria-hidden="true"
      >
        <use href="#logo" />
      </svg>
      {/* **La phrase n'est écrite qu'une fois.** La répéter dans la colonne donnerait deux
          instructions pour un seul geste, et un lecteur d'écran les lirait toutes les deux. */}
      {!colonne && <p className={styles.message}>Sélectionner une entité pour commencer</p>}
    </div>
  )
}
