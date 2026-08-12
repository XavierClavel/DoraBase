import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { cx } from '../../ui/cx'
import { Field } from '../../ui/Field/Field'
import { Modal } from '../../ui/Modal/Modal'
import styles from './SaveQueryDialog.module.css'

type SaveQueryDialogProps = {
  /** Le nom proposé — celui de la requête ouverte, ou vide. */
  nomInitial: string
  /** Vrai quand ce nom existe déjà : le bouton dit alors « Remplacer ». */
  existeDeja: (nom: string) => boolean
  onClose: () => void
  onEnregistrer: (nom: string) => Promise<void>
}

/**
 * La modale d'enregistrement d'une requête (`12f`).
 *
 * **« Remplacer » quand le nom existe, « Enregistrer » sinon.** Le bouton dit ce qui va se passer :
 * enregistrer sous un nom pris écrase, et l'apprendre après coup serait perdre du travail. C'est la
 * même exigence qu'en `08j` — un bouton qui nomme son acte est la dernière chance de lire ce qu'on
 * fait.
 */
export function SaveQueryDialog({
  nomInitial,
  existeDeja,
  onClose,
  onEnregistrer,
}: SaveQueryDialogProps) {
  const [nom, setNom] = useState(nomInitial)
  const [etat, setEtat] = useState<
    { phase: 'saisie' | 'en-cours' } | { phase: 'refuse'; message: string }
  >({ phase: 'saisie' })

  const propre = nom.trim()
  const remplace = propre !== '' && existeDeja(propre)
  const enCours = etat.phase === 'en-cours'

  async function enregistrer() {
    setEtat({ phase: 'en-cours' })
    try {
      await onEnregistrer(propre)
      onClose()
    } catch (erreur) {
      setEtat({ phase: 'refuse', message: String(erreur) })
    }
  }

  return (
    <Modal
      title="Enregistrer la requête"
      icon="save"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
            Annuler
          </Button>
          <Button
            variant="accent"
            size="md"
            onClick={enregistrer}
            disabled={propre === '' || enCours}
            title={propre === '' ? 'Une requête enregistrée doit avoir un nom.' : undefined}
          >
            {enCours ? 'Enregistrement…' : remplace ? 'Remplacer' : 'Enregistrer'}
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
            if (evenement.key === 'Enter' && propre !== '' && !enCours) enregistrer()
          }}
        />
        {remplace && (
          <p className={cx(styles.note, styles.remplace)}>
            Une requête porte déjà ce nom : son SQL sera remplacé.
          </p>
        )}
        <p className={styles.note}>
          La requête est enregistrée dans le projet, donc disponible dans tous ses environnements.
        </p>
        {etat.phase === 'refuse' && (
          <p className={styles.refus} role="alert">
            {etat.message}
          </p>
        )}
      </div>
    </Modal>
  )
}
