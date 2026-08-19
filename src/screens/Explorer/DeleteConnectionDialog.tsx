import { useState } from 'react'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import styles from './DeleteConnectionDialog.module.css'

export type CibleDeSuppression =
  | {
      kind: 'database'
      project: string
      database: string
      /**
       * L'environnement de la connexion (`23b`).
       *
       * **Il fait partie de son identité** : sans lui, retirer « analytics » d'un projet qui la
       * déclare en dev et en prod supprimerait la première venue — et son mot de passe. Le modèle Rust
       * l'exige désormais dans sa signature ; ce champ est ce qui le porte depuis l'arbre.
       */
      environment: string
      connexions: number
    }
  | { kind: 'project'; project: string; connexions: number }

type DeleteConnectionDialogProps = {
  cible: CibleDeSuppression
  /** Les modifications en attente (`11b`) que la fermeture des onglets ferait perdre. */
  modificationsEnAttente: number
  onClose: () => void
  /** Rejette avec le refus à afficher. Rend les mots de passe que le magasin n'a pas su effacer. */
  onDelete: () => Promise<{ leftoverSecrets: string[] }>
}

/**
 * La confirmation de retrait d'une déclaration de connexion (`08j`).
 *
 * **Le mot « supprimer » n'apparaît nulle part, et c'est la décision centrale de cette spec.** Ce
 * qui part est une *déclaration* sur cet ordinateur ; ce qui reste est un serveur intact. La
 * confusion entre les deux est la seule chose ici qui pourrait coûter des données à quelqu'un,
 * alors trois choses la préviennent :
 *
 * - le titre et le bouton disent **« Retirer … de DoraBase »**, jamais « supprimer la base » ;
 * - la confirmation nomme les deux faits — celui qui inquiète *et* celui qui rassure ;
 * - le bouton porte le **verbe du geste** plutôt qu'un « OK », dernière chance de lire ce qu'on
 *   fait.
 */
export function DeleteConnectionDialog({
  cible,
  modificationsEnAttente,
  onClose,
  onDelete,
}: DeleteConnectionDialogProps) {
  const [etat, setEtat] = useState<
    | { phase: 'confirmation' }
    | { phase: 'en-cours' }
    | { phase: 'refuse'; message: string }
    | { phase: 'fait'; leftoverSecrets: string[] }
  >({ phase: 'confirmation' })

  const nom = cible.kind === 'project' ? cible.project : cible.database
  const verbe = cible.kind === 'project' ? 'Retirer le projet' : 'Retirer la connexion'

  async function retirer() {
    setEtat({ phase: 'en-cours' })
    try {
      const issue = await onDelete()
      // Comme en `08i` : on ne referme pas sur un fait qui mérite d'être lu.
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
      title={`Retirer ${nom} de DoraBase`}
      icon="trash"
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
            {/* Le bouton porte le **verbe du geste**, et non « OK » ou « Supprimer » : un bouton qui
                nomme son acte est la dernière chance de lire ce qu'on fait. */}
            <Button variant="dark" size="md" onClick={retirer} disabled={enCours}>
              {enCours ? 'Retrait…' : verbe}
            </Button>
          </>
        )
      }
    >
      {etat.phase === 'fait' ? (
        <div className={styles.corps} role="status">
          <p className={styles.titre}>C’est retiré de DoraBase.</p>
          <p>
            {etat.leftoverSecrets.length === 1
              ? '1 mot de passe n’a pas pu être effacé du Trousseau. Il y reste'
              : `${etat.leftoverSecrets.length} mots de passe n’ont pas pu être effacés du Trousseau. Ils y restent`}
            , sans effet sur l’application.
          </p>
        </div>
      ) : (
        <div className={styles.corps}>
          <p className={styles.efface}>
            <strong>Ce qui est effacé de cet ordinateur :</strong>{' '}
            {/* Les accords sont écrits, pas suffixés de « (s) » : la modale la plus lue de
                l'application est celle qui précède un geste irréversible, et un texte bâclé y
                inspire moins confiance qu'ailleurs. */}
            {cible.kind === 'project'
              ? `le projet ${cible.project} et ${connexionsDe(cible.connexions)} déclarée${
                  cible.connexions > 1 ? 's' : ''
                }`
              : `la connexion ${cible.database}, sur ${environnementsDe(cible.connexions)}`}
            , ainsi que les mots de passe enregistrés dans le Trousseau.
          </p>
          {/* **Le fait qui rassure, dit aussi fort que celui qui inquiète.** Sans cette phrase, un
              utilisateur pressé peut lire « supprimer une base de données » et croire qu'il efface
              son serveur de production. */}
          <p className={styles.intact}>
            <strong>Ce qui n’est pas touché :</strong> le serveur et ses données. DoraBase n’envoie
            aucune commande à la base — elle oublie seulement comment s’y connecter.
          </p>
          {modificationsEnAttente > 0 && (
            <p className={styles.attention}>
              {modificationsEnAttente === 1
                ? '1 modification en attente sera perdue'
                : `${modificationsEnAttente} modifications en attente seront perdues`}{' '}
              : les onglets de cette base vont se fermer, et rien n’a encore été envoyé à la base.
            </p>
          )}
          <p className={styles.definitif}>
            Il n’y a pas d’annulation : il faudra déclarer la connexion à nouveau.
          </p>
          {etat.phase === 'refuse' && (
            <p className={styles.refus} role="alert">
              {etat.message}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

/** « une connexion » ou « 3 connexions » — le compte s'écrit, il ne se suffixe pas. */
function connexionsDe(nombre: number): string {
  return nombre === 1 ? 'sa connexion' : `ses ${nombre} connexions`
}

/** « un environnement » ou « 2 environnements ». */
function environnementsDe(nombre: number): string {
  return nombre === 1 ? 'un environnement' : `${nombre} environnements`
}
