import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { ConnectionRequest, ConnectionTest } from '../../domain/engine'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import { type ConnectionDraft, emptyDraft, emptyTunnel, type TunnelDraft } from './ConnectionDraft'
import { ConnectionFailure } from './ConnectionFailure'
import { ConnectionForm } from './ConnectionForm'
import { draftToRequest } from './draftToRequest'
import { EngineSelector } from './EngineSelector'
import { ENGINES, IMPLEMENTED_ENGINES } from './engines'
import styles from './NewConnection.module.css'
import { ouvrirSelecteurDeCle } from './ouvrirSelecteurDeCle'
import { TunnelPanel } from './TunnelPanel'
import { codeDe, messageDe, testerLaConnexion } from './testerLaConnexion'

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
  /**
   * Appelle la commande `test_connection`.
   *
   * Injecté pour la même raison que `onBrowseKey` : le pont IPC ne répond pas hors de la
   * webview. Ce qui est testé ici est le **câblage** — l'état d'attente, l'affichage du
   * résultat, la sous-modale d'échec. Le pont lui-même s'observe dans l'app réelle, et un test
   * Vitest qui simulerait `invoke` ne vérifierait que le simulacre.
   */
  onTest?: (request: ConnectionRequest) => Promise<ConnectionTest>
}

/**
 * L'issue du test de connexion.
 *
 * **Quatre états, pas deux.** Le mockup montre le succès (`A2`) et l'échec (`A3`), et il manque
 * l'attente : un test vers un hôte injoignable prend jusqu'à 30 secondes (`06e` a posé ce
 * délai). Sans état d'attente, le bouton semble mort et l'utilisateur reclique.
 */
type EtatDuTest =
  | { phase: 'jamais' }
  | { phase: 'en-cours' }
  | { phase: 'reussi'; resultat: ConnectionTest }
  | { phase: 'echoue'; message: string; code: string | null; viaTunnel: boolean }

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
  onTest = testerLaConnexion,
}: NewConnectionProps) {
  const [draft, setDraft] = useState<ConnectionDraft>(emptyDraft)
  // Le panneau proxy est replié à l'ouverture : le mockup le montre déplié, mais il y montre
  // aussi un tunnel configuré. Pour une connexion neuve, déplier un bloc vide de cinq champs
  // pousserait vers le bas ce que l'utilisateur doit remplir d'abord.
  const [tunnelOuvert, setTunnelOuvert] = useState(false)
  const [test, setTest] = useState<EtatDuTest>({ phase: 'jamais' })
  // La sous-modale de `A3` se ferme sans effacer l'échec : le pied garde son message et
  // « Retester », ce que le handoff montre explicitement.
  const [echecOuvert, setEchecOuvert] = useState(false)

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

  async function lancerLeTest() {
    setTest({ phase: 'en-cours' })
    const viaTunnel = draft.tunnel !== null
    try {
      const resultat = await onTest(draftToRequest(draft))
      setTest({ phase: 'reussi', resultat })
    } catch (cause) {
      setTest({ phase: 'echoue', message: messageDe(cause), code: codeDe(cause), viaTunnel })
      setEchecOuvert(true)
    }
  }

  // « Enregistrer & ouvrir » est désactivé **après un échec**, et réactivé après un succès.
  // Pas désactivé avant tout test : rien n'oblige à tester pour enregistrer, et le handoff ne
  // le demande pas.
  const enregistrementBloque = test.phase === 'echoue'

  return (
    <Modal
      title="Nouvelle connexion"
      icon="db"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            size="lg"
            onClick={lancerLeTest}
            disabled={test.phase === 'en-cours' || !engineImplemented}
          >
            {/* La fiole est verte dans le mockup, seule icône du pied à ne pas prendre la
                couleur de son texte. */}
            <Icon name="flask" size={14} strokeWidth={2} className={styles.flask} />
            {libelleDuBouton(test.phase)}
          </Button>

          {test.phase === 'reussi' && (
            <span className={styles.testOk}>
              <Icon name="check" size={14} strokeWidth={2.4} />
              Connecté en {test.resultat.latencyMs} ms · {test.resultat.serverVersion}
              {test.resultat.tunnelLocalPort !== null &&
                ` · tunnel :${test.resultat.tunnelLocalPort}`}
            </span>
          )}
          {test.phase === 'reussi' && test.resultat.tlsUnverified && (
            // **Laid et honnête.** `06b` emploie `NoTls` : un test en `verify-ca` ou
            // `verify-full` réussit sans que l'identité du serveur ait été contrôlée. Afficher
            // « Connecté » sans plus serait exact et trompeur. À retirer quand le TLS sera
            // branché — pas avant.
            <span className={styles.testWarn}>· TLS non vérifié</span>
          )}
          {test.phase === 'echoue' && (
            <button type="button" className={styles.testFail} onClick={() => setEchecOuvert(true)}>
              {test.message}
            </button>
          )}
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
          <Button size="lg" shortcut="⌘↩" disabled={enregistrementBloque}>
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

      {echecOuvert && test.phase === 'echoue' && (
        <ConnectionFailure
          message={test.message}
          code={test.code}
          viaTunnel={test.viaTunnel}
          onClose={() => setEchecOuvert(false)}
        />
      )}
    </Modal>
  )
}

/**
 * Le libellé du bouton de test selon la phase.
 *
 * « Retester » après un échec est le mot du handoff (`A3` § pied). L'état d'attente n'est pas
 * maquetté : « Test en cours… » est le minimum défendable, sans animation inventée. La question
 * d'un indicateur de progression est consignée au § « À trancher » de `specs/README.md`.
 */
function libelleDuBouton(phase: EtatDuTest['phase']): string {
  if (phase === 'en-cours') return 'Test en cours…'
  if (phase === 'echoue') return 'Retester'
  return 'Tester la connexion'
}
