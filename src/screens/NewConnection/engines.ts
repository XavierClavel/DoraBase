import type { Engine } from '../../domain/config'

/**
 * Le sélecteur de moteur de `A2` : libellé, monogramme, couleur.
 *
 * **Typé `Record<Engine, …>` volontairement.** Le jour où `05a` ajoute un moteur en Rust,
 * `ts-rs` régénère l'union `Engine` et **TypeScript refuse de compiler** ce fichier tant
 * qu'il n'est pas complété. C'est plus fort qu'un test d'exécution, qui ne pourrait que
 * comparer deux listes recopiées : la contrainte est portée par le type, donc impossible à
 * oublier. Vérifié par sabotage — voir le commit.
 *
 * **Snowflake et BigQuery n'ont pas de monogramme.** Les cinq premiers en ont un, coloré ;
 * les deux derniers portent leur seul libellé. Relevé sur le mockup, où le `<span>` du
 * monogramme est absent de ces deux boutons — ce n'est pas un oubli à combler.
 */
export const ENGINES: Record<Engine, { label: string; monogram?: string; color?: string }> = {
  postgresql: { label: 'PostgreSQL', monogram: 'Pg', color: 'var(--engine-pg)' },
  mysql: { label: 'MySQL', monogram: 'My', color: 'var(--engine-my)' },
  sqlite: { label: 'SQLite', monogram: 'Sq', color: 'var(--engine-sq)' },
  mongodb: { label: 'MongoDB', monogram: 'Mg', color: 'var(--engine-mg)' },
  redis: { label: 'Redis', monogram: 'Rd', color: 'var(--engine-rd)' },
  snowflake: { label: 'Snowflake' },
  bigquery: { label: 'BigQuery' },
}

/**
 * L'ordre du handoff, qui n'est pas alphabétique et n'est pas celui du type Rust : il va du
 * plus au moins courant. Le figer ici plutôt que de dépendre de l'ordre des clés d'un objet
 * — que rien ne garantit à la lecture d'un fichier généré.
 */
export const ENGINE_ORDER: readonly Engine[] = [
  'postgresql',
  'mysql',
  'sqlite',
  'mongodb',
  'redis',
  'snowflake',
  'bigquery',
]

/**
 * Les moteurs dont un adaptateur existe. Les autres restent **sélectionnables et le disent**.
 *
 * PostgreSQL (`06`), MongoDB (`18`), SQLite (`17`), MySQL (`16`). Les trois restants sont refusés par
 * le moteur avec une raison qui nomme ce qui manque — voir `raison_du_refus` côté Rust : Redis
 * n'entre pas dans le contrat (`19a`), Snowflake et BigQuery n'ont aucun décor de test (`20`, `21`).
 */
export const IMPLEMENTED_ENGINES: readonly Engine[] = ['postgresql', 'mongodb', 'sqlite', 'mysql']

/**
 * Les moteurs **sans serveur** : ni hôte, ni port, ni utilisateur, ni mot de passe, ni TLS.
 *
 * SQLite est le seul (`17a`). Son chemin de fichier vit dans `defaultDatabase` — le champ est déjà
 * « la base à ouvrir », et pour SQLite la base *est* un fichier. Afficher un port à qui n'en a pas
 * ferait remplir cinq champs pour rien, et laisserait croire qu'ils comptent.
 */
export const FILE_ENGINES: readonly Engine[] = ['sqlite']

/** Vrai quand ce moteur s'ouvre depuis un fichier plutôt que depuis un hôte. */
export function estUnFichier(engine: Engine): boolean {
  return FILE_ENGINES.includes(engine)
}
