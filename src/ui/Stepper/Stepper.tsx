import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './Stepper.module.css'

export type EtapeDeParcours = {
  /** Ce qui s'affiche, en capitales — « PROJET », « CONNEXION ». */
  libelle: string
}

type StepperProps = {
  etapes: readonly EtapeDeParcours[]
  /** L'index de l'étape en cours, à partir de 0. Celles d'avant sont faites. */
  courante: number
  /** Nomme la bande pour un lecteur d'écran. */
  label?: string
}

/**
 * La bande de progression d'un parcours à étapes (`24b`).
 *
 * # Informative, et rien d'autre
 *
 * On ne peut pas y naviguer, et **elle n'en a pas l'air** — ce qui est obtenu par un ensemble
 * d'absences plutôt que par un attribut :
 *
 * - **ni `<button>`, ni `<button disabled>`.** Un bouton désactivé dit « cliquable, mais pas
 *   maintenant », ce qui serait faux ici : ce n'est pas cliquable, et ça ne le sera jamais ;
 * - **pas de `cursor: pointer`, pas de `:hover`, pas d'anneau de focus, pas de `tabindex`.** Ce sont
 *   les quatre marques que ce produit pose sur ce qui se clique ; leur absence est le message ;
 * - **pas de `role="tablist"`.** Un `tablist` promet la navigation aux flèches — c'est la leçon du
 *   défaut n° 52, où un rôle ARIA annonçait une convention que le code ne tenait pas. Un `<ol>` promet
 *   un ordre, et rien de plus.
 *
 * # L'état ne vit jamais dans la seule couleur
 *
 * Une étape faite porte une **coche**, non un simple changement de teinte, et chaque entrée porte une
 * phrase masquée — « Étape 1 sur 2, faite ». Un daltonien lit la coche ; une voix lit la phrase. C'est
 * la règle que `09d` applique déjà à ses quatre états de connexion.
 *
 * # Ce qu'elle ne fait pas
 *
 * Elle ne rend **pas** de « Retour ». Dans le parcours de `24a`–`24c`, le projet est écrit à la fin de
 * la première étape : revenir voudrait dire renommer un projet existant, ce qui est le geste de `23e`,
 * pas une navigation de stepper.
 */
export function Stepper({ etapes, courante, label = 'Progression' }: StepperProps) {
  return (
    <ol className={styles.root} aria-label={label}>
      {etapes.map((etape, index) => {
        const faite = index < courante
        const enCours = index === courante
        return (
          <li
            key={etape.libelle}
            className={cx(styles.etape, faite && styles.faite, enCours && styles.enCours)}
            // Sur l'étape en cours **seulement** : `aria-current` décrit sans rien promettre, là où
            // `aria-selected` d'un onglet annoncerait un contrôle.
            aria-current={enCours ? 'step' : undefined}
          >
            <span className={styles.pastille} aria-hidden="true">
              {faite ? <Icon name="check" size={12} strokeWidth={2.4} /> : index + 1}
            </span>
            <span className={styles.libelle}>{etape.libelle}</span>
            {/* La phrase que la couleur ne dit pas. Masquée à l'œil, jamais à la voix — `display:
                none` la retirerait de l'arbre d'accessibilité, ce qui est le contraire du but. */}
            <span className={styles.pourLaVoix}>
              {`Étape ${index + 1} sur ${etapes.length}, ${
                faite ? 'faite' : enCours ? 'en cours' : 'à faire'
              }`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
