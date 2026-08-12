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
  const schema = nature.kind === 'schema'
  const instruction = nature.kind === 'lecture' ? '' : nature.instruction

  return (
    <Modal
      title={schema ? 'Modifier la structure' : 'Écrire dans la base'}
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
            Cette requête n’a pas de <strong>WHERE</strong> : elle touchera{' '}
            <strong>toutes les lignes</strong> de la table.
          </p>
        )}
        {schema && (
          <p className={styles.alerte}>
            Une modification de structure ne se défait pas par une autre requête.
          </p>
        )}
        <dl className={styles.recap}>
          <div className={styles.entree}>
            <dt>Instruction</dt>
            <dd className={styles.mono}>{instruction}</dd>
          </div>
          <div className={styles.entree}>
            <dt>Base</dt>
            <dd className={styles.mono}>{cible}</dd>
          </div>
          {production && (
            <div className={styles.entree}>
              <dt>Environnement</dt>
              <dd className={styles.prod}>production</dd>
            </div>
          )}
        </dl>
        {/* Ce que DoraBase ne fera pas : il n'y a ni patch inverse ni transaction ici, contrairement
            à `11d`. Le dire est le minimum honnête — laisser croire à un filet qui n'existe pas
            serait pire que de ne rien annoncer. */}
        <p className={styles.rappel}>
          DoraBase exécute la requête telle qu’elle est écrite, sans transaction et sans patch
          inverse.
        </p>
      </div>
      <div className={styles.pied}>
        <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
          Annuler
        </Button>
        {/* Le verbe du geste, comme en `08j` et `11d` : un bouton qui nomme son acte est la dernière
            chance de lire ce qu'on fait. */}
        <Button variant="dark" size="md" onClick={onConfirmer} disabled={enCours}>
          {enCours ? 'Exécution…' : `Exécuter ce ${instruction}`}
        </Button>
      </div>
    </Modal>
  )
}
