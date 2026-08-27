import { useState } from 'react'
import type { DeleteEnvironmentResult } from '../../domain/config'
import { useT } from '../../i18n/LanguageContext'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import styles from './DeleteEnvironmentDialog.module.css'

type DeleteEnvironmentDialogProps = {
  projet: string
  /** Le libellé affiché de l'environnement — pas son identifiant, que l'utilisateur ne voit pas. */
  libelle: string
  /** Les connexions qui appartiennent à cet environnement, **nommées** (`23f`). */
  connexions: readonly string[]
  onClose: () => void
  /** Retire. Rejette avec le refus à afficher — dernier environnement, disque en panne. */
  onDelete: () => Promise<DeleteEnvironmentResult>
}

/**
 * La confirmation de retrait d'un environnement (`23f`).
 *
 * # Elle nomme ce qui disparaît
 *
 * Jamais « êtes-vous sûr ? » — la règle de `08j` et `11d`. Trois phrases, pour trois raisons
 * distinctes :
 *
 * 1. **l'ampleur** — combien de connexions partent, et lesquelles ;
 * 2. **le trousseau suit** — leurs mots de passe sont retirés ;
 * 3. **ce qui ne se passe pas** — les bases distantes ne sont pas touchées. C'est celle que `08j` a
 *    rendue obligatoire, parce que « supprimer une connexion » se lit comme « supprimer la base ».
 *
 * # Ce qu'elle ne propose pas
 *
 * **Déplacer les connexions vers un autre environnement.** C'est une réponse raisonnable à la même
 * situation, mais elle demande de déplacer un secret du trousseau : son geste, sa spec. Proposer une
 * action absente serait pire que son absence (défaut n° 36).
 *
 * **Annuler après coup.** Rien dans ce produit n'a de corbeille, et en inventer une pour ce seul
 * geste serait incohérent.
 */
export function DeleteEnvironmentDialog({
  projet,
  libelle,
  connexions,
  onClose,
  onDelete,
}: DeleteEnvironmentDialogProps) {
  const t = useT()
  const [etat, setEtat] = useState<
    | { phase: 'question' }
    | { phase: 'en-cours' }
    | { phase: 'refuse'; message: string }
    | { phase: 'fait'; leftoverSecrets: string[] }
  >({ phase: 'question' })

  async function retirer() {
    setEtat({ phase: 'en-cours' })
    try {
      const issue = await onDelete()
      // **On ne referme pas quand il y a quelque chose à dire.** Un mot de passe resté dans le
      // trousseau se découvrirait sinon des mois plus tard, sur une entrée orpheline que rien
      // n'explique.
      if (issue.leftoverSecrets.length > 0) {
        setEtat({ phase: 'fait', leftoverSecrets: issue.leftoverSecrets })
        return
      }
      onClose()
    } catch (erreur) {
      setEtat({ phase: 'refuse', message: String(erreur) })
    }
  }

  const enCours = etat.phase === 'en-cours'

  return (
    <Modal
      title={t('explorer.deleteEnvironment.title', { libelle })}
      icon="trash"
      nested
      onClose={onClose}
      footer={
        etat.phase === 'fait' ? (
          <Button variant="dark" size="md" onClick={onClose}>
            {t('explorer.deleteEnvironment.done')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
              {t('explorer.deleteEnvironment.cancel')}
            </Button>
            <Button variant="dark" size="md" onClick={retirer} disabled={enCours}>
              {enCours
                ? t('explorer.deleteEnvironment.removing')
                : t('explorer.deleteEnvironment.remove')}
            </Button>
          </>
        )
      }
    >
      <div className={styles.corps}>
        {etat.phase === 'fait' ? (
          <div className={styles.rapport} role="status">
            <p className={styles.titre}>{t('explorer.deleteEnvironment.doneTitle')}</p>
            <p>
              {t('explorer.deleteEnvironment.leftover', { count: etat.leftoverSecrets.length })}
            </p>
          </div>
        ) : (
          <>
            <p className={styles.phrase}>
              {t('explorer.deleteEnvironment.introBefore')}
              <strong>{libelle}</strong>
              {t('explorer.deleteEnvironment.introBetween')}
              <em>{projet}</em>
              {t('explorer.deleteEnvironment.introAfter')}
              <strong>
                {connexions.length > 1
                  ? t('explorer.deleteEnvironment.connexionsPlural', {
                      count: connexions.length,
                    })
                  : t('explorer.deleteEnvironment.connexionsSingular', {
                      count: connexions.length,
                    })}
              </strong>{' '}
              :
            </p>
            {/* **Nommées, non comptées seulement.** Un compte dit l'ampleur ; les noms disent ce
                qu'on perd, et c'est ce qui permet de reconnaître qu'on s'est trompé
                d'environnement. */}
            <ul className={styles.connexions}>
              {connexions.map((connexion) => (
                <li key={connexion}>{connexion}</li>
              ))}
            </ul>
            <p className={styles.phrase}>{t('explorer.deleteEnvironment.secretsWillBeRemoved')}</p>
            {/* La phrase que `08j` a rendue obligatoire. En gras parce que c'est celle qu'on lit
                quand on ne lit qu'une ligne. */}
            <p className={styles.rassurance}>
              <strong>{t('explorer.deleteEnvironment.reassuranceTitle')}</strong>{' '}
              {t('explorer.deleteEnvironment.reassuranceBody')}
            </p>
            {etat.phase === 'refuse' && (
              <p className={styles.refus} role="alert">
                {etat.message}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
