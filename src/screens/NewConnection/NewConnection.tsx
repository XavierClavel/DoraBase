import { useEffect, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type {
  CreateProjectRequest,
  Database,
  EnvironmentDeclaration,
  Project,
  UpdateVariantRequest,
} from '../../domain/config'
import type { ConnectionRequest, ConnectionTest } from '../../domain/engine'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import {
  type ConnectionDraft,
  draftDepuisLaVariante,
  emptyDraft,
  emptyTunnel,
  type TunnelDraft,
} from './ConnectionDraft'
import { ConnectionFailure } from './ConnectionFailure'
import { ConnectionForm, NOUVEAU_PROJET } from './ConnectionForm'
import { draftToRequest } from './draftToRequest'
import { EngineSelector } from './EngineSelector'
import { ENGINES, IMPLEMENTED_ENGINES } from './engines'
import {
  creerLeProjet,
  draftToSaveRequest,
  draftToUpdateRequest,
  enregistrerLaBase,
  mettreAJourLaVariante,
} from './enregistrerLaBase'
import styles from './NewConnection.module.css'
import { ouvrirSelecteurDeCle } from './ouvrirSelecteurDeCle'
import { TunnelPanel } from './TunnelPanel'
import { codeDe, messageDe, testerLaConnexion } from './testerLaConnexion'

type NewConnectionProps = {
  onClose: () => void
  /** Les projets existants. Vide, l'enregistrement sera refusé par `08e`. */
  projects?: readonly {
    id: string
    name: string
    /** Ses environnements déclarés, que `A2` propose (`23d`). */
    environments: readonly EnvironmentDeclaration[]
  }[]
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
  /** Appelle la commande `save_database`. Injectée pour la même raison que `onTest`. */
  onSave?: (request: ReturnType<typeof draftToSaveRequest>) => Promise<Project[]>
  /** Appelle la commande `create_project` (`08f`), sous « + Nouveau projet… ». */
  onCreateProject?: (request: CreateProjectRequest) => Promise<Project[]>
  /**
   * La base à modifier (`08g`). Absente, la modale **crée**.
   *
   * Le même formulaire sert les deux : `A2` porte déjà tous les champs, et un second écran en
   * dupliquerait la mise en page — donc la dérive au premier changement du handoff.
   */
  edition?: { project: string; database: Database }
  /** Appelle la commande `update_variant` (`08g`). */
  onUpdate?: (request: UpdateVariantRequest) => Promise<Project[]>
  /** Appelé après un enregistrement réussi, avec les projets à jour. */
  onSaved?: (projects: Project[]) => void
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
/**
 * La variante à modifier — la **première** de la base.
 *
 * Une base peut en avoir trois (`dev`, `staging`, `prod`), et le menu de la pastille n'en désigne
 * qu'une : celle de l'environnement actif du projet. Ce scope modifie donc la variante qui
 * correspond, ou la première à défaut. Choisir laquelle éditer quand il y en a plusieurs appartient
 * à l'écran « Bases du projet » de `A10`.
 */
/**
 * Les réglages à éditer.
 *
 * **Il n'y a plus de choix à faire** (`23b`) : une connexion porte un seul jeu de réglages. Cette
 * fonction prenait la première variante « ou celle qui correspond », et le commentaire d'origine
 * renvoyait le vrai choix à un écran « Bases du projet ». Le modèle a tranché à sa place.
 */
function varianteCible(edition: { database: Database }) {
  return edition.database.connection
}

export function NewConnection({
  onClose,
  projects = [],
  onBrowseKey = ouvrirSelecteurDeCle,
  onTest = testerLaConnexion,
  onSave = enregistrerLaBase,
  onCreateProject = creerLeProjet,
  edition,
  onUpdate = mettreAJourLaVariante,
  onSaved,
}: NewConnectionProps) {
  // En mode édition, le brouillon part des réglages enregistrés. `useState` avec initialiseur : le
  // recalculer à chaque rendu écraserait la saisie en cours.
  const [draft, setDraft] = useState<ConnectionDraft>(() =>
    edition
      ? draftDepuisLaVariante(edition.project, edition.database, varianteCible(edition))
      : emptyDraft(),
  )
  // Le panneau proxy est replié à l'ouverture : le mockup le montre déplié, mais il y montre
  // aussi un tunnel configuré. Pour une connexion neuve, déplier un bloc vide de cinq champs
  // pousserait vers le bas ce que l'utilisateur doit remplir d'abord.
  const [tunnelOuvert, setTunnelOuvert] = useState(false)
  const [test, setTest] = useState<EtatDuTest>({ phase: 'jamais' })
  // La sous-modale de `A3` se ferme sans effacer l'échec : le pied garde son message et
  // « Retester », ce que le handoff montre explicitement.
  const [echecOuvert, setEchecOuvert] = useState(false)
  const [enregistrement, setEnregistrement] = useState<
    { phase: 'jamais' } | { phase: 'en-cours' } | { phase: 'refuse'; message: string }
  >({ phase: 'jamais' })

  function patch(changes: Partial<ConnectionDraft>) {
    setDraft((previous) => ({ ...previous, ...changes }))
  }

  /**
   * Aligne le projet du brouillon sur ce que le `Select` **affiche**.
   *
   * **Le piège du select contrôlé.** Un `<select>` dont la `value` ne correspond à aucune de ses
   * options affiche la première, sans que l'état en soit averti : l'écran montrait
   * « Atelier Nord » tandis que le brouillon portait encore la chaîne vide, et
   * l'enregistrement visait donc un projet inexistant. Trouvé par un test qui vérifiait le
   * `project` de la requête, pas par l'œil — à l'écran, tout allait bien.
   *
   * Le même effet couvre le cas d'une sélection devenue invalide, si la liste des projets
   * change sous les pieds de l'utilisateur.
   */
  useEffect(() => {
    // En édition, le projet est **imposé** : il désigne la base à modifier.
    if (edition) return
    // La sentinelle de `08f` est une valeur **valable** du `Select` : sans ce test, choisir
    // « + Nouveau projet… » serait aussitôt remplacé par le premier projet existant.
    if (draft.project === NOUVEAU_PROJET) return
    const premier = projects.at(0)
    // Aucun projet : la sentinelle est le seul choix, donc le brouillon la prend — ce qui rend le
    // champ de nom visible d'emblée, et l'application neuve n'est plus une impasse.
    if (!premier) {
      if (draft.project !== NOUVEAU_PROJET) {
        setDraft((precedent) => ({ ...precedent, project: NOUVEAU_PROJET }))
      }
      return
    }
    const valide = projects.some((projet) => projet.id === draft.project)
    // `setDraft` et non `patch` : `patch` est recréé à chaque rendu, donc le déclarer en
    // dépendance relancerait l'effet en boucle. Le poseur d'état de React, lui, est stable.
    if (!valide) setDraft((precedent) => ({ ...precedent, project: premier.id }))
  }, [projects, draft.project, edition])

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

  // « Enregistrer & ouvrir » est désactivé **après un échec de test**, et réactivé après un
  // succès. Pas désactivé avant tout test : rien n'oblige à tester pour enregistrer, et le
  // handoff ne le demande pas.
  //
  // Il est aussi désactivé **sans aucun projet** : `A2` déclare une base *dans un projet
  // existant*, et le handoff ne maquette pas le parcours d'un utilisateur qui n'en a aucun.
  // Voir le § « À trancher » de `specs/README.md`, trou n°4.
  const creeUnProjet = draft.project === NOUVEAU_PROJET
  const nomDuProjetManque = creeUnProjet && draft.newProjectName.trim() === ''

  // **Il n'est plus désactivé faute de projet** : depuis `08f`, `A2` sait en créer un. Il l'est
  // en revanche quand « + Nouveau projet… » est choisi sans nom saisi — un refus qui serait sinon
  // dit par le cœur après un aller-retour, là où l'écran a l'information sous la main.
  const enregistrementBloque =
    test.phase === 'echoue' || nomDuProjetManque || enregistrement.phase === 'en-cours'

  async function enregistrer() {
    if (enregistrementBloque) return
    setEnregistrement({ phase: 'en-cours' })
    try {
      if (edition) {
        // **Mise à jour, pas enregistrement** : `save_database` refuserait une base déjà là, et
        // c'est cette garde qui protège d'un écrasement par mégarde.
        const projets = await onUpdate(
          draftToUpdateRequest(draft, {
            project: edition.project,
            database: edition.database.name,
            environment: edition.database.environment,
          }),
        )
        onSaved?.(projets)
        onClose()
        return
      }
      // **Deux commandes, un geste.** Si la seconde échoue, le projet reste — créé et vide. C'est
      // le comportement honnête : le défaire supprimerait un projet à la suite d'un échec de
      // connexion, et détruirait un homonyme préexistant en cas de course. `08f` le dit.
      let nom = draft.project
      if (creeUnProjet) {
        nom = draft.newProjectName.trim()
        // **`environments: []` : le cœur reprend le trio par défaut** (`24a`). Ce chemin — créer un
        // projet depuis `A2` — est celui que `24c` retire ; en attendant, il ne peut pas proposer de
        // libellés d'environnement, n'ayant pas l'écran pour les saisir.
        const apresCreation = await onCreateProject({ name: nom, environments: [] })
        onSaved?.(apresCreation)
      }
      const projets = await onSave(draftToSaveRequest({ ...draft, project: nom }))
      onSaved?.(projets)
      // La modale se ferme : `08e` § Hors périmètre — « ouvrir » veut dire aller vers `A4`,
      // qui n'existe pas avant `09`. Ce scope enregistre et ferme ; `09` branchera la
      // navigation. Dit ici pour qu'un lecteur ne cherche pas le bug.
      onClose()
    } catch (cause) {
      // Le refus s'affiche là où `08d` affiche déjà les échecs : le message inline du pied.
      // `A2` ne maquette aucun message d'erreur de champ — réemploi plutôt qu'invention, et la
      // question d'un affichage par champ est consignée au § « À trancher ».
      setEnregistrement({ phase: 'refuse', message: messageDe(cause) })
    }
  }

  // `⌘↩`, tel que le pied l'affiche. Inopérant quand le bouton est désactivé : un raccourci
  // qui contourne l'état d'un bouton est un piège.
  useEffect(() => {
    function auClavier(evenement: KeyboardEvent) {
      if (evenement.metaKey && evenement.key === 'Enter') {
        evenement.preventDefault()
        void enregistrer()
      }
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  })

  return (
    <Modal
      title={edition ? `Modifier ${edition.database.name}` : 'Nouvelle connexion'}
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
          {enregistrement.phase === 'refuse' && (
            <span className={styles.testFail}>{enregistrement.message}</span>
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
          <Button
            size="lg"
            shortcut="⌘↩"
            disabled={enregistrementBloque}
            onClick={() => void enregistrer()}
          >
            <Icon name="save" size={14} strokeWidth={2.2} />
            {edition ? 'Enregistrer les modifications' : <>Enregistrer &amp; ouvrir</>}
          </Button>
        </>
      }
    >
      <EngineSelector value={draft.engine} onValueChange={(engine) => patch({ engine })} />
      <ConnectionForm draft={draft} onChange={patch} projects={projects} verrouille={!!edition} />
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
