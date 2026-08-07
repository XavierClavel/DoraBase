import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import { type ConnectionDraft, emptyDraft, emptyTunnel, type TunnelDraft } from './ConnectionDraft'
import { ConnectionForm } from './ConnectionForm'
import { EngineSelector } from './EngineSelector'
import { ENGINES, IMPLEMENTED_ENGINES } from './engines'
import styles from './NewConnection.module.css'
import { ouvrirSelecteurDeCle } from './ouvrirSelecteurDeCle'
import { TunnelPanel } from './TunnelPanel'

type NewConnectionProps = {
  onClose: () => void
  /** Les projets existants. Vide, l'enregistrement sera refusé par `08e`. */
  projects?: readonly { id: string; name: string }[]
  /**
   * Ouvre le sélecteur de fichier de la clé privée.
   *
   * Injecté pour que le câblage du bouton « Parcourir… » soit testable : le plugin `dialog`
   * ne répond pas hors de la webview, donc sous Vitest l'appel réel rejetterait. Par défaut,
   * c'est l'appel réel.
   */
  onBrowseKey?: () => Promise<string | null>
}

/**
 * `A2` — la modale de nouvelle connexion.
 *
 * **Aucun comportement dans ce scope.** « Tester la connexion » vient en `08d`,
 * « Enregistrer & ouvrir » en `08e`, et le panneau proxy / tunnel en `08c`. Les trois
 * boutons du pied sont présents et inertes, comme ceux de `A1` l'ont été jusqu'ici — un
 * bouton absent ferait croire que la fonction n'est pas prévue.
 */
export function NewConnection({
  onClose,
  projects = [],
  onBrowseKey = ouvrirSelecteurDeCle,
}: NewConnectionProps) {
  const [draft, setDraft] = useState<ConnectionDraft>(emptyDraft)
  // Le panneau proxy est replié à l'ouverture : le mockup le montre déplié, mais il y montre
  // aussi un tunnel configuré. Pour une connexion neuve, déplier un bloc vide de cinq champs
  // pousserait vers le bas ce que l'utilisateur doit remplir d'abord.
  const [tunnelOuvert, setTunnelOuvert] = useState(false)

  function patch(changes: Partial<ConnectionDraft>) {
    setDraft((previous) => ({ ...previous, ...changes }))
  }

  /**
   * Toucher un champ du panneau **crée** le tunnel s'il n'existe pas.
   *
   * L'utilisateur qui saisit un bastion déclare par là qu'il en veut un ; lui demander de
   * cocher une case en plus serait une étape que le handoff ne maquette pas. `05a` garde
   * l'absence représentable (`Option<Tunnel>`), et c'est ce qui compte : `06b` refuse une
   * variante déclarant un tunnel qu'on n'a pas ouvert.
   */
  function patchTunnel(changes: Partial<TunnelDraft>) {
    setDraft((previous) => ({
      ...previous,
      tunnel: { ...(previous.tunnel ?? emptyTunnel()), ...changes },
    }))
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
      <TunnelPanel
        tunnel={draft.tunnel}
        onChange={patchTunnel}
        open={tunnelOuvert}
        onOpenChange={setTunnelOuvert}
        onBrowse={onBrowseKey}
      />
    </Modal>
  )
}
