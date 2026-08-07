import type { Environment, SslMode } from '../../domain/config'

/**
 * Les trois variantes d'environnement de `A2`.
 *
 * `prod` porte un habillage propre — fond rouge pâle, bordure 1.5 px, icône warning — que le
 * handoff décrit comme une propriété de **prod**, pas de « actif ». Le mockup ne montrant que
 * `prod` actif, l'état actif de `dev` et `staging` est l'accent générique de `RadioGroup`.
 * Question ouverte au § « À trancher » de `specs/README.md`.
 *
 * Comme `ENGINES`, typé `Record<Environment, …>` : ajouter un environnement en Rust casse la
 * compilation ici jusqu'à ce qu'il soit traité.
 */
export const ENVIRONMENTS: Record<Environment, { label: string; danger: boolean }> = {
  dev: { label: 'dev', danger: false },
  staging: { label: 'staging', danger: false },
  prod: { label: 'prod', danger: true },
}

export const ENVIRONMENT_ORDER: readonly Environment[] = ['dev', 'staging', 'prod']

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
