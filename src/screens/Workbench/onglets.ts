import type { DatabaseKey } from '../../domain/engine'

/**
 * Le modèle d'onglets de l'écran de travail, en fonctions **pures**.
 *
 * `TabStrip` (`03`) ne connaît que des `Tab` — identifiant, icône, libellé. Ce que `A5` ouvre
 * est une **table dans une base** : l'identité d'un onglet porte donc la `DatabaseKey` entière.
 * Deux bases peuvent avoir une table `public.orders` ; un identifiant réduit au nom les
 * confondrait, et l'utilisateur verrait le contenu de l'autre.
 *
 * Isolé du rendu pour la même raison qu'`arbre.ts` en `09d` : ces règles se testent sans DOM.
 */

/**
 * Une table ouverte dans un onglet.
 *
 * **`sorte` discrimine l'union, `kind` reste ce que le domaine appelle ainsi** — table ou vue, pour
 * l'icône de la bande. Deux champs voisins, et c'est délibéré : renommer `kind` le désaccorderait de
 * `TableSummary.kind`, qui vient des projections de `ts-rs` et n'est pas à nous.
 */
export type OngletTable = {
  sorte: 'table'
  key: DatabaseKey
  schema: string
  table: string
  /** Pilote l'icône de la bande — une vue n'est pas une table. */
  kind: 'table' | 'view'
}

/**
 * Une console SQL ouverte dans un onglet (`12a`).
 *
 * **Le numéro fait partie de l'identité**, et pas seulement du libellé : deux consoles sur la même
 * base sont deux consoles, contrairement à deux onglets sur la même table qui n'en font qu'un. On
 * ouvre une seconde console *parce qu'on veut* garder la première.
 */
export type OngletConsole = {
  sorte: 'console'
  key: DatabaseKey
  numero: number
  /**
   * La langue que la console parle (`13a`).
   *
   * **Un dialecte, et non une troisième forme d'onglet.** Ce qui change entre une console SQL et une
   * console mongo est la **grammaire** de l'éditeur et la forme du résultat — pas la nature de
   * l'onglet : il se ferme, se réordonne et garde son texte exactement pareil.
   *
   * Le dialecte suit le moteur de la base, il ne se choisit pas : une console mongo sur une base
   * PostgreSQL n'aurait rien à interroger.
   */
  dialecte: Dialecte
}

/** Les langues de console que le projet connaît. `19` (Redis) en ajoutera une troisième. */
export type Dialecte = 'sql' | 'mongo'

/**
 * Ce qu'un onglet de l'écran de travail peut être.
 *
 * **Une union, depuis `12a`.** L'onglet était « une table ouverte » ; `A7` en fait aussi une console,
 * dans la **même bande** — un second système d'onglets à côté du premier doublerait la navigation
 * pour un seul écran.
 */
export type Onglet = OngletTable | OngletConsole

/** L'identité d'un onglet, **dérivée de la base et de ce qu'il ouvre**. */
export function idOnglet(onglet: Onglet): string {
  const { project, database, environment } = onglet.key
  const coordonnees = `${project}/${database}/${environment}`
  return onglet.sorte === 'console'
    ? `${coordonnees}::console/${onglet.numero}`
    : `${coordonnees}::${onglet.schema}.${onglet.table}`
}

export type EtatOnglets = {
  onglets: readonly Onglet[]
  /** `null` quand il n'y a plus d'onglet — la bande reste, le centre revient à `A4`. */
  actif: string | null
}

export const AUCUN_ONGLET: EtatOnglets = { onglets: [], actif: null }

/**
 * Ouvre une table, ou **active l'onglet existant**.
 *
 * Deux onglets sur la même table donneraient deux états de filtres divergents pour une même
 * donnée. Aucun éditeur ne le fait par défaut, et le mockup ne montre pas de doublon.
 */
export function ouvrir(etat: EtatOnglets, onglet: OngletTable): EtatOnglets {
  const id = idOnglet(onglet)
  if (etat.onglets.some((existant) => idOnglet(existant) === id)) {
    return { onglets: etat.onglets, actif: id }
  }
  return { onglets: [...etat.onglets, onglet], actif: id }
}

/**
 * Ferme un onglet et active un voisin.
 *
 * **Fermer le dernier ne ferme pas l'écran.** Le mockup ne montre jamais zéro onglet ; le
 * minimum défendable est que la bande reste et que le centre revienne à la liste des objets.
 * Faire disparaître l'écran de travail sous les pieds de l'utilisateur serait hostile.
 */
export function fermer(etat: EtatOnglets, id: string): EtatOnglets {
  const index = etat.onglets.findIndex((onglet) => idOnglet(onglet) === id)
  if (index === -1) return etat

  const onglets = etat.onglets.filter((_, rang) => rang !== index)
  if (etat.actif !== id) return { onglets, actif: etat.actif }

  // Le voisin de droite, ou celui de gauche quand on ferme le dernier — l'ordre de tous les
  // éditeurs à onglets. Revenir au premier ferait sauter le regard à l'autre bout de la bande.
  const voisin = onglets[index] ?? onglets[index - 1]
  return { onglets, actif: voisin ? idOnglet(voisin) : null }
}

/**
 * Ouvre une **nouvelle** console sur une base, et l'active.
 *
 * **Elle ne réutilise jamais une console existante**, contrairement à `ouvrir` : deux onglets sur la
 * même table donneraient deux états de filtres divergents pour une même donnée, alors que deux
 * consoles sont deux brouillons — c'est le but.
 *
 * Le numéro est le plus petit disponible **sur cette base**, et non un compteur qui monte : après
 * avoir fermé « console 2 », la suivante reprend ce numéro plutôt que d'afficher « console 3 » à côté
 * d'une « console 1 » solitaire.
 */
export function ouvrirConsole(
  etat: EtatOnglets,
  key: DatabaseKey,
  dialecte: Dialecte = 'sql',
): EtatOnglets {
  const pris = new Set(
    etat.onglets
      .filter(
        (onglet): onglet is OngletConsole =>
          onglet.sorte === 'console' && memeBase(onglet.key, key),
      )
      .map((onglet) => onglet.numero),
  )
  let numero = 1
  while (pris.has(numero)) numero += 1

  const console: OngletConsole = { sorte: 'console', key, numero, dialecte }
  return { onglets: [...etat.onglets, console], actif: idOnglet(console) }
}

function memeBase(a: DatabaseKey, b: DatabaseKey): boolean {
  return a.project === b.project && a.database === b.database && a.environment === b.environment
}

export function reordonner(etat: EtatOnglets, ids: readonly string[]): EtatOnglets {
  const parId = new Map(etat.onglets.map((onglet) => [idOnglet(onglet), onglet]))
  const onglets = ids.map((id) => parId.get(id)).filter((onglet): onglet is Onglet => !!onglet)
  // Un réordonnancement qui perdrait un onglet en route est un bogue, pas une réorganisation :
  // mieux vaut garder l'ordre précédent que rendre une bande amputée.
  return onglets.length === etat.onglets.length ? { onglets, actif: etat.actif } : etat
}

export function ongletActif(etat: EtatOnglets): Onglet | null {
  return etat.onglets.find((onglet) => idOnglet(onglet) === etat.actif) ?? null
}

/**
 * Vrai quand un identifiant d'onglet appartient à la cible d'un retrait (`08j`).
 *
 * **Sur les coordonnées, pas sur le préfixe de la chaîne.** `idOnglet` compose
 * `projet/base/env::schema.table`, et un test de préfixe ferait de « Halle » un préfixe de
 * « Halles » — deux projets distincts dont l'un emporterait les onglets de l'autre.
 */
export function viseeParLId(
  cible: { kind: 'database' | 'project'; project: string; database?: string },
  id: string,
): boolean {
  // `??` plutôt qu'un `!` : `split` rend toujours au moins un élément, mais l'affirmer au
  // compilateur pour une ligne n'apprend rien à personne — la valeur par défaut est vraie.
  const [coordonnees = ''] = id.split('::')
  const [projet, base] = coordonnees.split('/')
  if (projet !== cible.project) return false
  return cible.kind === 'project' || base === cible.database
}
