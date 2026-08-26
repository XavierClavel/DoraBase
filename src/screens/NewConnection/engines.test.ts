import { ENGINE_ORDER, PORT_PAR_DEFAUT, portSuivant } from './engines'

// **Le contrôle qu'un `Record<Engine, …>` ne fait pas.** Le type impose qu'une clé existe pour chaque
// moteur ; il n'impose pas que sa valeur soit vraie. Ces deux tests sont donc là pour les valeurs, et
// pour la seule règle qui les emploie.

test('chaque moteur porte un port, ou l’absence de port dite explicitement', () => {
  for (const engine of ENGINE_ORDER) {
    const port = PORT_PAR_DEFAUT[engine]
    // `null` est une réponse ; `undefined` serait une clé oubliée, et `''` une valeur qu'on ne
    // saurait pas distinguer d'un champ vidé par l'utilisateur.
    expect(port === null || /^\d+$/.test(port)).toBe(true)
  }
})

test('les trois moteurs sans port sont ceux qui ne se joignent pas par un hôte', () => {
  const sansPort = ENGINE_ORDER.filter((engine) => PORT_PAR_DEFAUT[engine] === null)
  // SQLite est un fichier ; Snowflake et BigQuery sont des services joints par URL. Aucun des trois
  // n'a de port à préremplir, et en inventer un afficherait une valeur que rien ne lit.
  expect(sansPort).toEqual(['sqlite', 'snowflake', 'bigquery'])
})

test('le port suit le moteur quand personne ne l’a choisi', () => {
  expect(portSuivant('postgresql', '5432', 'mysql')).toBe('3306')
  expect(portSuivant('mysql', '3306', 'mongodb')).toBe('27017')
})

test('un port saisi à la main survit au changement de moteur', () => {
  // La raison même pour laquelle le champ est saisissable : un serveur peut n'être pas sur le port
  // usuel, et le geste « changer de moteur » ne doit pas jeter cette information.
  expect(portSuivant('postgresql', '6543', 'mysql')).toBe('6543')
})

test('un champ vide suit le moteur, lui aussi', () => {
  // C'est ce que laisse un passage par SQLite, qui n'affiche pas de port : revenir à PostgreSQL doit
  // rendre 5432, pas un champ vide qu'il faudrait remplir de mémoire.
  expect(portSuivant('sqlite', '', 'postgresql')).toBe('5432')
})

test('aller vers un moteur sans port vide le champ', () => {
  expect(portSuivant('postgresql', '5432', 'sqlite')).toBe('')
})
