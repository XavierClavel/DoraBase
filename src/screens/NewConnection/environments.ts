import type { EnvironmentColor, EnvironmentDeclaration, SslMode } from '../../domain/config'

/**
 * La couleur d'un environnement, en jeton de la palette.
 *
 * **Ce fichier portait le trio `dev` / `staging` / `prod` en dur**, typé `Record<EnvironmentId, …>`
 * pour qu'ajouter un environnement en Rust casse la compilation ici. C'était juste tant que les
 * environnements étaient une énumération ; depuis `23a`, chaque projet déclare les siens, et une table
 * en dur serait une seconde source — celle qu'on oublie de corriger. Ne reste donc que la traduction
 * d'une couleur déclarée en jeton, qui n'appartient à aucun projet.
 */
export const COULEURS_D_ENVIRONNEMENT: Record<EnvironmentColor, string> = {
  green: 'var(--success)',
  amber: 'var(--warn)',
  red: 'var(--danger)',
  slate: 'var(--ink-4)',
  violet: 'var(--violet)',
}

/**
 * L'habillage d'alerte suit le **drapeau de production**, jamais le libellé.
 *
 * Un environnement nommé « live » et marqué production porte le fond rouge pâle et l'icône
 * d'avertissement que le handoff décrivait pour `prod` ; un environnement nommé « prod » que
 * l'utilisateur n'a pas marqué ne les porte pas. Accrocher une garantie à une chaîne de caractères la
 * rendrait fausse au premier renommage.
 */
export function estSensible(declaration: EnvironmentDeclaration): boolean {
  return declaration.production
}

/**
 * Le trio d'un projet neuf, **côté écran**.
 *
 * Le même que `EnvironmentDeclaration::trio_par_defaut` en Rust, et c'est une duplication assumée : un
 * projet qui n'existe pas encore n'a pas d'environnements à proposer, et `A2` doit tout de même
 * afficher ce qu'il recevra (`23d`). L'aller-retour par une commande IPC pour lire trois constantes
 * serait un appel réseau pour une valeur figée.
 *
 * **Ce n'est pas la source de vérité** : dès que le projet existe, ce sont ses déclarations qui
 * s'affichent. Si les deux divergeaient, l'écran montrerait trois environnements et le disque en
 * porterait d'autres — un test de `23d` compare donc les deux listes.
 */
export const TRIO_PAR_DEFAUT: readonly EnvironmentDeclaration[] = [
  { id: 'dev', label: 'dev', color: 'green', production: false },
  { id: 'staging', label: 'staging', color: 'amber', production: false },
  { id: 'prod', label: 'prod', color: 'red', production: true },
]

/**
 * Les six modes SSL, dans l'ordre croissant d'exigence de `libpq` — celui du type Rust.
 *
 * Les deux derniers vérifient l'identité du serveur ; les autres non. La distinction n'est
 * pas cosmétique : `06b` emploie encore `NoTls`, donc ces deux modes ne vérifient rien
 * aujourd'hui, et `08d` doit le **dire** dans le résultat du test de connexion.
 */
export const SSL_MODES: Record<SslMode, { label: string; verifies: boolean }> = {
  disable: { label: 'disable', verifies: false },
  allow: { label: 'allow', verifies: false },
  prefer: { label: 'prefer', verifies: false },
  require: { label: 'require', verifies: false },
  'verify-ca': { label: 'verify-ca', verifies: true },
  'verify-full': { label: 'verify-full', verifies: true },
}

export const SSL_MODE_ORDER: readonly SslMode[] = [
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
]

/**
 * Vrai quand ce mode **authentifie** le serveur (`06f`).
 *
 * `verify-ca` et `verify-full` sont les deux seuls : `require` chiffre sans authentifier, donc il
 * n'empêche pas un intermédiaire — « l'erreur classique » que `06b` désignait. C'est ce qui décide de
 * l'affichage du champ « certificat d'autorité », comme de la mention « TLS non vérifié ».
 *
 * **Lit `verifies`, qui existait déjà** : une première version réécrivait la liste des deux modes, ce
 * qui aurait divergé de la table au premier mode ajouté. La table est la source.
 */
export function authentifie(mode: SslMode): boolean {
  return SSL_MODES[mode].verifies
}
