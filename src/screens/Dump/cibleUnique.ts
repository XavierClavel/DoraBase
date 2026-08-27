import type { ConnectionSettings, Project } from '../../domain/config'
import type { DumpRequest } from '../../domain/dump'

/**
 * La connexion sur laquelle `⇧⌘E` et `⇧⌘I` agissent, **quand elle est sans ambiguïté**.
 *
 * # Pourquoi ce détour
 *
 * Le menu natif ne dit pas *quelle* base exporter : un `MenuEvent` ne porte qu'un
 * identifiant d'item. La cible devrait venir de la sélection de l'arbre — mais rien ne la transmet
 * encore aux modales de dump, donc l'app n'a pas de « connexion courante » à leur donner.
 *
 * Plutôt que d'inventer une sélection, cette fonction ne rend une cible que lorsque la
 * configuration n'en laisse qu'une possible : un seul projet, une seule connexion. Dans tous
 * les autres cas elle rend `null`, et la modale **le dit** au lieu de choisir à la place de
 * l'utilisateur : exporter la mauvaise base serait sans conséquence, **importer** dans la
 * mauvaise en aurait.
 *
 * **Aucun filtre par environnement, et c'est un changement.** Une version précédente ne
 * gardait que les connexions de l'environnement actif du projet, parce que c'était le filtre
 * de l'arbre. `activeEnvironment` a depuis quitté le modèle : l'environnement est un nœud
 * dépliable de l'arbre, et ce qui en tient lieu — l'ensemble des nœuds dépliés — vit en
 * mémoire dans l'écran. Il n'y a donc plus rien à filtrer ici, et une connexion de plus dans
 * un autre environnement rend la cible ambiguë — ce qu'elle est réellement.
 *
 * À remplacer par la sélection de l'arbre dès qu'elle sera transmise.
 */
export type CibleResolue = {
  request: Omit<DumpRequest, 'file'>
  connection: ConnectionSettings
}

export function cibleUnique(projects: readonly Project[]): CibleResolue | null {
  // `noUncheckedIndexedAccess` : la longueur vérifiée ne rassure pas le compilateur, et
  // c'est tant mieux — un `!` ici serait une affirmation non vérifiée.
  const projet = projects.length === 1 ? projects[0] : undefined
  if (!projet) return null

  const base = projet.databases.length === 1 ? projet.databases[0] : undefined
  if (!base) return null

  return {
    request: {
      key: {
        project: projet.name,
        database: base.name,
        // Une connexion **appartient** à un environnement : c'est le sien qui l'identifie,
        // jamais un choix d'écran.
        environment: base.environment,
      },
      variant: base.connection,
      engine: base.engine,
    },
    connection: base.connection,
  }
}
