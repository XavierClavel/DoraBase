import type { IconName } from '../../design/icons/names'
import type { EnvironmentId, Project } from '../../domain/config'
import type { ConnectionState, SchemaInfo, TableSummary } from '../../domain/engine'
import { formatRowCount } from '../../ui/format'
import { COULEURS_D_ENVIRONNEMENT } from '../NewConnection/environments'

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
  /** Les schémas d'une connexion, par identité de nœud de connexion. */
  schemas: Readonly<Record<string, SchemaInfo[]>>
  /** Les objets d'un schéma, par identité de nœud de schéma. */
  objets: Readonly<Record<string, TableSummary[]>>
  /** Les dépliages en cours, par identité de nœud. */
  enCours: ReadonlySet<string>
  /** Les dépliages qui ont échoué, par identité de nœud. */
  echecs: Readonly<Record<string, string>>
}

export type NoeudKind =
  | 'project'
  | 'environment'
  | 'database'
  | 'console'
  | 'schema'
  | 'object'
  | 'message'

export type Noeud = {
  /** Identité stable, employée pour le dépliage, la sélection et la clé de rendu. */
  id: string
  kind: NoeudKind
  depth: 0 | 1 | 2 | 3 | 4
  label: string
  /** Chevron : absent pour une feuille, `closed` ou `open` pour un nœud dépliable. */
  chevron?: 'open' | 'closed'
  /**
   * Le glyphe de la ligne, **typé sur le sprite** et non sur `string`.
   *
   * Il valait `string`, et `ExplorerSidebar` le passait à `TreeRow` avec un `as never` pour forcer le
   * passage. Le compilateur ne pouvait donc rien dire — et il avait quelque chose à dire : les lignes
   * de schéma demandaient `'folder'`, un nom que le sprite ne porte pas (c'est `'schema'`), donc
   * elles n'affichaient **aucune** icône. Constaté à l'écran en ajoutant le palier d'environnement.
   */
  icon?: IconName
  iconColor?: string
  meta?: string
  metaVariant?: 'mono' | 'caps'
  /** Le badge `PROD` d'un environnement, ou l'état d'une connexion. */
  badge?: { text: string; tone: 'danger' | 'warn' | 'success' | 'muted' }
  /** Nom accessible complet, quand le libellé seul ne suffit pas. */
  announce?: string
  /** Une ligne de message — chargement, échec, vide — non sélectionnable. */
  message?: boolean
  /**
   * Le nombre de connexions que ce nœud représente : celles du projet, celles de l'environnement.
   * Sert à la confirmation de retrait de `08j`, qui compte ce qui part.
   */
  connexions?: number
  /** Les coordonnées, pour que l'écran sache quoi demander au dépliage. */
  project?: string
  database?: string
  environment?: EnvironmentId
  schema?: string
  /** Le nom de la console, pour un nœud `console` — distinct de `label`, qui peut être décoré. */
  console?: string
}

/** L'identité d'un nœud. Stable, et **dérivée du chemin** : deux nœuds homonymes de branches
 * différentes ne se confondent pas. */
export function idProjet(project: string): string {
  return `p:${project}`
}
/**
 * L'identité d'un environnement déclaré (`25a`).
 *
 * Le préfixe compte autant que le chemin : `enfantsDe` en dérive la profondeur des lignes de message,
 * et les cinq lettres — `p`, `e`, `d`, `s`, `o`, plus `c` pour les consoles — sont donc réservées.
 */
export function idEnvironnement(project: string, environment: EnvironmentId): string {
  return `e:${project}/${environment}`
}
/**
 * L'identité d'une connexion, **environnement compris** (`25a`).
 *
 * Il en était absent, et la justification était explicite : l'arbre ne montrait que les connexions de
 * l'environnement actif, donc deux connexions homonymes de deux environnements n'étaient jamais
 * listées ensemble. Le palier d'environnement annule cette prémisse. Sans l'identifiant dans la clé,
 * deux `analytics` — l'une en dev, l'autre en production — partageraient leur dépliage, leur
 * sélection, leur clé de rendu React, et surtout leur entrée dans `charge.schemas` : la structure d'un
 * serveur s'afficherait sous la ligne d'un autre.
 */
export function idBase(project: string, environment: EnvironmentId, database: string): string {
  return `d:${project}/${environment}/${database}`
}
export function idSchema(
  project: string,
  environment: EnvironmentId,
  database: string,
  schema: string,
): string {
  return `s:${project}/${environment}/${database}/${schema}`
}
export function idObjet(
  project: string,
  environment: EnvironmentId,
  database: string,
  schema: string,
  objet: string,
): string {
  return `o:${project}/${environment}/${database}/${schema}/${objet}`
}
export function idConsole(
  project: string,
  environment: EnvironmentId,
  database: string,
  console: string,
): string {
  return `c:${project}/${environment}/${database}/${console}`
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
  etats: (project: string, database: string, environment: EnvironmentId) => ConnectionState,
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
      // Un projet replié annonce son contenu : c'est ce que le mockup montre pour les voisins.
      //
      // **« n connexions » et non « n bases »** : depuis `23b` la connexion est l'unité — une base ne
      // porte plus de variantes. « n environnements » ne dirait pas si l'un d'eux contient quoi que
      // ce soit, et un projet à environnements vides mérite de le dire.
      meta: projetDeplie ? undefined : compteDeConnexions(projet.databases.length),
      metaVariant: 'caps',
      project: projet.name,
      // Combien de connexions déclarées : la confirmation de retrait (`08j`) les compte, et un menu
      // qui recalculerait ce nombre à partir des projets aurait besoin de la liste entière.
      connexions: projet.databases.length,
    })

    if (!projetDeplie) continue

    /*
     * **Les environnements déclarés du projet, tous, dans leur ordre déclaré** (`25a`).
     *
     * L'arbre ne montrait que les connexions de l'environnement *actif* du projet, et un sélecteur de
     * la barre de titre changeait lequel. Cela demandait de basculer un réglage global pour regarder
     * une connexion voisine, et faisait de l'environnement une propriété du projet là où `23b` en
     * avait fait une propriété de la connexion. C'est désormais un palier, et chaque environnement se
     * déplie indépendamment des autres.
     */
    for (const declaration of projet.environments) {
      const idE = idEnvironnement(projet.name, declaration.id)
      const environnementDeplie = deplies.has(idE)
      const connexions = projet.databases.filter((base) => base.environment === declaration.id)

      noeuds.push({
        id: idE,
        kind: 'environment',
        depth: 1,
        label: declaration.label,
        chevron: environnementDeplie ? 'open' : 'closed',
        // **Une icône teintée, pas un disque plein.** Le disque de 7 px du sélecteur y était la
        // vignette de valeur d'un champ ; ici, tous les paliers portent une icône de 13 px en tête de
        // ligne, et un disque casserait la colonne que l'indentation aligne. Il n'aurait de surcroît
        // que la couleur pour dire ce qu'il dit, ce que `09d` refuse pour ses états de connexion.
        //
        // **`pin` et non `srv`.** `srv` — deux baies empilées — disait mieux ce qu'est un
        // environnement, mais à 13 px il ne se distinguait pas du `db` de la connexion juste en
        // dessous : deux paliers voisins portaient le même glyphe à bandes horizontales, constaté à
        // l'écran. La goutte de `pin` n'a de voisin nulle part dans l'arbre, et « un lieu où vivent
        // des connexions » se lit sans légende. Une icône qui dit juste et qu'on confond n'apprend
        // rien.
        icon: 'pin',
        iconColor: COULEURS_D_ENVIRONNEMENT[declaration.color],
        meta: environnementDeplie ? undefined : compteDeConnexions(connexions.length),
        metaVariant: 'caps',
        // **Le drapeau, jamais le libellé** (`23g`) — et jamais la couleur déclarée non plus : un
        // environnement marqué production que l'utilisateur a coloré en vert porterait un badge vert,
        // et le badge d'alerte cesserait d'alerter. La couleur voyage par `iconColor`, le drapeau par
        // ce badge : deux canaux pour deux informations, plutôt qu'un pixel pour les deux.
        badge: declaration.production ? { text: 'PROD', tone: 'danger' } : undefined,
        project: projet.name,
        environment: declaration.id,
        connexions: connexions.length,
      })

      if (!environnementDeplie) continue

      // **Un environnement vide le dit** (`23g`) : un nœud déplié sans enfant se lit comme un
      // chargement en cours — le doute du défaut de `06d`. Ici rien ne charge, la liste vient de la
      // configuration, donc le vide est un fait et non une attente.
      if (connexions.length === 0) {
        noeuds.push(message(`${idE}:vide`, 2, `Aucune connexion déclarée en ${declaration.label}`))
        continue
      }

      for (const base of connexions) {
        const idB = idBase(projet.name, base.environment, base.name)
        const baseDepliee = deplies.has(idB)
        const etat = etats(projet.name, base.name, base.environment)

        noeuds.push({
          id: idB,
          kind: 'database',
          depth: 2,
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
          environment: base.environment,
        })

        if (!baseDepliee) continue

        /*
         * **Les consoles viennent avant les schémas, et sans chargement.**
         *
         * Elles sont déjà dans la configuration — aucun aller-retour vers le serveur ne les produit —
         * donc elles s'affichent dès le dépliage, y compris pendant que l'introspection travaille ou
         * après son échec. C'est voulu : une console est un texte qu'on a écrit, et le rendre
         * dépendant d'une connexion qui répond en ferait perdre l'accès au pire moment.
         *
         * En tête plutôt qu'en pied : ce sont les nœuds dont le nombre est connu et petit, là où les
         * schémas peuvent en aligner des dizaines. Les mettre après les aurait noyées.
         */
        for (const console of base.consoles) {
          noeuds.push({
            id: idConsole(projet.name, base.environment, base.name, console.name),
            kind: 'console',
            depth: 3,
            label: console.name,
            icon: 'term',
            iconColor: 'var(--ink-3)',
            project: projet.name,
            database: base.name,
            environment: base.environment,
            console: console.name,
          })
        }

        const enfants = enfantsDe(idB, charge, () =>
          (charge.schemas[idB] ?? []).flatMap((schema) =>
            noeudsDeSchema(projet.name, base.name, base.environment, schema, deplies, charge),
          ),
        )
        noeuds.push(...enfants)
      }
    }
  }

  return noeuds
}

function noeudsDeSchema(
  project: string,
  database: string,
  environment: EnvironmentId,
  schema: SchemaInfo,
  deplies: Deplies,
  charge: Charge,
): Noeud[] {
  const id = idSchema(project, environment, database, schema.name)
  const deplie = deplies.has(id)

  const tete: Noeud = {
    id,
    kind: 'schema',
    depth: 3,
    label: schema.name,
    chevron: deplie ? 'open' : 'closed',
    icon: 'schema',
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
        id: idObjet(project, environment, database, schema.name, objet.name),
        kind: 'object' as const,
        depth: 4 as const,
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
  // La profondeur du message se lit dans le **préfixe** de l'identité du parent : `d:` est une
  // connexion au palier 2, donc ses messages sont au palier 3 ; `s:` est un schéma au palier 3.
  const profondeur = (id.startsWith('d:') ? 3 : 4) as 3 | 4

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

function message(id: string, depth: 2 | 3 | 4, label: string): Noeud {
  return { id, kind: 'message', depth, label, message: true }
}

/** « 3 connexions », « 1 connexion », « 0 connexion » — le zéro prend le singulier, en français. */
function compteDeConnexions(compte: number): string {
  return `${compte} connexion${compte > 1 ? 's' : ''}`
}

/**
 * Le badge d'état d'une connexion.
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
