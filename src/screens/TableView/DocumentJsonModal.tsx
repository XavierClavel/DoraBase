import { useState } from 'react'
import { useT } from '../../i18n/LanguageContext'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import styles from './DocumentJsonModal.module.css'
import { JsonEditor } from './JsonEditor'

type DocumentJsonModalProps = {
  /** « Éditer le document » ou « Nouveau document » — le seul mot qui distingue les deux gestes. */
  titre: string
  texteInitial: string
  onFermer: () => void
  /**
   * Tente d'enregistrer le texte courant.
   *
   * **Synchrone et pure** : `diffDocument` et `retenir` ne parlent à aucun réseau, comme toute la
   * saisie de `A6` — rien ne part avant « Appliquer ». Un message de refus garde la modale ouverte,
   * texte intact, comme un champ de connexion refusé (`08j`).
   */
  onEnregistrer: (texte: string) => string | null
}

/**
 * La modale d'édition d'un document NoSQL en JSON.
 *
 * **Un texte local, pas un état remonté à chaque frappe.** `JsonEditor` n'est pas contrôlé (voir
 * `SqlEditor`) : le texte n'est lu qu'à l'enregistrement, exactement comme un formulaire de
 * connexion ne valide qu'au clic.
 */
export function DocumentJsonModal({
  titre,
  texteInitial,
  onFermer,
  onEnregistrer,
}: DocumentJsonModalProps) {
  const t = useT()
  const [texte, setTexte] = useState(texteInitial)
  const [erreur, setErreur] = useState<string | null>(null)

  function enregistrer() {
    const refus = onEnregistrer(texte)
    if (refus !== null) setErreur(refus)
  }

  return (
    <Modal
      title={titre}
      icon="json"
      onClose={onFermer}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onFermer}>
            {t('tableView.documentJson.cancel')}
          </Button>
          <Button variant="dark" size="md" onClick={enregistrer}>
            {t('tableView.documentJson.save')}
          </Button>
        </>
      }
    >
      <div className={styles.corps}>
        <div className={styles.editeur}>
          <JsonEditor
            texteInitial={texteInitial}
            onTexteChange={(nouveau) => {
              setTexte(nouveau)
              // Une frappe rouvre la porte : le refus qu'elle a peut-être causé n'a plus lieu
              // d'être affiché tel quel une fois le texte changé.
              if (erreur !== null) setErreur(null)
            }}
            onValider={enregistrer}
          />
        </div>
        {erreur !== null && (
          <p className={styles.refus} role="alert">
            {erreur}
          </p>
        )}
      </div>
    </Modal>
  )
}
