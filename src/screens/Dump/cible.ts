import type { DumpRequest } from '../../domain/dump'

/**
 * Ce que les deux modales de dump **nomment** : projet, base, environnement.
 *
 * Un type à part plutôt que la `DumpRequest` entière : la modale d'import nomme la cible
 * pour empêcher l'erreur de se tromper de base, et lui passer la variante complète — donc
 * l'hôte, l'utilisateur et la référence de secret — l'exposerait à afficher un jour ce
 * qu'on ne veut pas voir dans une capture d'écran.
 */
export type CibleDeDump = {
  projet: string
  base: string
  environnement: string
}

/** La cible, lue depuis la requête que le front enverra à Rust. */
export function cibleDe(request: DumpRequest): CibleDeDump {
  return {
    projet: request.key.project,
    base: request.key.database,
    environnement: request.key.environment,
  }
}
