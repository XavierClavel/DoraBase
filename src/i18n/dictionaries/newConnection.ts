import type { Dictionnaire } from '../types'

// Rempli par l'écran « newConnection ». Voir dictionaries/index.ts pour l'assemblage.
export const newConnectionFr: Dictionnaire = {
  title: {
    new: 'Nouvelle connexion',
    edit: (p) => `Modifier ${p.name}`,
  },
  failure: {
    title: 'Connexion impossible',
    close: 'Fermer',
    sqlstate: 'sqlstate',
    tunnelLine: 'tunnel · pg connect skipped',
  },
  engine: {
    title: 'Moteur',
  },
  form: {
    reasons: {
      portCloudSql:
        "Le port est choisi par l'application à l'ouverture du proxy Cloud SQL, et lu sur ce que le proxy annonce. Une valeur saisie ici ne serait pas employée.",
      passwordCloudSql:
        "L'authentification est celle de Cloud SQL IAM : le proxy présente un jeton à la place d'un mot de passe. L'utilisateur est un principal IAM — une adresse.",
      lock: 'Ces champs identifient la connexion : les changer déplacerait son mot de passe et fermerait sa connexion.',
      lockName:
        'Le nom identifie la connexion. Pour le changer : menu « … » de sa ligne dans l’arbre, puis « Renommer… ».',
    },
    nameLabel: 'Nom de la base',
    environmentLabel: 'Environnement',
    hostLabel: 'Hôte',
    portLabel: 'Port',
    defaultDatabaseLabel: {
      file: 'Fichier de la base',
      server: 'Base par défaut',
      project: 'ID de projet GCP',
    },
    filePlaceholder: '~/bases/atelier.db',
    projectPlaceholder: 'mon-projet-gcp',
    usernameLabel: 'Utilisateur',
    passwordLabel: 'Mot de passe',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    keychainBadge: 'Trousseau',
    authDatabaseLabel: 'Base d’authentification',
    authDatabasePlaceholder: 'vide : la base par défaut — « admin » pour un utilisateur racine',
    caCertificateLabel: 'Certificat d’autorité',
    caCertificatePlaceholder: '~/certs/interne.pem — vide : autorités publiques',
    sslModeLabel: 'Mode SSL',
    readOnlyLabel: 'Ouvrir en lecture seule',
    reconnectLabel: 'Se reconnecter au démarrage',
    labelLabel: 'Libellé',
    labelPlaceholder: 'vide : le nom de la base',
  },
  tunnel: {
    panelTitle: 'Proxy / tunnel',
    typeLabel: 'Type',
    types: { ssh: 'SSH', cloudSql: 'Cloud SQL' },
    badges: { ssh: 'SSH activé', cloudSql: 'Cloud SQL activé' },
    bastionHostLabel: 'Hôte du bastion',
    portLabel: 'Port',
    usernameLabel: 'Utilisateur',
    instanceLabel: 'Instance',
    instancePlaceholder: 'projet:région:instance',
    privateKeyLabel: 'Clé privée',
    browse: 'Parcourir…',
    cloudSqlAuthPrefix:
      "Authentification IAM, par les identifiants par défaut de l'application — installés par",
    cloudSqlAuthSuffix:
      ". L'utilisateur est un principal IAM (une adresse) ; le mot de passe n'est pas utilisé.",
  },
  footer: {
    testButton: {
      testing: 'Test en cours…',
      retry: 'Retester',
      idle: 'Tester la connexion',
    },
    connected: (p) => `Connecté en ${p.latencyMs} ms · ${p.serverVersion}`,
    tunnelPort: (p) => ` · tunnel :${p.port}`,
    tlsUnverified: ' · TLS non vérifié',
    unsupported: (p) => `${p.engine} n’a pas encore d’adaptateur`,
    cancel: 'Annuler',
    later: 'Plus tard',
    saveEdit: 'Enregistrer les modifications',
    saveNew: 'Enregistrer & ouvrir',
    projectCreatedPrefix: 'Le projet',
    projectCreatedSuffix:
      'est créé. Vous pouvez déclarer sa première connexion maintenant, ou plus tard depuis la sidebar.',
  },
  stepper: {
    project: 'PROJET',
    connection: 'CONNEXION',
  },
}

export const newConnectionEn: Dictionnaire = {
  title: {
    new: 'New connection',
    edit: (p) => `Edit ${p.name}`,
  },
  failure: {
    title: 'Connection failed',
    close: 'Close',
    sqlstate: 'sqlstate',
    tunnelLine: 'tunnel · pg connect skipped',
  },
  engine: {
    title: 'Engine',
  },
  form: {
    reasons: {
      portCloudSql:
        'The port is chosen by the application when it opens the Cloud SQL proxy, and read from what the proxy announces. A value entered here would not be used.',
      passwordCloudSql:
        'Authentication is Cloud SQL IAM: the proxy presents a token instead of a password. The user is an IAM principal — an email address.',
      lock: 'These fields identify the connection: changing them would move its password and close the open connection.',
      lockName:
        'The name identifies the connection. To change it: the “…” menu on its row in the tree, then “Rename…”.',
    },
    nameLabel: 'Database name',
    environmentLabel: 'Environment',
    hostLabel: 'Host',
    portLabel: 'Port',
    defaultDatabaseLabel: {
      file: 'Database file',
      server: 'Default database',
      project: 'GCP project ID',
    },
    filePlaceholder: '~/databases/workshop.db',
    projectPlaceholder: 'my-gcp-project',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    keychainBadge: 'Keychain',
    authDatabaseLabel: 'Authentication database',
    authDatabasePlaceholder: 'empty: the default database — “admin” for a root user',
    caCertificateLabel: 'CA certificate',
    caCertificatePlaceholder: '~/certs/internal.pem — empty: public certificate authorities',
    sslModeLabel: 'SSL mode',
    readOnlyLabel: 'Open read-only',
    reconnectLabel: 'Reconnect on startup',
    labelLabel: 'Label',
    labelPlaceholder: 'empty: the database name',
  },
  tunnel: {
    panelTitle: 'Proxy / tunnel',
    typeLabel: 'Type',
    types: { ssh: 'SSH', cloudSql: 'Cloud SQL' },
    badges: { ssh: 'SSH enabled', cloudSql: 'Cloud SQL enabled' },
    bastionHostLabel: 'Bastion host',
    portLabel: 'Port',
    usernameLabel: 'Username',
    instanceLabel: 'Instance',
    instancePlaceholder: 'project:region:instance',
    privateKeyLabel: 'Private key',
    browse: 'Browse…',
    cloudSqlAuthPrefix:
      'IAM authentication, via the application default credentials — installed by',
    cloudSqlAuthSuffix:
      '. The user is an IAM principal (an email address); the password is not used.',
  },
  footer: {
    testButton: {
      testing: 'Testing…',
      retry: 'Retest',
      idle: 'Test connection',
    },
    connected: (p) => `Connected in ${p.latencyMs} ms · ${p.serverVersion}`,
    tunnelPort: (p) => ` · tunnel :${p.port}`,
    tlsUnverified: ' · TLS unverified',
    unsupported: (p) => `${p.engine} has no adapter yet`,
    cancel: 'Cancel',
    later: 'Later',
    saveEdit: 'Save changes',
    saveNew: 'Save & open',
    projectCreatedPrefix: 'The project',
    projectCreatedSuffix:
      'has been created. You can declare its first connection now, or later from the sidebar.',
  },
  stepper: {
    project: 'PROJECT',
    connection: 'CONNECTION',
  },
}
