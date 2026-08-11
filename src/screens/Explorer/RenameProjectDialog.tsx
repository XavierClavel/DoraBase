import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { Field } from '../../ui/Field/Field'
import { Modal } from '../../ui/Modal/Modal'
import styles from './RenameProjectDialog.module.css'

type RenameProjectDialogProps = {
  /** Le nom actuel du projet — le champ en part, sélectionné. */
  projet: string
  onClose: () => void
  /**
   * Renomme. Rejette avec le refus à afficher — nom déjà pris, magasin en panne.
   *
   * Rend les deux faits que `rename_project` a jugé bon de dire : les mots de passe déclarés mais
   * introuvables, et ceux que le magasin n'a pas su effacer.
   */
  onRename: (nom: string) => Promise<{ missingSecrets: string[]; leftoverSecrets: string[] }>
}

/**
 * La modale de renommage d'un projet (`08i`).
 *
 * **Un seul champ, et c'est tout ce qu'il faut.** Le handoff ne maquette pas cet écran ; réutiliser
 * la coquille de `08a` et le champ de `02` donne un dialogue cohérent sans inventer de mise en page.
 *
 * **Le refus s'affiche dans la modale**, pas dans une alerte — même dispositif que le refus de
 * connexion de `08d` : la phrase est à côté du champ qu'il faut corriger.
 *
 * **L'attente est visible.** Un renommage déplace des secrets dans le Trousseau, ce qui peut
 * demander une autorisation du système : sans état d'attente, le bouton semblerait mort et
 * l'utilisateur cliquerait deux fois — la leçon des quatre états du test de connexion (`08d`).
 */
export function RenameProjectDialog({ projet, onClose, onRename }: RenameProjectDialogProps) {
  const [nom, setNom] = useState(projet)
  const [etat, setEtat] = useState<
    | { phase: 'saisie' }
    | { phase: 'en-cours' }
    | { phase: 'refuse'; message: string }
    | { phase: 'fait'; missingSecrets: string[]; leftoverSecrets: string[] }
  >({ phase: 'saisie' })

  const propre = nom.trim()
  // Le même nom est un état voulu, pas un doublon : la commande l'accepte sans rien faire, et
  // désactiver le bouton obligerait à modifier le champ pour pouvoir fermer par « Renommer ».
  const valide = propre !== ''

  async function renommer() {
    setEtat({ phase: 'en-cours' })
    try {
      const issue = await onRename(propre)
      // **On ne referme pas quand il y a quelque chose à dire.** Un mot de passe introuvable ou un
      // résidu dans le Trousseau se découvriraient sinon des semaines plus tard, sur un échec de
      // connexion sans explication.
      if (issue.missingSecrets.length > 0 || issue.leftoverSecrets.length > 0) {
        setEtat({ phase: 'fait', ...issue })
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
      title={`Renommer ${projet}`}
      icon="pencil"
      onClose={onClose}
      footer={
        etat.phase === 'fait' ? (
          // « Terminé » et non « Fermer » : la croix de la modale porte déjà ce nom, et deux
          // contrôles homonymes dans un même dialogue sont indiscernables à la voix. Celui-ci prend
          // acte d'un renommage qui a eu lieu, ce que « Terminé » dit mieux.
          <Button variant="dark" size="md" onClick={onClose}>
            Terminé
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="md" onClick={onClose} disabled={enCours}>
              Annuler
            </Button>
            <Button
              variant="accent"
              size="md"
              onClick={renommer}
              disabled={!valide || enCours}
              title={valide ? undefined : 'Un nom de projet ne peut pas être vide.'}
            >
              {enCours ? 'Renommage…' : 'Renommer'}
            </Button>
          </>
        )
      }
    >
      {etat.phase === 'fait' ? (
        <div className={styles.rapport} role="status">
          <p className={styles.titre}>Le projet est renommé.</p>
          {etat.missingSecrets.length > 0 && (
            <p>
              {etat.missingSecrets.length} mot(s) de passe étaient déclarés mais introuvables dans
              le Trousseau : ces bases le redemanderont à la prochaine connexion.
            </p>
          )}
          {etat.leftoverSecrets.length > 0 && (
            <p>
              {etat.leftoverSecrets.length} ancien(s) mot(s) de passe n’ont pas pu être effacés du
              Trousseau. Ils y restent en double, sans effet sur l’application.
            </p>
          )}
        </div>
      ) : (
        <>
          <Field
            label="Nom du projet"
            value={nom}
            // Les quatre attributs de `08a` : macOS corrigeait `localhost` en `Localhost`, et un
            // nom de projet n'a pas plus à être corrigé qu'un nom d'hôte.
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={enCours}
            onChange={(evenement) => setNom(evenement.target.value)}
            onKeyDown={(evenement) => {
              if (evenement.key === 'Enter' && valide && !enCours) renommer()
            }}
          />
          <p className={styles.avertissement}>
            Les mots de passe enregistrés suivent le nouveau nom, et les connexions ouvertes de ce
            projet seront fermées.
          </p>
          {etat.phase === 'refuse' && (
            <p className={styles.refus} role="alert">
              {etat.message}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
