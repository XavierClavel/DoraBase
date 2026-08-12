import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { Field } from '../../ui/Field/Field'
import { Modal } from '../../ui/Modal/Modal'
import styles from './SaveQueryDialog.module.css'

type RenameQueryDialogProps = {
  nomInitial: string
  /** Vrai quand ce nom est déjà pris par une **autre** requête. */
  existeDeja: (nom: string) => boolean
  onClose: () => void
  onRenommer: (nom: string) => Promise<void>
}

/**
 * Le renommage d'une requête enregistrée (`12f`).
 *
 * **Distincte de `SaveQueryDialog`**, malgré la ressemblance : celle-ci refuse un nom pris, l'autre
 * l'accepte en remplaçant. Un composant paramétré par un drapeau « remplace ou refuse » cacherait
 * cette différence, qui est la seule qui compte entre les deux.
 *
 * Elle réemploie sa feuille de style : deux modales d'un champ qui ne se ressembleraient pas
 * obligeraient à relire la seconde.
 */
export function RenameQueryDialog({
  nomInitial,
  existeDeja,
  onClose,
  onRenommer,
}: RenameQueryDialogProps) {
  const [nom, setNom] = useState(nomInitial)
  const [refus, setRefus] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const propre = nom.trim()
  const pris = propre !== '' && existeDeja(propre)

  async function renommer() {
    setEnCours(true)
    try {
      await onRenommer(propre)
      onClose()
    } catch (erreur) {
      setEnCours(false)
      setRefus(String(erreur))
    }
  }

  return (
    <Modal
      title={`Renommer ${nomInitial}`}
      icon="pencil"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
            Annuler
          </Button>
          <Button
            variant="accent"
            size="md"
            onClick={renommer}
            disabled={propre === '' || pris || enCours}
            title={
              pris
                ? 'Une autre requête porte déjà ce nom.'
                : propre === ''
                  ? 'Une requête enregistrée doit avoir un nom.'
                  : undefined
            }
          >
            {enCours ? 'Renommage…' : 'Renommer'}
          </Button>
        </>
      }
    >
      <div className={styles.corps}>
        <Field
          label="Nom de la requête"
          value={nom}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          disabled={enCours}
          onChange={(evenement) => setNom(evenement.target.value)}
          onKeyDown={(evenement) => {
            if (evenement.key === 'Enter' && propre !== '' && !pris && !enCours) renommer()
          }}
        />
        {/* **Refusé, pas remplacé** : deux requêtes homonymes seraient indiscernables dans la liste,
            et « Enregistrer » ne saurait plus laquelle mettre à jour. */}
        {pris && (
          <p className={styles.refus} role="alert">
            Une autre requête porte déjà ce nom.
          </p>
        )}
        {refus !== null && (
          <p className={styles.refus} role="alert">
            {refus}
          </p>
        )}
      </div>
    </Modal>
  )
}
