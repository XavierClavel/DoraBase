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

/**
 * Le port d'écoute par défaut de chaque moteur.
 *
 * **Typé `Record<Engine, …>` pour la même raison que `ENGINES`** : un moteur ajouté en Rust fait
 * refuser ce fichier tant que sa valeur n'est pas écrite, et le compilateur pose la question à notre
 * place — « celui-là, sur quel port écoute-t-il ? »
 *
 * `null` veut dire **« ce moteur n'a pas de port »**, et non « on ne sait pas » : SQLite s'ouvre depuis
 * un fichier (`FILE_ENGINES`), Snowflake et BigQuery depuis une URL de service. Préremplir 443 pour
 * ces deux-là afficherait un port que personne ne saisit et que rien ne lit.
 *
 * Une chaîne et non un nombre : c'est la valeur d'un champ de saisie, et le brouillon garde le port en
 * texte jusqu'à sa conversion par `draftToRequest`.
 */
export const PORT_PAR_DEFAUT: Record<Engine, string | null> = {
  postgresql: '5432',
  mysql: '3306',
  sqlite: null,
  mongodb: '27017',
  redis: '6379',
  snowflake: null,
  bigquery: null,
}

/**
 * Le port à afficher après un changement de moteur.
 *
 * **Une valeur saisie à la main survit au changement, le défaut de l'autre moteur non.** Remplacer
 * systématiquement jetterait le port d'un serveur qui n'écoute pas sur le port usuel — la raison même
 * pour laquelle le champ est saisissable. Ne jamais remplacer laisserait `5432` devant une connexion
 * MySQL, ce qui échoue à l'ouverture sans dire pourquoi.
 *
 * Le partage se fait sur un seul critère : le port affiché **est-il encore celui du moteur qu'on
 * quitte** ? Si oui, personne ne l'a choisi, et il suit. Un champ vide suit aussi — c'est ce que laisse
 * un passage par SQLite.
 */
export function portSuivant(precedent: Engine, portAffiche: string, suivant: Engine): string {
  const saisiALaMain = portAffiche !== '' && portAffiche !== PORT_PAR_DEFAUT[precedent]
  return saisiALaMain ? portAffiche : (PORT_PAR_DEFAUT[suivant] ?? '')
}
