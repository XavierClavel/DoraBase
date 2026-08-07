import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import { type ConnectionDraft, emptyDraft } from './ConnectionDraft'
import { ConnectionForm } from './ConnectionForm'
import { EngineSelector } from './EngineSelector'
import { ENGINES, IMPLEMENTED_ENGINES } from './engines'
import styles from './NewConnection.module.css'

type NewConnectionProps = {
  onClose: () => void
  /** Les projets existants. Vide, l'enregistrement sera refusé par `08e`. */
  projects?: readonly { id: string; name: string }[]
}

/**
 * `A2` — la modale de nouvelle connexion.
 *
 * **Aucun comportement dans ce scope.** « Tester la connexion » vient en `08d`,
 * « Enregistrer & ouvrir » en `08e`, et le panneau proxy / tunnel en `08c`. Les trois
 * boutons du pied sont présents et inertes, comme ceux de `A1` l'ont été jusqu'ici — un
 * bouton absent ferait croire que la fonction n'est pas prévue.
 */
export function NewConnection({ onClose, projects = [] }: NewConnectionProps) {
  const [draft, setDraft] = useState<ConnectionDraft>(emptyDraft)

  function patch(changes: Partial<ConnectionDraft>) {
    setDraft((previous) => ({ ...previous, ...changes }))
  }

  const engineImplemented = IMPLEMENTED_ENGINES.includes(draft.engine)

  return (
    <Modal
      title="Nouvelle connexion"
      icon="db"
      onClose={onClose}
      footer={
        <>
          {/* `08d` le branchera sur la couche moteur. */}
          <Button variant="secondary" size="lg">
            {/* La fiole est verte dans le mockup, seule icône du pied à ne pas prendre la
                couleur de son texte. */}
            <Icon name="flask" size={14} strokeWidth={2} className={styles.flask} />
            Tester la connexion
          </Button>
          {!engineImplemented && (
            // Un moteur sans adaptateur est **sélectionnable et le dit**. Le masquer ferait
            // croire que le produit ne le prévoit pas ; le laisser muet ferait croire que
            // « Tester » est cassé. Voir `specs/08b` § Hors périmètre.
            <span className={styles.unsupported}>
              {ENGINES[draft.engine].label} n’a pas encore d’adaptateur
            </span>
          )}
          <span className={styles.footerSpacer} />
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          {/* `08e` le branchera, avec son raccourci ⌘↩. */}
          <Button size="lg" shortcut="⌘↩">
            <Icon name="save" size={14} strokeWidth={2.2} />
            Enregistrer &amp; ouvrir
          </Button>
        </>
      }
    >
      <EngineSelector value={draft.engine} onValueChange={(engine) => patch({ engine })} />
      <ConnectionForm draft={draft} onChange={patch} projects={projects} />
    </Modal>
  )
}
