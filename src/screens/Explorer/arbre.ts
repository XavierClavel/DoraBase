import type { Environment, Project } from '../../domain/config'
import type { ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { formatRowCount } from '../../ui/format'

/**
 * L'aplatissement de l'arbre de `A4`, en fonction **pure**.
 *
 * `TreeRow` de `04` est purement présentationnelle : « elle ne connaît ni ses enfants, ni son
 * état d'ouverture, ni le modèle de données », et `04` a écarté toute récursion tant qu'aucun
 * écran n'en imposait la forme. `A4` l'impose : voici cette forme, isolée du rendu pour être
 * testable sans DOM.
 */

/** Ce qui est déplié, par identité de nœud. */
export type Deplies = ReadonlySet<string>

/** Les objets déjà chargés, par identité de nœud parent. */
export type Charge = {
  /** Les schémas d'une base, par clé de base. */
  schemas: Readonly<Record<string, SchemaInfo[]>>
  /** Les objets d'un schéma, par identité de nœud de schéma. */
  objets: Readonly<Record<string, TableSummary[]>>
  /** Les dépliages en cours, par identité de nœud. */
  enCours: ReadonlySet<string>
  /** Les dépliages qui ont échoué, par identité de nœud. */
  echecs: Readonly<Record<string, string>>
}

export type NoeudKind = 'project' | 'database' | 'schema' | 'object' | 'message'

export type Noeud = {
  /** Identité stable, employée pour le dépliage, la sélection et la clé de rendu. */
  id: string
  kind: NoeudKind
  depth: 0 | 1 | 2 | 3
  label: string
  /** Chevron : absent pour une feuille, `closed` ou `open` pour un nœud dépliable. */
  chevron?: 'open' | 'closed'
  icon?: string
  iconColor?: string
  meta?: string
  metaVariant?: 'mono' | 'caps'
  /** Le badge d'environnement d'un projet, ou l'état d'une base. */
  badge?: { text: string; tone: 'danger' | 'warn' | 'success' | 'muted' }
  /** Nom accessible complet, quand le libellé seul ne suffit pas. */
  announce?: string
  /** Une ligne de message — chargement, échec, vide — non sélectionnable. */
  message?: boolean
  /**
   * Le nombre de connexions que ce nœud représente : les bases d'un projet, les environnements
   * d'une base. Sert à la confirmation de retrait de `08j`, qui compte ce qui part.
   */
  connexions?: number
  /** Les coordonnées, pour que l'écran sache quoi demander au dépliage. */
  project?: string
  database?: string
  environment?: Environment
  schema?: string
}

/** L'identité d'un nœud. Stable, et **dérivée du chemin** : deux nœuds homonymes de branches
 * différentes ne se confondent pas. */
export function idProjet(project: string): string {
  return `p:${project}`
}
export function idBase(project: string, database: string): string {
  return `d:${project}/${database}`
}
export function idSchema(project: string, database: string, schema: string): string {
  return `s:${project}/${database}/${schema}`
}
export function idObjet(project: string, database: string, schema: string, objet: string): string {
  return `o:${project}/${database}/${schema}/${objet}`
}

/**
 * Aplatit les projets en une liste de nœuds, selon ce qui est déplié et chargé.
 *
 * **Le dépliage est paresseux** : un schéma replié ne produit aucun nœud enfant, donc l'écran
 * n'a rien à demander. C'est la contrainte transverse appliquée à l'arbre — demander tous les
 * objets de tous les schémas de toutes les bases au chargement serait exactement ce que `06c` a
 * découpé pour éviter.
 */
export function aplatir(
  projects: readonly Project[],
  deplies: Deplies,
  charge: Charge,
  etats: (project: string, database: string, environment: Environment) => ConnectionState,
): Noeud[] {
  const noeuds: Noeud[] = []

  for (const projet of projects) {
    const idP = idProjet(projet.name)
    const projetDeplie = deplies.has(idP)

    noeuds.push({
      id: idP,
      kind: 'project',
      depth: 0,
      label: projet.name,
      chevron: projetDeplie ? 'open' : 'closed',
      icon: 'bag',
      iconColor: 'var(--accent-deep)',
      badge: badgeEnvironnement(projet.activeEnvironment),
      // Un projet replié annonce son contenu : c'est ce que le mockup montre pour les voisins.
      meta: projetDeplie
        ? undefined
        : `${projet.databases.length} base${projet.databases.length > 1 ? 's' : ''}`,
      metaVariant: 'caps',
      project: projet.name,
      // Combien de connexions déclarées : la confirmation de retrait (`08j`) les compte, et un menu
      // qui recalculerait ce nombre à partir des projets aurait besoin de la liste entière.
      connexions: projet.databases.length,
    })

    if (!projetDeplie) continue

    for (const base of projet.databases) {
      const idB = idBase(projet.name, base.name)
      const baseDepliee = deplies.has(idB)
      const etat = etats(projet.name, base.name, projet.activeEnvironment)

      noeuds.push({
        id: idB,
        kind: 'database',
        depth: 1,
        label: base.name,
        chevron: baseDepliee ? 'open' : 'closed',
        icon: 'db',
        iconColor: `var(--engine-${abregeMoteur(base.engine)})`,
        badge: badgeEtat(etat),
        // L'état est **dans le nom accessible**, pas seulement dans une couleur : un point vert
        // et un point rouge sont indiscernables pour une part des utilisateurs.
        announce: `${base.name} · ${resumeEtat(etat)}`,
        project: projet.name,
        database: base.name,
        environment: projet.activeEnvironment,
        // Les environnements déclarés pour cette base : c'est ce que le retrait efface, et non la
        // seule variante courante.
        connexions: base.variants.length,
      })

      if (!baseDepliee) continue

      const enfants = enfantsDe(idB, charge, () =>
        (charge.schemas[idB] ?? []).flatMap((schema) =>
          noeudsDeSchema(projet.name, base.name, projet.activeEnvironment, schema, deplies, charge),
        ),
      )
      noeuds.push(...enfants)
    }
  }

  return noeuds
}

function noeudsDeSchema(
  project: string,
  database: string,
  environment: Environment,
  schema: SchemaInfo,
  deplies: Deplies,
  charge: Charge,
): Noeud[] {
  const id = idSchema(project, database, schema.name)
  const deplie = deplies.has(id)

  const tete: Noeud = {
    id,
    kind: 'schema',
    depth: 2,
    label: schema.name,
    chevron: deplie ? 'open' : 'closed',
    icon: 'folder',
    project,
    database,
    environment,
    schema: schema.name,
  }

  if (!deplie) return [tete]

  return [
    tete,
    ...enfantsDe(id, charge, () =>
      (charge.objets[id] ?? []).map((objet) => ({
        id: idObjet(project, database, schema.name, objet.name),
        kind: 'object' as const,
        depth: 3 as const,
        label: objet.name,
        icon: objet.kind === 'view' ? 'view' : 'table',
        iconColor: objet.kind === 'view' ? 'var(--violet)' : 'var(--success)',
        // `RowCount` distingue `estimated` de `exact` **au niveau du type** (`06c`) : le mockup
        // n'affiche qu'un nombre, mais l'information est là et `09f` en aura besoin pour ne pas
        // présenter une estimation comme un fait exact.
        meta: formatRowCount(objet.rows),
        metaVariant: 'mono' as const,
        project,
        database,
        environment,
        schema: schema.name,
      })),
    ),
  ]
}

/**
 * Les enfants d'un nœud déplié, ou la ligne de message qui en tient lieu.
 *
 * **Un dépliage qui échoue le dit sur sa ligne et ne vide pas l'arbre** : une erreur de réseau
 * sur un schéma ne doit pas faire disparaître les autres. D'où une ligne de message enfant,
 * plutôt qu'une bannière ou un état global.
 */
function enfantsDe(id: string, charge: Charge, contenu: () => Noeud[]): Noeud[] {
  const profondeur = (id.startsWith('d:') ? 2 : 3) as 2 | 3

  if (charge.echecs[id]) {
    return [message(`${id}:echec`, profondeur, charge.echecs[id] as string)]
  }
  if (charge.enCours.has(id)) {
    return [message(`${id}:chargement`, profondeur, 'Chargement…')]
  }

  const enfants = contenu()
  // Vide **chargé** n'est pas vide **non chargé** : un schéma sans table est un état normal, et
  // ne rien afficher laisserait croire que le dépliage n'a pas abouti.
  return enfants.length > 0 ? enfants : [message(`${id}:vide`, profondeur, 'Aucun objet')]
}

function message(id: string, depth: 2 | 3, label: string): Noeud {
  return { id, kind: 'message', depth, label, message: true }
}

function badgeEnvironnement(environment: Environment): Noeud['badge'] {
  if (environment === 'prod') return { text: 'PROD', tone: 'danger' }
  if (environment === 'staging') return { text: 'STAGING', tone: 'warn' }
  return { text: 'DEV', tone: 'muted' }
}

/**
 * Le badge d'état d'une base.
 *
 * `never` n'a **aucun badge** : une base qu'on n'a pas ouverte n'est pas dans un état
 * remarquable, et lui coller une marque la ferait paraître en défaut.
 */
function badgeEtat(etat: ConnectionState): Noeud['badge'] {
  switch (etat.kind) {
    case 'never':
      return undefined
    case 'connecting':
      return { text: '…', tone: 'warn' }
    case 'connected':
      return { text: 'OK', tone: 'success' }
    case 'offline':
      return { text: 'HORS LIGNE', tone: 'danger' }
  }
}

function resumeEtat(etat: ConnectionState): string {
  switch (etat.kind) {
    case 'never':
      return 'non connectée'
    case 'connecting':
      return 'connexion en cours'
    case 'connected':
      return 'connectée'
    case 'offline':
      return `hors ligne : ${etat.reason}`
  }
}

/** L'abrégé de moteur employé par les jetons de couleur (`--engine-pg`, `--engine-my`, …). */
function abregeMoteur(engine: string): string {
  const abreges: Record<string, string> = {
    postgresql: 'pg',
    mysql: 'my',
    sqlite: 'sq',
    mongodb: 'mg',
    redis: 'rd',
    snowflake: 'sf',
    bigquery: 'bq',
  }
  return abreges[engine] ?? 'pg'
}
