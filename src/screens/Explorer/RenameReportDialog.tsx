import { useT } from '../../i18n/LanguageContext'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import styles from './RenameReportDialog.module.css'

export type RapportDeRenommage = {
  /** Le nom visé — celui qu'on voulait donner, ou qu'on a donné. */
  nom: string
  /** Le refus du cœur, s'il y en a eu un. Présent, rien n'a été renommé. */
  refus?: string
  /** Les mots de passe déclarés mais introuvables : la connexion les redemandera. */
  missingSecrets: readonly string[]
  /** Les originaux que le magasin n'a pas su effacer : un doublon dans le Trousseau. */
  leftoverSecrets: readonly string[]
}

type RenameReportDialogProps = {
  rapport: RapportDeRenommage
  onClose: () => void
}

/**
 * Ce qu'un renommage de connexion avait à dire (`26`).
 *
 * # Pourquoi une modale pour un renommage
 *
 * Le renommage se fait **sur place**, dans la ligne d'arbre : il n'y a donc aucun écran où loger un
 * refus, contrairement au renommage d'un projet, qui vit dans un formulaire (`23e`). Trois choses
 * peuvent devoir être dites — un nom refusé, un mot de passe introuvable, un résidu dans le
 * Trousseau — et la troisième se découvrirait sinon des semaines plus tard, sur un échec de
 * connexion sans raison apparente.
 *
 * # Elle n'est montée que s'il y a quelque chose à dire
 *
 * **Le succès est muet**, et c'est le bon comportement : la ligne d'arbre porte déjà le nouveau nom,
 * ce qui est la confirmation. Une modale « c'est renommé » à chaque fois apprendrait à cliquer sans
 * lire, exactement ce que `23f` refuse pour un environnement vide.
 */
export function RenameReportDialog({ rapport, onClose }: RenameReportDialogProps) {
  const t = useT()
  const refuse = rapport.refus !== undefined

  return (
    <Modal
      // Le titre dit **laquelle des deux nouvelles** c'est, avant même le corps : un refus et un
      // succès à réserve n'ont pas le même en-tête.
      title={
        refuse
          ? t('explorer.renameReport.refusedTitle', { nom: rapport.nom })
          : t('explorer.renameReport.doneTitle', { nom: rapport.nom })
      }
      icon={refuse ? 'warn' : 'pencil'}
      onClose={onClose}
      footer={
        <Button variant="dark" size="md" onClick={onClose}>
          {t('explorer.renameReport.done')}
        </Button>
      }
    >
      <div className={styles.corps} role="status">
        {rapport.refus !== undefined && (
          <>
            <p className={styles.refus}>{rapport.refus}</p>
            {/* **Le fait qui rassure, dit aussi fort que celui qui inquiète** — la règle de `08j`.
                Un refus de renommage laisse tout en place, et ne pas le dire laisse craindre un
                état intermédiaire. */}
            <p>{t('explorer.renameReport.reassurance')}</p>
          </>
        )}
        {rapport.missingSecrets.length > 0 && (
          <p className={styles.reserve}>{t('explorer.renameReport.missingSecrets')}</p>
        )}
        {rapport.leftoverSecrets.length > 0 && (
          <p className={styles.reserve}>{t('explorer.renameReport.leftoverSecrets')}</p>
        )}
      </div>
    </Modal>
  )
}
