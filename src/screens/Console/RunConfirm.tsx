import { useT } from '../../i18n/LanguageContext'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import type { Nature } from './nature'
import styles from './RunConfirm.module.css'

type RunConfirmProps = {
  nature: Nature
  /** Vrai quand la requête modifie des lignes sans `where` — le cas le plus coûteux. */
  sansRestriction: boolean
  /** La base visée, pour que la confirmation dise *où* la requête va partir. */
  cible: string
  /** Vrai quand la base est déclarée en production. */
  production: boolean
  onClose: () => void
  onConfirmer: () => void
  enCours?: boolean
}

/**
 * La confirmation d'une requête qui écrit (`12c`).
 *
 * **Elle récapitule au lieu de demander « êtes-vous sûr ? »** — instruction, base, et le fait qu'il
 * n'y a pas de `where` s'il n'y en a pas. Une confirmation qui ne dit rien ne fait que déplacer le
 * clic ; celle-ci donne de quoi s'apercevoir qu'on s'est trompé de console, ce qui est la faute
 * qu'elle existe pour attraper.
 *
 * **Elle ne demande pas de retaper le nom de la table.** Le handoff ne le montre pas, et cette
 * friction appartient à une décision produit que rien ne réclame ici — même arbitrage qu'en `11d`.
 */
export function RunConfirm({
  nature,
  sansRestriction,
  cible,
  production,
  onClose,
  onConfirmer,
  enCours = false,
}: RunConfirmProps) {
  const t = useT()
  const schema = nature.kind === 'schema'
  const instruction = nature.kind === 'lecture' ? '' : nature.instruction

  return (
    <Modal
      title={t(schema ? 'console.runConfirm.titreSchema' : 'console.runConfirm.titreEcriture')}
      icon="warn"
      nested
      onClose={onClose}
    >
      <div className={styles.corps}>
        {/* **Le fait le plus coûteux en premier.** Un `update` sans `where` touche toute la table :
            c'est ce qu'il faut lire avant tout le reste, et le taire au milieu d'un récapitulatif
            serait le noyer. */}
        {sansRestriction && (
          <p className={styles.alerte}>
            {t('console.runConfirm.sansRestrictionAvant')}
            <strong>WHERE</strong>
            {t('console.runConfirm.sansRestrictionMilieu')}
            <strong>{t('console.runConfirm.toutesLesLignes')}</strong>
            {t('console.runConfirm.sansRestrictionApres')}
          </p>
        )}
        {schema && <p className={styles.alerte}>{t('console.runConfirm.alerteSchema')}</p>}
        <dl className={styles.recap}>
          <div className={styles.entree}>
            <dt>{t('console.runConfirm.instruction')}</dt>
            <dd className={styles.mono}>{instruction}</dd>
          </div>
          <div className={styles.entree}>
            <dt>{t('console.runConfirm.base')}</dt>
            <dd className={styles.mono}>{cible}</dd>
          </div>
          {production && (
            <div className={styles.entree}>
              <dt>{t('console.runConfirm.environnement')}</dt>
              <dd className={styles.prod}>{t('console.runConfirm.production')}</dd>
            </div>
          )}
        </dl>
        {/* Ce que DoraBase ne fera pas : il n'y a ni patch inverse ni transaction ici, contrairement
            à `11d`. Le dire est le minimum honnête — laisser croire à un filet qui n'existe pas
            serait pire que de ne rien annoncer. */}
        <p className={styles.rappel}>{t('console.runConfirm.rappel')}</p>
      </div>
      <div className={styles.pied}>
        <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
          {t('console.runConfirm.annuler')}
        </Button>
        {/* Le verbe du geste, comme en `08j` et `11d` : un bouton qui nomme son acte est la dernière
            chance de lire ce qu'on fait. */}
        <Button variant="dark" size="md" onClick={onConfirmer} disabled={enCours}>
          {enCours
            ? t('console.runConfirm.enCours')
            : t('console.runConfirm.confirmer', { instruction })}
        </Button>
      </div>
    </Modal>
  )
}
