import { Icon } from '../../design/icons/Icon'
import styles from './EditBanner.module.css'

type EditBannerProps = {
  /** Le nombre d'entrées en attente, ajouts compris. Le bandeau n'existe pas à zéro. */
  compte: number
  /**
   * Combien de ces entrées sont des **lignes ajoutées**.
   *
   * **Nommées à part, et c'est le seul endroit qui annonce ce qui attend.** « 3 modifications » sur
   * un lot qui insère deux lignes dirait le contraire de ce qui partira : modifier et ajouter ne se
   * défont pas de la même façon — le patch inverse ne sait annuler que le premier.
   */
  ajouts?: number
  /** La table concernée, en mono — `public.orders`. */
  table: string
  /**
   * Montrer le SQL des modifications — `11c`. **Absent tant que l'écran n'existe pas**, et le
   * bouton se désactive alors en le disant.
   */
  onVoirLeSQL?: () => void
  onToutAnnuler: () => void
  /** Écrire dans la base — `11d`. Absent tant que la commande n'existe pas. */
  onAppliquer?: () => void
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
 * **« Voir le SQL » et « Appliquer » sont désactivés tant que leur écran n'existe pas**, comme les
 * quatre actions de `09f`. `11b` avait tranché l'inverse — « un bouton mort sous un bandeau qui
 * annonce trois modifications ferait croire à un défaut » — et c'est un bouton *actif et inerte* qui
 * a fait croire à un défaut, signalé à l'usage le 10 août 2026. Un clic sans effet ne s'explique
 * pas ; un bouton désactivé qui dit pourquoi, si. La leçon de `09f` valait aussi ici.
 */
export function EditBanner({
  compte,
  ajouts = 0,
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
        {resumeDeLAttente(compte, ajouts)} en attente sur{' '}
        <span className={styles.table}>{table}</span>
      </span>
      {/* **La promesse la plus importante de l'écran**, et le mockup la met là : tant qu'on n'a pas
          appliqué, la base n'a rien reçu. */}
      <span className={styles.rappel}>rien n’est envoyé à la base avant validation</span>
      {refus !== null && <span className={styles.refus}>{refus}</span>}
      <span className={styles.espace} />
      <button
        type="button"
        className={styles.action}
        onClick={onVoirLeSQL}
        disabled={onVoirLeSQL === undefined}
        title={onVoirLeSQL === undefined ? RAISONS.sql : undefined}
      >
        <Icon name="code" size={12} strokeWidth={2} />
        Voir le SQL
      </button>
      <button type="button" className={styles.action} onClick={onToutAnnuler} disabled={enCours}>
        Tout annuler
      </button>
      <button
        type="button"
        className={styles.appliquer}
        onClick={onAppliquer}
        disabled={enCours || onAppliquer === undefined}
        title={onAppliquer === undefined ? RAISONS.appliquer : undefined}
      >
        <Icon name="check" size={12} strokeWidth={2.6} />
        {enCours ? 'Application…' : 'Appliquer'}
        <span className={styles.raccourci}>⌘↩</span>
      </button>
    </div>
  )
}

/**
 * Pourquoi une action n'est pas encore là — **dite, jamais devinée**, comme les refus de
 * `modifications.ts`. Le même dispositif qu'en `09f` : la phrase est dans l'infobulle du bouton
 * désactivé, à portée du geste qui a échoué.
 */
const RAISONS = {
  sql: 'Le SQL des modifications arrive avec le panneau des modifications en attente.',
  appliquer: 'L’écriture dans la base n’est pas encore branchée : rien ne peut partir.',
}

/**
 * « 2 modifications et 1 ligne ajoutée » — ce qui attend, dit par son nom.
 *
 * Pure et exportée : c'est une règle de formulation, elle se teste sans DOM, comme `tri.ts` et
 * `modifications.ts`.
 */
export function resumeDeLAttente(compte: number, ajouts: number): string {
  const modifications = compte - ajouts
  const morceaux: string[] = []
  if (modifications > 0) {
    morceaux.push(`${modifications} modification${modifications > 1 ? 's' : ''}`)
  }
  if (ajouts > 0)
    morceaux.push(`${ajouts} ligne${ajouts > 1 ? 's' : ''} ajoutée${ajouts > 1 ? 's' : ''}`)
  return morceaux.join(' et ')
}
