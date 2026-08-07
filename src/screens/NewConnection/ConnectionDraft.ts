import type { Engine, Environment, SslMode } from '../../domain/config'

/**
 * L'état saisi dans `A2`, avant tout enregistrement.
 *
 * **Distinct de `Database` et `EnvironmentVariant`** de `05a`, et pas par paresse : le
 * brouillon porte un mot de passe *en clair* là où la configuration porte une `SecretRef`,
 * son port est une chaîne (un champ de saisie peut être vide ou invalide, un `u16` non), et
 * il mêle des données de deux niveaux du modèle — la base et sa variante. Le convertir est le
 * travail de `08e`, qui pourra refuser ; ici on ne fait que saisir.
 */
export type ConnectionDraft = {
  engine: Engine
  /** Nom de la base, tel que `A4` l'affichera dans l'arbre. */
  name: string
  /** Identifiant du projet d'accueil. `A2` choisit parmi les projets existants (`08e`). */
  project: string
  environment: Environment
  host: string
  /** Chaîne et non nombre : un champ de saisie passe par des états qu'un `u16` interdit. */
  port: string
  defaultDatabase: string
  username: string
  /** En clair, le temps de la saisie. `08e` le range dans le magasin et n'en garde qu'une
   * référence — voir `specs/08e` § « Le mot de passe est un secret dès la saisie ». */
  password: string
  sslMode: SslMode
  readOnly: boolean
  reconnectOnStartup: boolean
}

/**
 * Le brouillon d'une connexion neuve.
 *
 * Les valeurs par défaut ne sont **pas** celles du mockup : celui-ci montre un formulaire
 * rempli (« analytics », « db-analytics.internal », « dora_ro »), qui est une illustration,
 * pas un état initial. Y coller ces valeurs mettrait une fausse connexion sous les yeux de
 * l'utilisateur à chaque ouverture.
 *
 * Ce qui est prérempli, en revanche, l'est parce que c'est vrai pour la quasi-totalité des
 * cas : `postgresql` est le seul moteur implémenté, `dev` est l'environnement le moins
 * risqué, `5432` est le port de PostgreSQL, et `prefer` est le mode SSL par défaut de `libpq`.
 * Ouvrir sur `prod` serait une invitation à l'accident.
 */
export function emptyDraft(): ConnectionDraft {
  return {
    engine: 'postgresql',
    name: '',
    project: '',
    environment: 'dev',
    host: '',
    port: '5432',
    defaultDatabase: '',
    username: '',
    password: '',
    sslMode: 'prefer',
    readOnly: true,
    reconnectOnStartup: false,
  }
}
