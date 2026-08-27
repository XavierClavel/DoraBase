import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import styles from './ApplyConfirm.module.css'
import type { EnAttente } from './modifications'

type ApplyConfirmProps = {
  attente: EnAttente
  table: string
  onClose: () => void
  onConfirmer: () => void
  enCours?: boolean
}

/**
 * La confirmation d'application sur une base de **production** (`11d`).
 *
 * **Une sous-modale, comme `A3`** : `08d` a posé le motif — par-dessus la modale, voile plus opaque.
 *
 * **Elle récapitule au lieu de demander « êtes-vous sûr ? »** — table, lignes, colonnes touchées. Une
 * confirmation qui ne dit rien ne fait que déplacer le clic d'un pixel ; celle-ci donne de quoi
 * s'apercevoir qu'on s'est trompé de table ou qu'on touche vingt lignes au lieu d'une.
 *
 * **Elle ne demande pas de retaper le nom de la table.** Le mockup ne le montre pas, et cette
 * friction appartient à une décision produit que rien ne réclame ici.
 */
export function ApplyConfirm({
  attente,
  table,
  onClose,
  onConfirmer,
  enCours = false,
}: ApplyConfirmProps) {
  // Les lignes, pas les modifications : trois corrections sur la même ligne n'en touchent qu'une, et
  // c'est le nombre de lignes qui dit l'ampleur de ce qu'on écrit.
  const lignes = new Set(attente.map((modification) => modification.cle)).size
  const colonnes = [
    ...new Set(
      attente.flatMap((modification) => {
        if (modification.sorte === 'cellule') return [modification.column]
        // Une suppression ne touche aucune colonne en particulier : elle emporte la ligne entière.
        if (modification.sorte === 'suppression') return []
        return Object.keys(modification.valeurs)
      }),
    ),
  ]
  // **Les trois verbes sont comptés séparément**, et c'est le dernier écran avant une écriture en
  // production : « 3 UPDATE » sur un lot qui insère deux lignes et en supprime une dirait le
  // contraire de ce qui part.
  const ajouts = attente.filter((modification) => modification.sorte === 'ligne').length
  const suppressions = attente.filter((modification) => modification.sorte === 'suppression').length
  const misesAJour = attente.length - ajouts - suppressions

  return (
    <Modal title="Écrire en production" icon="warn" nested onClose={onClose}>
      <div className={styles.corps}>
        <p className={styles.alerte}>
          Cette base est déclarée en <strong>production</strong>.
        </p>
        <dl className={styles.recap}>
          <div className={styles.entree}>
            <dt>Table</dt>
            <dd className={styles.mono}>{table}</dd>
          </div>
          <div className={styles.entree}>
            <dt>{lignes === 1 ? 'Ligne' : 'Lignes'}</dt>
            <dd>{lignes}</dd>
          </div>
          <div className={styles.entree}>
            <dt>{colonnes.length === 1 ? 'Colonne' : 'Colonnes'}</dt>
            <dd className={styles.mono}>{colonnes.join(', ')}</dd>
          </div>
          <div className={styles.entree}>
            <dt>Instructions</dt>
            <dd>{resumeDesInstructions(misesAJour, ajouts, suppressions)}, en une transaction</dd>
          </div>
        </dl>
        {/* Ce que `11d` livre vraiment : le patch inverse est rendu après l'écriture et copiable,
            mais **il n'est pas persisté** — `A10` en fera une préférence à 24 h. Annoncer « gardé
            24 h » sans le garder serait pire que ne rien annoncer. */}
        <p className={styles.patch}>
          Après l’écriture, DoraBase affichera le SQL qui l’annule. Il reste disponible tant que cet
          onglet est ouvert.
        </p>
      </div>
      <div className={styles.pied}>
        <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
          Annuler
        </Button>
        {/* Le verbe du geste, comme en `08j` : un bouton qui nomme son acte est la dernière chance de
            lire ce qu'on fait. */}
        <Button variant="dark" size="md" onClick={onConfirmer} disabled={enCours}>
          {enCours ? 'Écriture…' : 'Écrire en production'}
        </Button>
      </div>
    </Modal>
  )
}

/** « 2 UPDATE et 1 INSERT » — ce qui part vraiment, sans nommer un verbe absent. */
function resumeDesInstructions(misesAJour: number, ajouts: number, suppressions: number): string {
  const morceaux: string[] = []
  if (misesAJour > 0) morceaux.push(`${misesAJour} UPDATE`)
  if (ajouts > 0) morceaux.push(`${ajouts} INSERT`)
  if (suppressions > 0) morceaux.push(`${suppressions} DELETE`)
  return morceaux.join(' et ')
}
