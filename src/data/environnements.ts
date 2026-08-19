import { invoke } from '@tauri-apps/api/core'
import type {
  CreateEnvironmentRequest,
  DeleteEnvironmentRequest,
  DeleteEnvironmentResult,
  Project,
  RecolorEnvironmentRequest,
  RenameEnvironmentRequest,
  ReorderEnvironmentsRequest,
} from '../domain/config'

/**
 * Les cinq gestes de `23c`, en un seul point de contact avec l'IPC.
 *
 * # Cinq appels, non un `mettre_a_jour_projet`
 *
 * Un appel qui enverrait la liste entière ne permettrait pas au cœur de distinguer un **renommage**
 * d'une suppression suivie d'une création — et les deux ne font pas la même chose au trousseau. Le
 * front ne décide donc pas de l'état d'arrivée : il nomme le geste.
 *
 * # Ce qu'ils rendent
 *
 * Les quatre premiers rendent **les projets à jour**, non un accusé de réception : l'écran d'édition
 * (`23e`) applique chaque geste immédiatement, donc il a besoin de la liste que le disque porte
 * désormais. Le cinquième rend plus que les projets, parce qu'il emporte des connexions et peut
 * laisser des secrets derrière (`23f`).
 *
 * Chacun est **injectable** dans les composants qui l'emploient, pour la raison de `08d` : le pont ne
 * répond pas hors de la webview, et ce qui est testable est le câblage.
 */

/** Déclare un environnement de plus. Un identifiant en doublon est refusé par le cœur (`23a`). */
export async function creerLEnvironnement(request: CreateEnvironmentRequest): Promise<Project[]> {
  return invoke<Project[]>('create_environment', { request })
}

/**
 * Change le libellé d'un environnement — **jamais son identifiant** (`23a`).
 *
 * L'appel désigne l'environnement par son identifiant, pas par son ancien libellé : les deux
 * divergent dès le premier renommage, et c'est assumé — la référence d'un mot de passe dans le
 * trousseau contient l'identifiant.
 */
export async function renommerLEnvironnement(
  request: RenameEnvironmentRequest,
): Promise<Project[]> {
  return invoke<Project[]>('rename_environment', { request })
}

/** Change la couleur et le drapeau de production. Les deux ensemble : voir le cœur. */
export async function recolorierLEnvironnement(
  request: RecolorEnvironmentRequest,
): Promise<Project[]> {
  return invoke<Project[]>('recolor_environment', { request })
}

/** Réordonne les environnements. L'ordre doit être complet — une permutation partielle est refusée. */
export async function reordonnerLesEnvironnements(
  request: ReorderEnvironmentsRequest,
): Promise<Project[]> {
  return invoke<Project[]>('reorder_environments', { request })
}

/**
 * Retire un environnement, **et les connexions qui lui appartiennent** (`23f`).
 *
 * **Rien n'est supprimé sur le serveur.** La commande ne reçoit aucun moteur, n'ouvre aucune
 * connexion et n'émet aucun SQL. Le nom de cette fonction le dit : `supprimerLEnvironnement` aurait
 * laissé planer l'ambiguïté que `08j` combat — celle qui fait lire « supprimer une connexion » comme
 * « supprimer la base ».
 *
 * Rend les connexions supprimées (pour les redire), les secrets restés dans le trousseau, et
 * l'environnement devenu actif quand c'est l'actif qui est parti.
 */
export async function retirerLEnvironnement(
  request: DeleteEnvironmentRequest,
): Promise<DeleteEnvironmentResult> {
  return invoke<DeleteEnvironmentResult>('delete_environment', { request })
}
