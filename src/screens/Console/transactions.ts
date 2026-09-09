import type { Engine } from '../../domain/config'

/**
 * Les moteurs qui savent tenir une **transaction manuelle** de console (`API-38`).
 *
 * **Typé `Record<Engine, …>` pour la raison d'`ENGINES`** : un huitième moteur déclaré en Rust fait
 * échouer la compilation ici, et le compilateur pose la question à notre place — « celui-là, sait-il
 * retenir ce qu'une console écrit ? ».
 *
 * **Et le côté Rust refuse**, plutôt que d'exécuter hors transaction ce que l'écran annonce comme
 * retenu : c'est le montage des modes SSL (`SSL_MODES_PAR_MOTEUR`), et pour la même raison — l'écran
 * qui n'offre pas et le moteur qui refuse gardent deux chemins différents. Ici le second compte
 * autant : une écriture définitive présentée comme en attente est le pire défaut que cette fonction
 * puisse avoir.
 *
 * Ce que chaque « non » coûte, pour qu'on ne le « corrige » pas :
 *
 * - **MongoDB** sait ouvrir une transaction — la grille en ouvre une dès qu'elle porte plus d'une
 *   écriture. Ce qui manque, c'est ce qu'elle contiendrait : la console mongo ne fait que **lire**,
 *   ses quatre commandes étant `find`, `aggregate`, `countDocuments` et `distinct` ;
 * - **BigQuery** exécute chaque requête comme un **job** indépendant : rien de ce qu'un job ouvre ne
 *   survit au suivant. Ses transactions s'écrivent dans un script, donc en une seule requête ;
 * - **Redis et Snowflake** n'ont pas d'adaptateur : leur connexion est refusée bien avant qu'une
 *   console s'ouvre (voir `raison_du_refus` côté Rust). Le « non » y est un fait, pas un jugement.
 */
export const TRANSACTIONS_MANUELLES_PAR_MOTEUR: Record<Engine, boolean> = {
  postgresql: true,
  mysql: true,
  sqlite: true,
  mongodb: false,
  bigquery: false,
  redis: false,
  snowflake: false,
}

/** Vrai quand une console de ce moteur peut retenir ses écritures dans une transaction. */
export function tientUneTransaction(engine: Engine | undefined): boolean {
  return engine === undefined ? false : TRANSACTIONS_MANUELLES_PAR_MOTEUR[engine]
}

/**
 * La clé i18n de la raison, pour un moteur qui ne tient pas de transaction manuelle.
 *
 * **Une raison par moteur, et non une phrase générique** : les quatre « non » ne se ressemblent pas,
 * et le message que l'infobulle porte est ce qui distingue un « pas encore » d'une impossibilité —
 * la distinction que les cinq verdicts du dump tiennent déjà. `null` pour ceux qui en tiennent une,
 * parce qu'il n'y a alors rien à expliquer.
 */
export function raisonSansTransaction(engine: Engine | undefined): string | null {
  if (engine === undefined || TRANSACTIONS_MANUELLES_PAR_MOTEUR[engine]) return null
  return `console.transaction.raisons.${engine}`
}
