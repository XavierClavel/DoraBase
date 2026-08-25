import { useState } from 'react'
import type { DeleteEnvironmentResult } from '../../domain/config'
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
      title={`Retirer ${libelle}`}
      icon="trash"
      nested
      onClose={onClose}
      footer={
        etat.phase === 'fait' ? (
          <Button variant="dark" size="md" onClick={onClose}>
            Terminé
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
              Annuler
            </Button>
            <Button variant="dark" size="md" onClick={retirer} disabled={enCours}>
              {enCours ? 'Retrait…' : 'Retirer l’environnement'}
            </Button>
          </>
        )
      }
    >
      <div className={styles.corps}>
        {etat.phase === 'fait' ? (
          <div className={styles.rapport} role="status">
            <p className={styles.titre}>L’environnement est retiré.</p>
            <p>
              {etat.leftoverSecrets.length} mot(s) de passe n’ont pas pu être retirés du Trousseau.
              Ils y restent, sans effet sur l’application — vous pouvez les y effacer à la main.
            </p>
          </div>
        ) : (
          <>
            <p className={styles.phrase}>
              Retirer <strong>{libelle}</strong> de <em>{projet}</em> supprimera aussi{' '}
              <strong>
                {connexions.length} connexion{connexions.length > 1 ? 's' : ''} déclarée
                {connexions.length > 1 ? 's' : ''}
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
            <p className={styles.phrase}>Leurs mots de passe seront retirés du Trousseau.</p>
            {/* La phrase que `08j` a rendue obligatoire. En gras parce que c'est celle qu'on lit
                quand on ne lit qu'une ligne. */}
            <p className={styles.rassurance}>
              <strong>Les bases distantes ne sont pas touchées.</strong> DoraBase retire des
              déclarations, jamais des données.
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
