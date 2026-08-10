import type {
  Database,
  Engine,
  Environment,
  EnvironmentVariant,
  SslMode,
} from '../../domain/config'

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
  /**
   * Le nom saisi sous « + Nouveau projet… » (`08f`).
   *
   * Séparé de `project`, qui porte alors la sentinelle : les fusionner ferait du nom en cours de
   * frappe une valeur de `Select`, et le champ perdrait sa saisie à chaque rendu.
   */
  newProjectName: string
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
  /**
   * Le tunnel SSH, quand la connexion passe par un bastion. `null` sinon.
   *
   * **`null` et non un objet à champs vides** : `EnvironmentVariant.tunnel` de `05a` est
   * `Option<Tunnel>`, et `06b` refuse une variante déclarant un tunnel qu'on n'a pas ouvert.
   * Un objet vide se convertirait en `Some(Tunnel { host: "" })`, donc en tentative de
   * connexion vers un bastion sans nom. L'absence doit rester représentable.
   */
  tunnel: TunnelDraft | null
}

/**
 * Le panneau « Proxy / tunnel » de `A2`, tel qu'il est saisi.
 *
 * `kind` est absent : `05a` modélise `TunnelKind` en énumération d'un seul membre (`ssh`), et
 * le mockup ne montre que « SSH » dans son sélecteur. Le champ existe à l'écran — le mockup le
 * montre — mais sa valeur est constante, donc la garder ici serait un état qui ne varie pas.
 * `08e` la posera à la conversion. Le jour où un second type apparaît, il entrera ici.
 */
export type TunnelDraft = {
  bastionHost: string
  /** Chaîne, même raison que `port` : un champ de saisie passe par des états invalides. */
  bastionPort: string
  username: string
  privateKeyPath: string
  /**
   * Le port local **choisi par l'app**, pas saisi. `null` tant qu'aucun tunnel n'est ouvert.
   *
   * `A2` affiche « auto (63342) » : le nombre est le port réellement retenu, que
   * `SshTunnel::port_local` rend déjà (`06e`). Inventer un numéro avant l'ouverture serait un
   * mensonge, et « auto (0) » serait pire — d'où `null`, qui n'affiche que « auto ».
   */
  localPort: number | null
}

/** Un tunnel neuf : le port 22 est celui de SSH, le reste est à saisir. */
export function emptyTunnel(): TunnelDraft {
  return { bastionHost: '', bastionPort: '22', username: '', privateKeyPath: '', localPort: null }
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
    newProjectName: '',
    environment: 'dev',
    host: '',
    port: '5432',
    defaultDatabase: '',
    username: '',
    password: '',
    sslMode: 'prefer',
    readOnly: true,
    reconnectOnStartup: false,
    // Pas de tunnel par défaut : le panneau de `A2` s'ouvre replié et sans badge.
    tunnel: null,
  }
}

/**
 * Le brouillon d'une base **existante**, pour le mode édition de `08g`.
 *
 * Le mot de passe part **vide**, et ce n'est pas un oubli : la variante ne porte qu'une `SecretRef`,
 * jamais la valeur — le front ne l'a donc pas, et ne doit pas l'avoir. Un champ vide veut dire
 * « inchangé », ce que `update_variant` applique.
 */
export function draftDepuisLaVariante(
  project: string,
  database: Database,
  variant: EnvironmentVariant,
): ConnectionDraft {
  return {
    engine: database.engine,
    name: database.name,
    project,
    newProjectName: '',
    environment: variant.environment,
    host: variant.host,
    port: String(variant.port),
    defaultDatabase: variant.defaultDatabase,
    username: variant.username,
    password: '',
    sslMode: variant.sslMode,
    readOnly: variant.readOnly,
    reconnectOnStartup: variant.reconnectOnStartup,
    tunnel:
      variant.tunnel === null
        ? null
        : {
            bastionHost: variant.tunnel.bastionHost,
            bastionPort: String(variant.tunnel.bastionPort),
            username: variant.tunnel.username,
            privateKeyPath: variant.tunnel.privateKeyPath,
            // Le port local est **attribué à l'ouverture**, jamais saisi : `06e` le choisit libre
            // sur la machine. Le reprendre de la configuration afficherait un port d'une session
            // précédente, qui n'a plus cours.
            localPort: null,
          },
  }
}
