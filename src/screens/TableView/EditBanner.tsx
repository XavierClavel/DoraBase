import { Icon } from '../../design/icons/Icon'
import styles from './EditBanner.module.css'

type EditBannerProps = {
  /** Le nombre de modifications en attente. Le bandeau n'existe pas à zéro. */
  compte: number
  /** La table concernée, en mono — `public.orders`. */
  table: string
  onVoirLeSQL: () => void
  onToutAnnuler: () => void
  onAppliquer: () => void
  /** Vrai pendant l'application : les trois boutons attendent. */
  enCours?: boolean
  /** Le refus de l'application, affiché ici — là où les messages du mode édition vivent. */
  refus?: string | null
}

/**
 * Le bandeau du mode édition, sous la barre de titre.
 *
 * **Il n'existe qu'avec des modifications en attente**, et c'est ce que le mockup montre : un
 * bandeau à « 0 modification » occuperait 34 px pour ne rien dire. Le mode édition, lui, se voit au
 * badge de la pastille projet et aux cellules qui s'ouvrent.
 *
 * **« Appliquer » est actif dès `11b`**, et non désactivé avec une infobulle comme les quatre
 * actions de `09f`. La raison de l'écart : là, les écrans attendus étaient à trois specs de
 * distance ; ici la commande arrive dans la spec suivante, et un bouton mort sous un bandeau qui
 * annonce trois modifications ferait croire à un défaut. Son échec s'affiche dans ce bandeau.
 */
export function EditBanner({
  compte,
  table,
  onVoirLeSQL,
  onToutAnnuler,
  onAppliquer,
  enCours = false,
  refus = null,
}: EditBannerProps) {
  if (compte === 0) return null

  return (
    // `role="status"` : le compte change sous les doigts de l'utilisateur, et un lecteur d'écran doit
    // l'entendre sans avoir à aller le chercher. **Nommé**, parce que l'écran en porte deux — celle-ci
    // et la barre d'état — et que deux régions de statut anonymes sont indiscernables à la voix.
    <div className={styles.root} role="status" aria-label="Modifications en attente">
      <Icon name="warn" size={14} strokeWidth={2.1} className={styles.icone} />
      <span className={styles.compte}>
        {compte} modification{compte > 1 ? 's' : ''} en attente sur{' '}
        <span className={styles.table}>{table}</span>
      </span>
      {/* **La promesse la plus importante de l'écran**, et le mockup la met là : tant qu'on n'a pas
          appliqué, la base n'a rien reçu. */}
      <span className={styles.rappel}>rien n’est envoyé à la base avant validation</span>
      {refus !== null && <span className={styles.refus}>{refus}</span>}
      <span className={styles.espace} />
      <button type="button" className={styles.action} onClick={onVoirLeSQL}>
        <Icon name="code" size={12} strokeWidth={2} />
        Voir le SQL
      </button>
      <button type="button" className={styles.action} onClick={onToutAnnuler} disabled={enCours}>
        Tout annuler
      </button>
      <button type="button" className={styles.appliquer} onClick={onAppliquer} disabled={enCours}>
        <Icon name="check" size={12} strokeWidth={2.6} />
        {enCours ? 'Application…' : 'Appliquer'}
        <span className={styles.raccourci}>⌘↩</span>
      </button>
    </div>
  )
}
