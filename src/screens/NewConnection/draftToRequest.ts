import type { ConnectionRequest } from '../../domain/engine'
import type { ConnectionDraft } from './ConnectionDraft'

/**
 * Convertit le brouillon de `A2` en requête de test.
 *
 * **Ce n'est pas la conversion de `08e`.** Celle-ci produit une `EnvironmentVariant`
 * *persistable* — mot de passe rangé, `SecretRef` en place, invariants de `05a` vérifiés, refus
 * possible. Ici on ne persiste rien : le mot de passe part en clair, à côté de la variante, et
 * un champ vide n'est pas une erreur mais une valeur que le moteur rejettera avec son propre
 * message. Confondre les deux ferait refuser un test parce qu'un nom de base est vide, alors
 * que tester sans nommer la base est parfaitement légitime.
 *
 * Le port est analysé ici. `Number.parseInt` sur une saisie invalide rend `NaN`, que `serde`
 * refuserait avec une erreur de désérialisation illisible ; `0` est envoyé à la place, et
 * PostgreSQL rend alors une erreur de connexion claire.
 */
export function draftToRequest(draft: ConnectionDraft): ConnectionRequest {
  const port = Number.parseInt(draft.port, 10)
  const bastionPort = draft.tunnel ? Number.parseInt(draft.tunnel.bastionPort, 10) : 0

  return {
    variant: {
      environment: draft.environment,
      host: draft.host,
      port: Number.isFinite(port) ? port : 0,
      defaultDatabase: draft.defaultDatabase,
      username: draft.username,
      // La variante ne porte **jamais** de mot de passe : `05a` n'y met qu'une `SecretRef`, et
      // aucune n'existe avant `08e`. Le secret voyage à côté.
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
            // Toujours `null` : le port local est **choisi par l'app** à l'ouverture, jamais
            // saisi. `06e` se lie au port 0 et rend celui que le système attribue.
            localPort: null,
          }
        : null,
    },
    password: draft.password === '' ? null : draft.password,
  }
}
