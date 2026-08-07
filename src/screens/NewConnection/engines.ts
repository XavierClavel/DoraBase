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

/** Le seul moteur dont `06` a livré un adaptateur. Les autres sont sélectionnables. */
export const IMPLEMENTED_ENGINES: readonly Engine[] = ['postgresql']
