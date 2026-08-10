import { invoke } from '@tauri-apps/api/core'
import type { CreateProjectRequest, Project, SaveDatabaseRequest } from '../../domain/config'
import type { ConnectionDraft } from './ConnectionDraft'

/**
 * Appelle la commande `save_database`, et rend les projets **à jour**.
 *
 * Rendre la liste plutôt qu'un simple succès évite un second aller-retour pour rafraîchir
 * l'écran, et supprime la fenêtre pendant laquelle l'écran et le disque divergeraient.
 *
 * Injectée dans `NewConnection` comme `onTest` et `onBrowseKey`, pour la même raison : le pont
 * ne répond pas hors de la webview, et ce qui est testable ici est le **câblage**.
 */
export async function enregistrerLaBase(request: SaveDatabaseRequest): Promise<Project[]> {
  return invoke<Project[]>('save_database', { request })
}

/**
 * Crée un projet vide, et rend les projets **à jour**.
 *
 * Distincte de `save_database`, et pas par symétrie : `enregistrer` refuse un projet inconnu, et
 * une commande qui créerait l'entité manquante par effet de bord ferait d'une faute de frappe un
 * second projet silencieux. Voir `08f`.
 */
export async function creerLeProjet(request: CreateProjectRequest): Promise<Project[]> {
  return invoke<Project[]>('create_project', { request })
}

/**
 * Convertit le brouillon de `A2` en requête d'enregistrement.
 *
 * **Distincte de `draftToRequest`** de `08d`, et pas par duplication : celle-là produit une
 * variante *jetable* pour un test, où un champ vide n'est pas une erreur. Celle-ci produit ce
 * qui sera **persisté**, donc soumis aux invariants de `05a` — que Rust vérifie, pas ce fichier.
 *
 * La variante part avec `password: null` : aucune `SecretRef` n'existe encore, et c'est
 * `enregistrer` côté Rust qui la fabrique après avoir rangé le secret. La poser ici obligerait
 * le front à connaître la convention de nommage des références, donc à la dupliquer.
 */
export function draftToSaveRequest(draft: ConnectionDraft): SaveDatabaseRequest {
  const port = Number.parseInt(draft.port, 10)
  const bastionPort = draft.tunnel ? Number.parseInt(draft.tunnel.bastionPort, 10) : 0

  return {
    project: draft.project,
    database: draft.name,
    engine: draft.engine,
    variant: {
      environment: draft.environment,
      host: draft.host,
      port: Number.isFinite(port) ? port : 0,
      defaultDatabase: draft.defaultDatabase,
      username: draft.username,
      password: null,
      sslMode: draft.sslMode,
      readOnly: draft.readOnly,
      reconnectOnStartup: draft.reconnectOnStartup,
      tunnel: draft.tunnel
        ? {
            kind: 'ssh',
            bastionHost: draft.tunnel.bastionHost,
            bastionPort: Number.isFinite(bastionPort) ? bastionPort : 0,
            username: draft.tunnel.username,
            privateKeyPath: draft.tunnel.privateKeyPath,
            localPort: null,
          }
        : null,
    },
    password: draft.password === '' ? null : draft.password,
  }
}
