import type { KeyKind, Relation, RelationCardinality, TableDetail } from '../../domain/engine'
import { AVANCE_ENTETE, AVANCE_MONO } from '../../ui/VirtualGrid/ajustement'

/**
 * La disposition du diagramme de schéma — les boîtes, leurs colonnes, et les liens entre elles.
 *
 * # Pourquoi c'est un calcul, et pas une mesure
 *
 * C'est l'arbitrage d'`ajustement.ts`, appliqué à deux dimensions. Mesurer le rendu donnerait la
 * taille exacte d'une boîte, au prix d'un premier rendu à la mauvaise taille puis d'un
 * repositionnement de tout le graphe — donc d'un saut visible sur chaque table qui arrive. Surtout,
 * **la mesure est hors de portée de Vitest** : jsdom ne calcule aucune mise en page (règle n° 9), et
 * une disposition mesurée ne serait vérifiable nulle part.
 *
 * Les avances employées sont **celles d'`ajustement.ts`**, importées et non recopiées : les lignes
 * de colonne sont en JetBrains Mono à `--text-dense` et l'en-tête en Nunito 700 à `--text-label`,
 * exactement les deux tailles que ces constantes mesurent. Une seconde copie de la mesure aurait
 * vieilli à part.
 *
 * # Ce que ce module ne fait pas
 *
 * Il ne lit rien, ne traduit rien et ne rend rien. Il reçoit les structures déjà lues et rend des
 * coordonnées — c'est ce qui permet à `DiagramView` d'être une projection de ce résultat, et à
 * l'ensemble des règles de placement d'être testé sans DOM. Même partage qu'`arbre.ts` et
 * `onglets.ts` : le modèle d'un côté, le rendu de l'autre.
 */

/**
 * Ce qu'une table apporte au diagramme.
 *
 * **Dérivé de `TableDetail` par `Pick`**, jamais redéclaré : les quatre champs employés sont ceux du
 * domaine, et un `Pick` fait échouer la compilation le jour où l'un d'eux change de forme. Les
 * appelants passent leurs `TableDetail` tels quels ; les tests n'ont pas à fabriquer les huit autres
 * champs pour vérifier un placement.
 */
export type EntreeDeTable = Pick<TableDetail, 'schema' | 'name' | 'columns' | 'relations'>

/** Une ligne d'une boîte : une colonne, ou le résumé de celles qui ne tiennent pas. */
export type LigneDeBoite =
  | {
      sorte: 'colonne'
      /** Le centre vertical de la ligne, **relatif à la boîte** — l'ancre d'un lien. */
      y: number
      column: string
      typeName: string
      key: KeyKind | null
      nullable: boolean
      /** Vrai quand cette colonne est un bout d'au moins une clé étrangère du schéma. */
      relation: boolean
    }
  | { sorte: 'reste'; y: number; compte: number; texte: string }

/** Une table, placée. */
export type Boite = {
  /** `schema.table` — la même identité que celle qu'une relation emploie pour désigner sa cible. */
  id: string
  schema: string
  table: string
  x: number
  y: number
  width: number
  height: number
  lignes: readonly LigneDeBoite[]
  /**
   * Le rang de la colonne, de gauche à droite — dans le graphe, ou dans la grille des isolées.
   *
   * Utile aux tests, pas au rendu.
   */
  couche: number
  /**
   * Vrai quand aucun lien du schéma ne touche cette table.
   *
   * Elle est alors rangée dans la **grille**, sous le graphe, et non dans une colonne du flux — voir
   * la note qui l'explique dans `disposition`. Le champ existe pour que ce fait soit vérifiable
   * plutôt que déduit d'une position.
   */
  isolee: boolean
}

/** Un lien : la table qui référence, vers la table référencée. */
export type Lien = {
  /**
   * L'identité du lien : la boîte source et le nom de la contrainte.
   *
   * **Sans le nom de la contrainte, deux clés étrangères entre les mêmes deux tables se
   * confondraient** — un `created_by` et un `updated_by` vers `users`, cas courant. C'est aussi
   * cette identité qui déduplique les deux moitiés d'une même clé, vue en sortie chez l'une et en
   * entrée chez l'autre.
   */
  id: string
  source: string
  cible: string
  contrainte: string
  colonnes: readonly string[]
  colonnesCibles: readonly string[]
  /**
   * Combien de lignes de la source visent une même ligne de la cible — `'one'` ou `'many'`.
   *
   * **Elle vient du catalogue, jamais d'ici** : ce qui la décide est l'unicité des colonnes qui
   * référencent, et `ColumnInfo.key` ne connaît que `primary` et `foreign`. Voir
   * `RelationCardinality`, côté Rust, qui porte la raison.
   */
  cardinalite: RelationCardinality
  /** Le tracé, en attribut `d` d'un `<path>`. */
  chemin: string
  depart: { x: number; y: number }
  arrivee: { x: number; y: number }
  /**
   * Le **sens de parcours** du trait à chacun de ses deux bouts, en `+1` (vers la droite) ou `-1`.
   *
   * C'est ce que `orient="auto"` calculait pour un `marker` SVG, et il faut le dire nous-mêmes
   * depuis que les marques sont des `<path>` ordinaires — voir la raison dans `DiagramView`. Le
   * tracé étant orthogonal, un bout est toujours horizontal : deux valeurs suffisent, et aucune
   * rotation n'est à composer.
   *
   * Les trois cas de `tracerTout` les fixent : en avant `(+1, +1)`, en arrière `(-1, -1)`, et
   * réflexif `(+1, -1)` — on ressort à droite et l'on y revient, donc le second bout remonte le
   * courant.
   */
  sensDepart: -1 | 1
  sensArrivee: -1 | 1
}

export type Disposition = {
  boites: readonly Boite[]
  liens: readonly Lien[]
  largeur: number
  hauteur: number
  /**
   * Les clés étrangères dont l'autre bout n'est pas dans le diagramme — **comptées, jamais tues**.
   *
   * Un schéma n'est pas un monde clos : une table peut référencer une table d'un autre schéma, ou
   * une table que la lecture n'a pas encore atteinte. Ne pas tracer ces liens est la seule option
   * honnête — leur boîte n'existe pas —, mais les passer sous silence ferait lire le diagramme comme
   * complet. La barre d'état les dit.
   */
  liensExternes: number
}

export type OptionsDeDisposition = {
  /**
   * Toutes les colonnes, plutôt que les clés et un aperçu.
   *
   * **Une question qui n'a pas de bonne réponse par défaut**, d'où un réglage. Une table de
   * cinquante colonnes fait une boîte de neuf cents pixels : le diagramme cesse alors de montrer un
   * schéma pour montrer six tables. Mais une boîte tronquée ne dit pas tout ce qu'une table
   * contient, et c'est parfois exactement ce qu'on cherche. Le défaut montre les clés — ce dont un
   * diagramme parle — et le réglage ouvre le reste.
   */
  toutesLesColonnes?: boolean
  /**
   * Le libellé de la ligne de résumé, dont la **largeur compte**.
   *
   * Passé plutôt que composé ici : ce module ne traduit rien. Et il ne suffirait pas de le laisser à
   * l'appelant — la largeur de la boîte doit tenir ce texte, sinon la seule ligne dont la longueur
   * n'est pas bornée par un nom de colonne serait la seule à déborder.
   */
  libelleDuReste?: (compte: number) => string
}

/**
 * L'en-tête d'une boîte : le nom de la table.
 *
 * **Exportée, et le rendu la pose lui-même.** C'est ce qui garantit que la ligne dessinée tombe au
 * pixel où le calcul a ancré son lien : deux valeurs, l'une ici et l'autre dans la CSS, auraient
 * fait arriver les flèches à côté des lignes sans que rien ne le dise — et jsdom, qui ne calcule
 * aucune mise en page, n'aurait pas pu le voir (règle n° 9). C'est un test de bout en bout qui juge,
 * en comparant l'ancre d'un lien au centre réel de sa ligne.
 */
export const HAUTEUR_ENTETE = 24
/** Une ligne de colonne. `--text-dense` fait 11,5 px ; 18 laisse le trait respirer sans étirer. */
export const HAUTEUR_LIGNE = 18
/** Le filet du bas de la boîte, pour que la dernière ligne ne touche pas la bordure. */
const PIED_BOITE = 5
/*
 * Ce que la feuille de style consomme **hors texte**, sur une ligne et sur l'en-tête.
 *
 * # Pourquoi ces nombres et pas d'autres
 *
 * Ils sont la somme, terme à terme, de ce que `DiagramView.module.css` déclare — et non une marge
 * de confort. Une ligne : 2 × 6 px de `padding`, puis 9 px de glyphe de clé et les 5 px de `gap`
 * qui le suivent (une ligne **sans** clé porte exactement le même retrait, pour que les noms
 * s'alignent en colonne), puis 5 px de `gap` avant le type et 5 px de son `padding-left`. L'en-tête :
 * 2 × 6 px de `padding`, 11 px d'icône et 5 px de `gap`. La ligne de résumé n'a que son `padding`.
 *
 * # Comment ils ont été trouvés
 *
 * La première version en comptait 30 sur une ligne, choisis « comme une cellule de grille ». Le
 * rendu réel en demandait 36, et les six pixels manquants coupaient tous les `timestamptz` du décor
 * — visible **à l'œil sur une capture**, invisible à toute la suite de tests : jsdom ne calcule
 * aucune mise en page, et le calcul, lui, se croyait juste. C'est la méthode que ce dépôt dit la
 * plus payante — mesurer le rendu dans un navigateur plutôt que lire des valeurs déclarées — et un
 * test de bout en bout garde désormais le résultat, comme `ajustement.ts` a le sien.
 */
const CHROME_LIGNE = 36
const CHROME_ENTETE = 28
const CHROME_RESTE = 12
/** En dessous, un nom de table n'a plus la place de se lire. */
export const LARGEUR_BOITE_MIN = 136
/**
 * Le plafond d'une boîte — l'arbitrage du plafond de colonne d'`ajustement.ts`.
 *
 * Au-delà, un seul nom de type très long — un `character varying(255)[]` — pousserait tout le reste
 * du graphe hors de l'écran. Ce qui dépasse est coupé par l'ellipse.
 */
export const LARGEUR_BOITE_MAX = 268
/** L'écart vertical entre deux boîtes d'une même colonne. */
const ECART_VERTICAL = 22
/** L'écart horizontal entre deux colonnes de boîtes — la place où les liens se courbent. */
const ECART_HORIZONTAL = 86
/** La marge autour du graphe entier, pour qu'une boîte de bord ne colle pas au cadre. */
const MARGE_TOILE = 24
/**
 * Le nombre de colonnes montrées quand on ne les montre pas toutes.
 *
 * **Un plancher, pas un plafond** : les colonnes qui portent une clé sont toujours montrées, même
 * au-delà de ce compte. Sans cela un lien pourrait pointer une ligne masquée, et le diagramme
 * dessinerait une flèche vers un endroit qui ne dit pas pourquoi elle arrive là.
 */
const LIGNES_APERCU = 8
/**
 * Le rayon d'un angle de coude.
 *
 * Assez pour que l'angle se lise comme un virage et non comme un défaut de rendu, assez peu pour
 * qu'il reste un angle : c'est le rayon d'un contrôle du produit (`--radius-control`, 6 px) à un
 * cran au-dessus, le trait étant plus fin qu'une bordure.
 */
const RAYON_COUDE = 8
/**
 * L'écart entre deux couloirs voisins d'une même gouttière.
 *
 * Assez large pour que deux verticales ne se confondent pas au trait de 1,4 px, assez étroit pour
 * que la gouttière en tienne cinq — voir `COULOIRS_PAR_GOUTTIERE`.
 */
const ECART_COULOIR = 14
/**
 * Combien de couloirs tiennent entre deux colonnes de boîtes.
 *
 * **Dérivé de l'écart horizontal**, jamais posé à côté : élargir la gouttière doit en offrir
 * davantage sans qu'on y pense, et la rétrécir doit en retirer plutôt que de faire passer un trait
 * sous une boîte. Les 8 px réservés laissent le dernier couloir à distance de la boîte précédente.
 */
const COULOIRS_PAR_GOUTTIERE = Math.max(1, Math.floor((ECART_HORIZONTAL - 8) / ECART_COULOIR))
/** De combien un lien réflexif ressort à droite de sa boîte. */
const BOUCLE = 24
/**
 * Combien de colonnes la grille des tables isolées peut compter.
 *
 * Une grille à peu près carrée se parcourt du regard ; une bande de vingt colonnes se défile. Six
 * tient dans la largeur d'un centre d'écran sans que la grille dépasse le graphe qu'elle suit.
 */
const COLONNES_DE_GRILLE_MAX = 6
/** L'écart entre le graphe et la grille des isolées : de quoi lire deux bandes, pas une. */
const ECART_BANDES = ECART_VERTICAL * 2

/** L'identité d'une table dans le diagramme, et la façon dont une relation nomme sa cible. */
export function idDeTable(schema: string, table: string): string {
  return `${schema}.${table}`
}

/**
 * Un lien candidat, avant qu'on sache si ses deux bouts sont dans le diagramme.
 *
 * Les deux directions de `Relation` décrivent la **même** clé étrangère vue de ses deux bouts (voir
 * `RelationDirection` côté Rust) : une sortante chez `orders` et une entrante chez `users` sont un
 * seul lien. Les collecter toutes puis dédupliquer, plutôt que ne lire que les sortantes, fait
 * paraître le lien dès que **l'un** des deux bouts a été lu — ce qui compte, les structures arrivant
 * une par une.
 */
type Candidat = {
  id: string
  source: string
  cible: string
  contrainte: string
  colonnes: readonly string[]
  colonnesCibles: readonly string[]
  cardinalite: RelationCardinality
}

/**
 * Le lien que décrit une relation, quel que soit le sens sous lequel on la rencontre.
 *
 * `Relation.columns` est **toujours** celle de la table qui la déclare, et `targetColumns` celle de
 * l'autre : c'est la direction, et elle seule, qui dit laquelle des deux référence l'autre.
 */
function candidatDe(hote: EntreeDeTable, relation: Relation): Candidat {
  const cetteTable = idDeTable(hote.schema, hote.name)
  const autreTable = idDeTable(relation.targetSchema, relation.targetTable)
  const [source, cible] =
    relation.direction === 'outgoing' ? [cetteTable, autreTable] : [autreTable, cetteTable]
  const [colonnes, colonnesCibles] =
    relation.direction === 'outgoing'
      ? [relation.columns, relation.targetColumns]
      : [relation.targetColumns, relation.columns]
  return {
    id: `${source}::${relation.constraintName}`,
    source,
    cible,
    contrainte: relation.constraintName,
    colonnes,
    colonnesCibles,
    // **Elle ne dépend pas du sens sous lequel on rencontre la relation** : c'est une propriété de
    // la contrainte, et le catalogue la calcule toujours sur la table qui référence. Les deux
    // moitiés d'une même clé s'accordent donc, ce dont la déduplication ci-dessous dépend — elle
    // garde la première vue sans les comparer.
    cardinalite: relation.cardinality,
  }
}

/**
 * Les liens du diagramme, séparés en ceux qu'on peut tracer et ceux dont un bout manque.
 *
 * Isolé du placement parce que **la barre d'état a besoin des comptes sans avoir besoin de la
 * géométrie** : elle vit au niveau de l'écran, pas du centre (voir `DiagramStatusBar`), et lui faire
 * recalculer un placement entier pour afficher deux nombres aurait été payer la mise en page deux
 * fois par rendu.
 */
function liensDe(
  tables: readonly EntreeDeTable[],
  presentes: ReadonlyMap<string, EntreeDeTable>,
): { internes: readonly Candidat[]; liensExternes: number } {
  const candidats = new Map<string, Candidat>()
  for (const table of tables) {
    for (const relation of table.relations) {
      const candidat = candidatDe(table, relation)
      // Le premier vu gagne. Les deux moitiés d'une même clé décrivent le même lien : garder la
      // seconde ne changerait rien, et comparer les deux pour s'en assurer coûterait plus que la
      // confiance qu'on accorde déjà au catalogue.
      if (!candidats.has(candidat.id)) candidats.set(candidat.id, candidat)
    }
  }

  const internes: Candidat[] = []
  let liensExternes = 0
  for (const candidat of candidats.values()) {
    if (presentes.has(candidat.source) && presentes.has(candidat.cible)) internes.push(candidat)
    else liensExternes += 1
  }
  return { internes, liensExternes }
}

/**
 * Combien de clés étrangères le diagramme trace, et combien il ne peut pas tracer.
 *
 * Les mêmes règles que `disposition`, sans la géométrie : c'est ce que la barre d'état affiche.
 */
export function comptesDeLiens(tables: readonly EntreeDeTable[]): {
  liens: number
  liensExternes: number
} {
  const presentes = new Map(tables.map((table) => [idDeTable(table.schema, table.name), table]))
  const { internes, liensExternes } = liensDe(tables, presentes)
  return { liens: internes.length, liensExternes }
}

/**
 * Une étape d'un chemin entre deux tables : le lien franchi, et le sens dans lequel on le franchit.
 *
 * **Les deux sens ne se confondent pas.** Un lien en a un — la table qui référence vers la table
 * référencée — et un chemin en a un autre, celui de la lecture : « comment aller d'`order_items` à
 * `users` ». Deux tables qui référencent la même troisième sont reliées par un chemin dont une
 * étape **remonte** sa clé, et le taire ferait écrire la jointure à l'envers.
 */
export type Etape = {
  lien: Lien
  /** La table d'où part l'étape, dans l'ordre de lecture du chemin. */
  de: string
  /** La table où elle arrive. */
  vers: string
  /** Vrai quand l'étape **remonte** la clé : c'est `vers` qui référence `de`, et non l'inverse. */
  remonte: boolean
}

/**
 * Le plus court chemin de clés étrangères entre deux tables, ou `null` s'il n'y en a aucun.
 *
 * # Ce que la question veut dire
 *
 * « Qu'est-ce qui relie ces deux tables ? » est la question qu'on pose devant un schéma qu'on ne
 * connaît pas, et c'est aussi celle qu'on se pose avant d'écrire une jointure. Le diagramme
 * répondait déjà pour **une** table et ses voisines immédiates — c'est ce que la sélection éclaire —
 * mais il ne disait rien de deux tables qu'aucune clé ne relie *directement*, alors que c'est
 * précisément le cas où l'on ne sait pas répondre soi-même.
 *
 * # Non orienté, et c'est le point
 *
 * `orders` et `invoices` qui référencent toutes deux `users` sont bel et bien reliées, par un chemin
 * dont la seconde étape remonte une clé. Un parcours qui ne suivrait que le sens des flèches
 * n'aurait rien à dire de ce cas-là, qui est le plus courant des deux. Le sens de chaque clé n'est
 * pas perdu pour autant : `Etape.remonte` le porte, et c'est lui qui décide de la flèche affichée.
 *
 * # Le plus court, et un seul
 *
 * Un parcours en largeur, donc le chemin au moins de sauts : c'est le plus court à lire et la
 * jointure la plus courte à écrire. Il peut en exister plusieurs de même longueur ; celui qui sort
 * est décidé par l'ordre de `liens`, trié par identité (voir `tracerTout`), donc le même schéma rend
 * toujours le même chemin. En proposer plusieurs demanderait de les départager, et rien dans le
 * catalogue ne le permet.
 *
 * # Les clés réflexives ne demandent aucune garde
 *
 * Un `parent_id` mène d'une table à **elle-même**, donc à une table déjà vue : la marque du parcours
 * l'écarte sans qu'on ait à la nommer. Une garde explicite avait été écrite là ; le sabotage l'a
 * dénoncée — la retirer laissait la suite verte, et deux gardes qui se couvrent l'une l'autre ne se
 * dénoncent pas (la leçon du chargeur de structures).
 */
export function cheminEntre(
  liens: readonly Lien[],
  depuis: string,
  jusqua: string,
): readonly Etape[] | null {
  if (depuis === jusqua) return []

  const voisins = new Map<string, Lien[]>()
  const ajouter = (table: string, lien: Lien) => {
    voisins.set(table, [...(voisins.get(table) ?? []), lien])
  }
  for (const lien of liens) {
    ajouter(lien.source, lien)
    ajouter(lien.cible, lien)
  }

  /** L'étape par laquelle une table a été atteinte — de quoi remonter le chemin une fois arrivé. */
  const venuePar = new Map<string, Etape>()
  const vues = new Set([depuis])
  // **Une file, et c'est elle qui rend le chemin le plus court** : premier entré, premier sorti,
  // donc les tables à un saut avant celles à deux. Une pile rendrait le premier chemin trouvé, qui
  // n'est pas le plus court. Le curseur, lui, n'est qu'une économie — `shift()` recopie le tableau
  // à chaque tour.
  const file = [depuis]
  for (let rang = 0; rang < file.length; rang += 1) {
    const table = file[rang] as string
    for (const lien of voisins.get(table) ?? []) {
      const autre = lien.source === table ? lien.cible : lien.source
      if (vues.has(autre)) continue
      vues.add(autre)
      // `remonte` se lit du lien, pas du parcours : on remonte la clé quand la table d'où l'on part
      // est celle que le lien **vise**.
      venuePar.set(autre, { lien, de: table, vers: autre, remonte: lien.cible === table })
      if (autre === jusqua) return remonterLeChemin(venuePar, depuis, jusqua)
      file.push(autre)
    }
  }
  return null
}

/** Le chemin dans l'ordre de la lecture, reconstruit depuis son arrivée. */
function remonterLeChemin(
  venuePar: ReadonlyMap<string, Etape>,
  depuis: string,
  jusqua: string,
): readonly Etape[] {
  const etapes: Etape[] = []
  let table = jusqua
  while (table !== depuis) {
    const etape = venuePar.get(table)
    if (!etape) break
    etapes.unshift(etape)
    table = etape.de
  }
  return etapes
}

/**
 * Place les tables et trace leurs clés étrangères.
 *
 * L'ordre du résultat est **déterminé par les données**, jamais par celui des entrées : deux
 * lectures qui rendent les mêmes tables dans un ordre différent donnent le même dessin. C'est ce qui
 * fait qu'une table qui arrive ne réorganise que ce qu'elle change.
 */
export function disposition(
  tables: readonly EntreeDeTable[],
  options: OptionsDeDisposition = {},
): Disposition {
  const libelleDuReste = options.libelleDuReste ?? ((compte: number) => `+ ${compte}`)
  const presentes = new Map(tables.map((table) => [idDeTable(table.schema, table.name), table]))
  // Les liens d'abord : ils décident des colonnes à montrer *et* du placement des boîtes.
  const { internes, liensExternes } = liensDe(tables, presentes)

  /** Les colonnes qu'un lien touche, par table : elles ne se masquent jamais. */
  const ancrees = new Map<string, Set<string>>()
  const ancrer = (id: string, colonnes: readonly string[]) => {
    const deja = ancrees.get(id) ?? new Set<string>()
    for (const colonne of colonnes) deja.add(colonne)
    ancrees.set(id, deja)
  }
  for (const candidat of internes) {
    ancrer(candidat.source, candidat.colonnes)
    ancrer(candidat.cible, candidat.colonnesCibles)
  }

  /*
   * **Les tables qu'aucun lien ne touche sortent du flux** (3 septembre 2026, rapporté à l'usage).
   *
   * Elles étaient de profondeur 0 comme les autres, donc empilées dans la **première colonne** — et
   * sur un schéma réel, celle-ci en compte des dizaines : une colonne de six mille pixels de haut,
   * qui décidait à elle seule de la hauteur de la toile. Or une table sans aucun lien interne
   * n'appartient pas à un flux de références : c'est une **liste**, et une liste se lit en grille,
   * pas en colonne. Elles sont donc rangées à part, sous le graphe.
   *
   * Cas limite voulu : un schéma sans aucune clé étrangère devient une grille compacte, là où il
   * donnait une colonne interminable.
   */
  const touchees = new Set<string>()
  for (const candidat of internes) {
    touchees.add(candidat.source)
    touchees.add(candidat.cible)
  }
  const reliees = tables.filter((table) => touchees.has(idDeTable(table.schema, table.name)))
  const isolees = tables
    .filter((table) => !touchees.has(idDeTable(table.schema, table.name)))
    .sort((a, b) => a.name.localeCompare(b.name))

  const relieesParId = new Map(reliees.map((table) => [idDeTable(table.schema, table.name), table]))
  const ordre = ordonnerLesCouches(couchesDe(relieesParId, internes), internes, relieesParId)

  const mesurerLa = (table: EntreeDeTable, couche: number, isolee: boolean) =>
    mesurer(
      table,
      couche,
      isolee,
      ancrees.get(idDeTable(table.schema, table.name)) ?? new Set(),
      libelleDuReste,
      options,
    )

  // Les mesures d'abord, les positions ensuite : la largeur d'une colonne de boîtes est celle de sa
  // plus large, et on ne peut pas la connaître avant d'avoir mesuré toutes ses boîtes.
  const mesurees = ordre.map((couche, rang) => {
    const boites = couche.map((table) => mesurerLa(table, rang, false))
    return {
      boites,
      largeur: boites.reduce((large, boite) => Math.max(large, boite.width), LARGEUR_BOITE_MIN),
    }
  })

  /** Les voisines d'une boîte, dans les deux sens — un lien lie, il n'oriente pas le voisinage. */
  const voisinage = new Map<string, string[]>()
  for (const candidat of internes) {
    if (candidat.source === candidat.cible) continue
    voisinage.set(candidat.source, [...(voisinage.get(candidat.source) ?? []), candidat.cible])
    voisinage.set(candidat.cible, [...(voisinage.get(candidat.cible) ?? []), candidat.source])
  }

  /*
   * **Chaque table se pose en face de celles auxquelles elle est liée** — et non au centre de la
   * toile.
   *
   * La première version centrait chaque colonne sur la hauteur de la plus haute. C'était juste
   * quand les colonnes se ressemblaient, et faux dès qu'une seule les dépassait : sur un schéma
   * réel, une première colonne de cinquante tables plaçait les quatre tables de la dernière à
   * **trois mille pixels du haut**, seules au milieu d'un vide que rien ne remplissait. Rapporté par
   * l'usage, et c'est le défaut que ce passage corrige.
   *
   * L'ordonnée souhaitée d'une boîte est la moyenne des centres de ses voisines **déjà placées** ;
   * l'empilement la respecte quand il peut, et l'écarte du minimum quand deux boîtes se
   * chevaucheraient. C'est le pendant vertical du barycentre qui ordonne déjà les colonnes : là il
   * décide de l'ordre, ici de la position.
   */
  const boites: Boite[] = []
  const centres = new Map<string, number>()
  let x = MARGE_TOILE
  for (const couche of mesurees) {
    let bas: number | null = null
    for (const boite of couche.boites) {
      const places = (voisinage.get(boite.id) ?? [])
        .map((voisine) => centres.get(voisine))
        .filter((centre): centre is number => centre !== undefined)
      const souhait =
        places.length === 0
          ? null
          : places.reduce((somme, centre) => somme + centre, 0) / places.length
      const plancher = bas === null ? Number.NEGATIVE_INFINITY : bas + ECART_VERTICAL
      const haut =
        souhait === null
          ? bas === null
            ? 0
            : bas + ECART_VERTICAL
          : Math.max(souhait - boite.height / 2, plancher)
      const y = Math.round(Number.isFinite(haut) ? haut : 0)
      boites.push({ ...boite, x, y })
      centres.set(boite.id, y + boite.height / 2)
      bas = y + boite.height
    }
    x += couche.largeur + ECART_HORIZONTAL
  }

  /*
   * **La toile commence à sa marge, quelle que soit l'ordonnée que le placement a produite.**
   *
   * Une boîte peut se poser au-dessus de zéro — son souhait vient d'une voisine plus haute qu'elle
   * — et un dessin dont le coin haut-gauche serait négatif sortirait de sa zone défilante par le
   * haut, là où aucun défilement ne va.
   */
  const plusHaut = boites.reduce((haut, boite) => Math.min(haut, boite.y), 0)
  const decalage = MARGE_TOILE - plusHaut
  for (const [rang, boite] of boites.entries()) {
    boites[rang] = { ...boite, y: boite.y + decalage }
  }

  const basDuGraphe = boites.reduce((bas, boite) => Math.max(bas, boite.y + boite.height), 0)
  const droiteDuGraphe = boites.reduce(
    (droite, boite) => Math.max(droite, boite.x + boite.width),
    0,
  )

  /*
   * **La grille des tables isolées**, sous le graphe.
   *
   * Le nombre de colonnes est la racine du compte, plafonnée : une grille à peu près carrée se
   * parcourt du regard, une bande de vingt colonnes se défile. Les colonnes sont de largeur
   * **uniforme** — celle de la plus large — pour que les noms s'alignent : c'est une liste, et une
   * liste s'aligne.
   */
  const grille = mesurerLaGrille(isolees, mesurerLa)
  const hautDeLaGrille =
    boites.length === 0 ? MARGE_TOILE : basDuGraphe + (grille.boites.length > 0 ? ECART_BANDES : 0)
  for (const posee of grille.boites) {
    boites.push({ ...posee, y: posee.y + hautDeLaGrille })
  }

  const parId = new Map(boites.map((boite) => [boite.id, boite]))
  const liens = tracerTout(internes, parId)

  // La toile est ce que son contenu occupe, mesuré après coup : ni le graphe ni la grille ne
  // décident seuls de sa taille.
  const droite = Math.max(droiteDuGraphe, grille.largeur === 0 ? 0 : MARGE_TOILE + grille.largeur)
  const bas = boites.reduce((plusBas, boite) => Math.max(plusBas, boite.y + boite.height), 0)
  return {
    boites,
    liens,
    largeur: boites.length === 0 ? 0 : droite + MARGE_TOILE,
    hauteur: boites.length === 0 ? 0 : bas + MARGE_TOILE,
    liensExternes,
  }
}

/**
 * La grille des tables isolées, mesurée et placée **relativement à son propre coin haut-gauche**.
 *
 * Séparée du reste pour la raison qui vaut partout ici : la bande où elle se pose dépend de la
 * hauteur du graphe, qu'on ne connaît qu'après l'avoir placé. Elle rend donc des ordonnées à
 * décaler, et non des ordonnées finales.
 */
function mesurerLaGrille(
  isolees: readonly EntreeDeTable[],
  mesurerLa: (table: EntreeDeTable, couche: number, isolee: boolean) => Omit<Boite, 'x' | 'y'>,
): { boites: readonly Boite[]; largeur: number } {
  if (isolees.length === 0) return { boites: [], largeur: 0 }

  const colonnes = Math.min(COLONNES_DE_GRILLE_MAX, Math.ceil(Math.sqrt(isolees.length)))
  const mesurees = isolees.map((table, rang) => mesurerLa(table, rang % colonnes, true))
  const largeurDeColonne = mesurees.reduce(
    (large, boite) => Math.max(large, boite.width),
    LARGEUR_BOITE_MIN,
  )

  const boites: Boite[] = []
  let y = 0
  for (let debut = 0; debut < mesurees.length; debut += colonnes) {
    const rangee = mesurees.slice(debut, debut + colonnes)
    for (const [colonne, boite] of rangee.entries()) {
      boites.push({ ...boite, x: MARGE_TOILE + colonne * (largeurDeColonne + ECART_VERTICAL), y })
    }
    // **La rangée prend la hauteur de sa plus haute**, et non une hauteur uniforme : une table de
    // trois colonnes à côté d'une table de dix ne mérite pas sept lignes de vide.
    y += rangee.reduce((haute, boite) => Math.max(haute, boite.height), 0) + ECART_VERTICAL
  }
  return {
    boites,
    largeur: colonnes * (largeurDeColonne + ECART_VERTICAL) - ECART_VERTICAL,
  }
}

/**
 * Mesure une boîte : ses lignes, sa largeur, sa hauteur. Sans position — elle vient après.
 */
function mesurer(
  table: EntreeDeTable,
  couche: number,
  isolee: boolean,
  ancrees: ReadonlySet<string>,
  libelleDuReste: (compte: number) => string,
  options: OptionsDeDisposition,
): Omit<Boite, 'x' | 'y'> {
  const colonnes = [...table.columns].sort((a, b) => a.position - b.position)
  const retenues = options.toutesLesColonnes
    ? colonnes
    : (() => {
        // **Les colonnes qui portent une clé passent d'abord, et toutes.** C'est l'invariant qui
        // garantit qu'aucun lien ne pointe vers une ligne masquée ; `LIGNES_APERCU` ne borne que ce
        // qui s'ajoute par-dessus.
        const obligatoires = colonnes.filter(
          (colonne) => colonne.key !== null || ancrees.has(colonne.name),
        )
        const restantes = colonnes.filter((colonne) => !obligatoires.includes(colonne))
        const place = Math.max(0, LIGNES_APERCU - obligatoires.length)
        const complement = new Set(restantes.slice(0, place))
        return colonnes.filter(
          (colonne) => obligatoires.includes(colonne) || complement.has(colonne),
        )
      })()

  const masquees = colonnes.length - retenues.length
  const texteDuReste = masquees > 0 ? libelleDuReste(masquees) : ''

  const lignes: LigneDeBoite[] = retenues.map((colonne, rang) => ({
    sorte: 'colonne' as const,
    y: HAUTEUR_ENTETE + rang * HAUTEUR_LIGNE + HAUTEUR_LIGNE / 2,
    column: colonne.name,
    typeName: colonne.typeName,
    key: colonne.key,
    nullable: colonne.nullable,
    relation: ancrees.has(colonne.name),
  }))
  if (masquees > 0) {
    lignes.push({
      sorte: 'reste',
      y: HAUTEUR_ENTETE + retenues.length * HAUTEUR_LIGNE + HAUTEUR_LIGNE / 2,
      compte: masquees,
      texte: texteDuReste,
    })
  }

  const largeurDeLEntete = table.name.length * AVANCE_ENTETE + CHROME_ENTETE
  const largeurDesLignes = retenues.reduce(
    (large, colonne) =>
      Math.max(large, (colonne.name.length + colonne.typeName.length) * AVANCE_MONO + CHROME_LIGNE),
    // Le résumé est en Nunito à `--text-meta`, plus étroit que le mono : lui appliquer l'avance du
    // mono surestime sa largeur, donc élargit la boîte de quelques pixels de trop plutôt que de la
    // couper. C'est le bon sens de l'erreur pour la seule ligne dont le texte ne vient pas des
    // données.
    masquees > 0 ? texteDuReste.length * AVANCE_MONO + CHROME_RESTE : 0,
  )

  return {
    id: idDeTable(table.schema, table.name),
    schema: table.schema,
    table: table.name,
    width: Math.min(
      LARGEUR_BOITE_MAX,
      Math.max(LARGEUR_BOITE_MIN, Math.ceil(Math.max(largeurDeLEntete, largeurDesLignes))),
    ),
    height: HAUTEUR_ENTETE + lignes.length * HAUTEUR_LIGNE + PIED_BOITE,
    lignes,
    couche,
    isolee,
  }
}

/**
 * Les liens qui **ferment un cycle**, à écarter du calcul des couches.
 *
 * # Le défaut que ça corrige, et pourquoi il était énorme
 *
 * Le calcul des couches relâche `couche(cible) ≥ couche(source) + 1` sur tous les liens, borné au
 * nombre de tables. Sur un graphe **acyclique** il se stabilise de lui-même et rend le plus long
 * chemin. Sur un cycle il ne se stabilise **jamais** : chaque tour rehausse chaque table du cycle,
 * et la borne d'itérations devient la réponse au lieu d'un garde-fou.
 *
 * Le commentaire qui vivait ici affirmait le contraire — « un cycle plafonne simplement à la
 * longueur du chemin qu'il permet » — et c'est faux : il plafonne au **nombre de tables du
 * schéma**. Mesuré sur trente tables, une étoile banale plus **un seul** cycle de trois tables :
 * quatre-vingt-onze couches, une toile de 20 164 px de large, et les trois tables du cycle
 * abandonnées aux colonnes 88 à 90 pendant que tout le reste tenait dans les deux premières. C'est
 * le signalement mot pour mot — « des tables tout à droite, et des flèches extrêmement longues ».
 *
 * **Aucun décor ne l'avait vu** : le seul qui portait un cycle n'avait que deux tables, où la borne
 * ne peut pas faire de mal. Un décor trop petit ne mesure que le décor (règle n° 5).
 *
 * # Ce que fait ce passage
 *
 * C'est la première étape du dessin en couches, celle que les corrections précédentes avaient
 * sautée : rendre le graphe acyclique **avant** de le stratifier. Un parcours en profondeur classe
 * les liens, et celui qui pointe une table **encore sur la pile** ferme un cycle. Ces liens-là
 * sortent du calcul des couches — et de lui seul : ils restent des liens, tracés vers l'arrière, ce
 * que le tracé sait déjà faire.
 *
 * # Déterminisme
 *
 * Le parcours part des tables dans l'ordre de leur identité et suit leurs liens dans l'ordre de la
 * leur. Lequel des liens d'un cycle est déclaré « arrière » en dépend, donc c'est le même d'une
 * lecture à l'autre — sans quoi deux dessins des mêmes données différeraient.
 *
 * # Itératif, et non récursif
 *
 * Une chaîne de trois cents tables — le plafond du préchauffage — ferait trois cents appels
 * imbriqués. Une pile explicite n'a pas de limite à atteindre.
 */
function arcsArriere(
  presentes: ReadonlyMap<string, EntreeDeTable>,
  arcs: readonly Candidat[],
): ReadonlySet<string> {
  const sortants = new Map<string, Candidat[]>()
  for (const arc of arcs) {
    sortants.set(arc.source, [...(sortants.get(arc.source) ?? []), arc])
  }
  for (const liste of sortants.values()) liste.sort((a, b) => a.id.localeCompare(b.id))

  /** `1` = sur la pile du parcours, `2` = exploré. L'absence vaut « pas encore vue ». */
  const etat = new Map<string, 1 | 2>()
  const arriere = new Set<string>()

  for (const depart of [...presentes.keys()].sort((a, b) => a.localeCompare(b))) {
    if (etat.has(depart)) continue
    etat.set(depart, 1)
    const pile: { id: string; rang: number }[] = [{ id: depart, rang: 0 }]

    while (pile.length > 0) {
      const sommet = pile[pile.length - 1]
      if (sommet === undefined) break
      const liste = sortants.get(sommet.id) ?? []
      if (sommet.rang >= liste.length) {
        etat.set(sommet.id, 2)
        pile.pop()
        continue
      }
      const arc = liste[sommet.rang]
      sommet.rang += 1
      if (arc === undefined) continue

      const etatDeLaCible = etat.get(arc.cible)
      // **Encore sur la pile : ce lien referme le chemin qu'on parcourt.** C'est la définition d'un
      // arc arrière, et le seul cas où l'on en écarte un.
      if (etatDeLaCible === 1) {
        arriere.add(arc.id)
        continue
      }
      // Déjà explorée : le lien traverse le graphe sans le refermer, il reste une contrainte.
      if (etatDeLaCible === 2) continue

      etat.set(arc.cible, 1)
      pile.push({ id: arc.cible, rang: 0 })
    }
  }
  return arriere
}

/**
 * Répartit les tables en colonnes, de gauche à droite : **une table est à gauche de celles qu'elle
 * référence**.
 *
 * Le sens est un choix, et il se lit : `commandes → clients` se parcourt comme la phrase « les
 * commandes référencent les clients ». L'inverse — les tables référencées à gauche — se défend
 * autant, mais il fait pointer toutes les flèches à contresens de la lecture.
 *
 * # Sur un graphe rendu acyclique
 *
 * Les liens qui ferment un cycle sont écartés d'abord — voir `arcsArriere`, qui dit ce que leur
 * présence coûtait. Les liens réflexifs le sont pour la même famille de raison : ils demanderaient à
 * une table d'être à gauche d'elle-même.
 *
 * Le graphe étant alors acyclique, la relaxation rend le **plus long chemin** et s'arrête
 * d'elle-même : la borne d'itérations redevient ce qu'elle prétendait être, un garde-fou qu'on
 * n'atteint pas.
 */
function couchesDe(
  presentes: ReadonlyMap<string, EntreeDeTable>,
  liens: readonly Candidat[],
): ReadonlyMap<string, number> {
  const profondeurs = new Map([...presentes.keys()].map((id) => [id, 0]))
  const arcs = liens.filter((lien) => lien.source !== lien.cible)
  const arriere = arcsArriere(presentes, arcs)
  const avant = arcs.filter((arc) => !arriere.has(arc.id))

  for (let tour = 0; tour < presentes.size; tour++) {
    let bouge = false
    for (const lien of avant) {
      const source = profondeurs.get(lien.source) ?? 0
      if ((profondeurs.get(lien.cible) ?? 0) < source + 1) {
        profondeurs.set(lien.cible, source + 1)
        bouge = true
      }
    }
    if (!bouge) break
  }

  // **Le resserrage ne connaît que les liens avant.** Un arc arrière n'est pas une contrainte de
  // couche : le prendre pour telle rendait les deux bornes contradictoires, donc la table immobile
  // — précisément là où le resserrage aurait servi.
  resserrer(profondeurs, avant)
  return profondeurs
}

/**
 * Rapproche chaque table de ses voisines, sans changer l'ordre des couches.
 *
 * # Le défaut que ce passage corrige (rapporté à l'usage : « des liens extrêmement longs »)
 *
 * La relaxation ci-dessus place chaque table à sa colonne **minimale** : une table qu'aucune autre
 * ne référence reste en colonne 0, même quand rien ne l'y oblige. Sur un schéma réel, cela produit
 * exactement ce qui a été signalé — une table centrale (`users`, `account`) est poussée loin à
 * droite par la plus longue chaîne qui la référence, et **toutes** ses autres référentes lui tirent
 * un trait depuis la colonne 0. Mesuré sur un décor de dix tables en chaîne plus six feuilles vers
 * la dernière : six liens de neuf colonnes de portée, soit 1862 px chacun.
 *
 * # La règle, et pourquoi c'est celle-là
 *
 * Une table peut vivre entre `plancher` — juste après sa référente la plus à droite — et `plafond` —
 * juste avant sa référencée la plus à gauche. Dans cet intervalle, la longueur totale de ses liens
 * vaut `d × (entrants − sortants)` plus une constante : le minimum est donc à une **borne**, jamais
 * au milieu. D'où trois cas et aucun réglage :
 *
 * - plus d'entrants que de sortants : au plancher — c'est déjà ce que la relaxation donnait ;
 * - plus de sortants que d'entrants : au **plafond**, et c'est ce qui ramène les feuilles contre la
 *   table qu'elles référencent ;
 * - autant des deux : on ne bouge pas. Déplacer coûterait autant qu'il rapporte, et une disposition
 *   qui bouge sans gagner ne se compare plus d'une lecture à l'autre.
 *
 * Une équivalence à connaître, parce qu'elle explique un sabotage sans effet : pour une table à
 * degrés égaux, « rester où l'on est » et « aller au plancher » sont **la même valeur**. La
 * relaxation pose chaque table exactement à son plancher, et le resserrage ne fait que *monter* des
 * planchers — jamais les baisser. Écrire `actuelle` dit l'intention ; le bornage force la montée
 * quand une référente est passée devant.
 *
 * # Pourquoi ça s'arrête
 *
 * Chaque déplacement est le minimum de la longueur totale pour cette table, les autres étant fixes :
 * il fait donc **strictement décroître** une quantité entière positive — la somme des portées. La
 * boucle converge d'elle-même, et la borne sur les tours n'est là que pour n'avoir rien à démontrer.
 *
 * # Les cycles
 *
 * Un cycle rend les deux contraintes contradictoires — `plafond < plancher`. La table reste alors où
 * la relaxation l'a mise : c'est déjà le compromis qu'elle a trouvé, et il n'y a pas de position qui
 * satisfasse tout le monde.
 */
function resserrer(profondeurs: Map<string, number>, arcs: readonly Candidat[]): void {
  const sortants = new Map<string, string[]>()
  const entrants = new Map<string, string[]>()
  for (const arc of arcs) {
    sortants.set(arc.source, [...(sortants.get(arc.source) ?? []), arc.cible])
    entrants.set(arc.cible, [...(entrants.get(arc.cible) ?? []), arc.source])
  }

  // Un ordre déterminé, pour que deux dispositions des mêmes données se comparent.
  const ids = [...profondeurs.keys()].sort((a, b) => a.localeCompare(b))

  for (let tour = 0; tour < profondeurs.size; tour++) {
    let bouge = false
    for (const id of ids) {
      const versMoi = entrants.get(id) ?? []
      const depuisMoi = sortants.get(id) ?? []
      const plancher = versMoi.reduce(
        (bas, voisine) => Math.max(bas, (profondeurs.get(voisine) ?? 0) + 1),
        0,
      )
      const plafond = depuisMoi.reduce(
        (haut, voisine) => Math.min(haut, (profondeurs.get(voisine) ?? 0) - 1),
        Number.POSITIVE_INFINITY,
      )
      if (plafond < plancher) continue

      const actuelle = profondeurs.get(id) ?? 0
      const voulue =
        versMoi.length > depuisMoi.length
          ? plancher
          : depuisMoi.length > versMoi.length
            ? plafond
            : actuelle
      const bornee = Math.min(Math.max(voulue, plancher), plafond)
      if (bornee !== actuelle && Number.isFinite(bornee)) {
        profondeurs.set(id, bornee)
        bouge = true
      }
    }
    if (!bouge) break
  }
}

/**
 * Ordonne chaque colonne, et les colonnes entre elles.
 *
 * La première se trie par nom — il n'y a rien d'autre à quoi s'accrocher. Les suivantes se trient
 * par le **barycentre** de leurs voisines déjà placées : une table se pose en face de celles
 * auxquelles elle est liée, ce qui réduit les croisements sans exiger l'algorithme complet qui les
 * minimise. Un nom départage, pour que la disposition soit reproductible — deux dessins qui
 * diffèrent d'une exécution à l'autre ne se comparent pas, et une capture de fidélité en dépendrait.
 */
function ordonnerLesCouches(
  profondeurs: ReadonlyMap<string, number>,
  liens: readonly Candidat[],
  presentes: ReadonlyMap<string, EntreeDeTable>,
): readonly EntreeDeTable[][] {
  const nombreDeCouches = [...profondeurs.values()].reduce(
    (max, valeur) => Math.max(max, valeur + 1),
    0,
  )
  const couches: string[][] = Array.from({ length: nombreDeCouches }, () => [])
  for (const [id, profondeur] of profondeurs) couches[profondeur]?.push(id)

  /** Les voisines d'une table, dans les deux sens — un lien lie, il n'oriente pas le voisinage. */
  const voisines = new Map<string, string[]>()
  const lier = (de: string, vers: string) => {
    voisines.set(de, [...(voisines.get(de) ?? []), vers])
  }
  for (const lien of liens) {
    if (lien.source === lien.cible) continue
    lier(lien.source, lien.cible)
    lier(lien.cible, lien.source)
  }

  const rangs = new Map<string, number>()
  for (const couche of couches) {
    couche.sort((a, b) => {
      const barycentreA = barycentre(a, voisines, rangs)
      const barycentreB = barycentre(b, voisines, rangs)
      if (barycentreA !== barycentreB) return barycentreA - barycentreB
      return a.localeCompare(b)
    })
    // Les rangs de cette couche servent de repère à la suivante : ils doivent donc être posés
    // après qu'elle s'est triée, et avant que la suivante se trie.
    for (const [position, id] of couche.entries()) rangs.set(id, position)
  }
  // `?? []` plutôt qu'un `filter` : chaque identité vient de `presentes`, donc aucune ne manque.
  // Écrit ainsi, le compilateur n'a besoin d'aucune affirmation, et le lecteur d'aucune promesse.
  return couches.map((couche) => couche.flatMap((id) => presentes.get(id) ?? []))
}

/**
 * La position moyenne des voisines **déjà placées**, ou l'infini quand il n'y en a aucune.
 *
 * L'infini range les tables sans voisine placée à la fin de leur colonne, où elles ne s'insèrent
 * pas entre deux tables liées.
 */
function barycentre(
  id: string,
  voisines: ReadonlyMap<string, readonly string[]>,
  rangs: ReadonlyMap<string, number>,
): number {
  const places = (voisines.get(id) ?? [])
    .map((voisine) => rangs.get(voisine))
    .filter((rang): rang is number => rang !== undefined)
  if (places.length === 0) return Number.POSITIVE_INFINITY
  return places.reduce((somme, rang) => somme + rang, 0) / places.length
}

/**
 * Le tracé de tous les liens, **ensemble**.
 *
 * # Pourquoi tous d'un coup, et non un par un
 *
 * Un lien seul ne peut pas savoir où poser son segment vertical sans chevaucher celui du voisin.
 * C'est le défaut que le premier dessin avait : des courbes de Bézier, chacune juste, et qui se
 * confondaient dès que deux clés visaient la même région — impossible de suivre une flèche du regard
 * sans la sélectionner. Les couloirs se répartissent donc à l'échelle du dessin, ce qui demande de
 * connaître tous les liens avant d'en tracer un.
 *
 * # Des coudes, pas des courbes
 *
 * Trois segments — horizontal, vertical, horizontal — aux angles arrondis. Deux traits orthogonaux
 * qui se croisent se lisent comme un croisement ; deux courbes qui se rapprochent se lisent comme
 * une seule ligne épaisse. Et un segment droit **se partage sans ambiguïté** : deux liens qui suivent
 * un moment le même couloir restent deux liens, là où deux Béziers tangentes n'en font plus qu'une.
 */
function tracerTout(
  candidats: readonly Candidat[],
  boites: ReadonlyMap<string, Boite>,
): readonly Lien[] {
  /** Le lien résolu : ses deux bouts, son sens, et la gouttière où son coude ira. */
  type Resolu = {
    candidat: Candidat
    source: Boite
    cible: Boite
    depart: { x: number; y: number }
    arrivee: { x: number; y: number }
    /** L'identité de la gouttière traversée : c'est en elle que les couloirs se partagent. */
    gouttiere: string
    /** Le bord de la gouttière depuis lequel les couloirs se comptent. */
    bord: number
    /** `-1` quand les couloirs s'éloignent vers la gauche, `+1` vers la droite. */
    sens: -1 | 1
    /** Le sens de parcours à chaque bout — voir `Lien.sensDepart`. */
    sensDepart: -1 | 1
    sensArrivee: -1 | 1
    reflexif: boolean
  }

  const resolus: Resolu[] = []
  for (const candidat of candidats) {
    const source = boites.get(candidat.source)
    const cible = boites.get(candidat.cible)
    if (!source || !cible) continue

    const y1 = ancre(source, candidat.colonnes[0])
    const y2 = ancre(cible, candidat.colonnesCibles[0])

    if (source.id === cible.id) {
      // **Réflexif** : on ressort à droite et l'on y revient. Un `parent_id` est trop courant pour
      // qu'on se contente de ne rien tracer. Sa gouttière est la boîte elle-même — deux clés
      // réflexives sur la même table méritent deux couloirs.
      const x = source.x + source.width
      resolus.push({
        candidat,
        source,
        cible,
        depart: { x, y: y1 },
        arrivee: { x, y: y2 },
        gouttiere: `boucle:${source.id}`,
        bord: x,
        sens: 1,
        // On ressort à droite et l'on y revient : le second bout remonte le courant.
        sensDepart: 1,
        sensArrivee: -1,
        reflexif: true,
      })
      continue
    }

    if (cible.x >= source.x + source.width) {
      /*
       * **En avant** : on sort par la droite, on entre par la gauche.
       *
       * Le coude se place dans la gouttière qui précède **la cible**, et non dans celle qui suit la
       * source. C'est ce qui rend l'approche finale courte et droite : toutes les flèches qui
       * entrent dans une même table arrivent par le même côté, à des hauteurs différentes, et
       * l'œil les sépare. Le long segment horizontal reste, lui, à la hauteur de sa ligne de
       * départ, donc à l'intérieur de la bande de sa propre boîte.
       */
      resolus.push({
        candidat,
        source,
        cible,
        depart: { x: source.x + source.width, y: y1 },
        arrivee: { x: cible.x, y: y2 },
        gouttiere: `avant:${cible.couche}`,
        bord: cible.x,
        sens: -1,
        sensDepart: 1,
        sensArrivee: 1,
        reflexif: false,
      })
      continue
    }

    // **En arrière ou côte à côte**, ce que produisent les cycles et les liens d'une couche vers
    // elle-même : on sort par la gauche et l'on entre par la droite, faute de quoi le tracé
    // traverserait les deux boîtes qu'il relie.
    resolus.push({
      candidat,
      source,
      cible,
      depart: { x: source.x, y: y1 },
      arrivee: { x: cible.x + cible.width, y: y2 },
      gouttiere: `arriere:${source.couche}`,
      bord: source.x,
      sens: -1,
      sensDepart: -1,
      sensArrivee: -1,
      reflexif: false,
    })
  }

  /*
   * **Un couloir par lien dans chaque gouttière**, attribué du plus court au plus long.
   *
   * Le lien dont le segment vertical est le plus court prend le couloir le plus proche de son bord :
   * il croise ainsi le moins de voisins possible. Un tri par identité départage, sans quoi deux
   * dessins des mêmes données ne se compareraient pas.
   *
   * Ce n'est pas l'algorithme qui minimise les croisements — celui-là demande une recherche —, mais
   * il en obtient l'essentiel : deux verticales ne se superposent plus, et une flèche se suit du
   * regard sans avoir à la sélectionner.
   */
  const couloirs = new Map<string, number>()
  const parGouttiere = new Map<string, Resolu[]>()
  for (const resolu of resolus) {
    parGouttiere.set(resolu.gouttiere, [...(parGouttiere.get(resolu.gouttiere) ?? []), resolu])
  }
  for (const groupe of parGouttiere.values()) {
    const ordonnes = [...groupe].sort((a, b) => {
      const parcoursA = Math.abs(a.arrivee.y - a.depart.y)
      const parcoursB = Math.abs(b.arrivee.y - b.depart.y)
      if (parcoursA !== parcoursB) return parcoursA - parcoursB
      return a.candidat.id.localeCompare(b.candidat.id)
    })
    for (const [rang, resolu] of ordonnes.entries()) couloirs.set(resolu.candidat.id, rang)
  }

  return (
    resolus
      .map((resolu): Lien => {
        const commun = {
          id: resolu.candidat.id,
          source: resolu.candidat.source,
          cible: resolu.candidat.cible,
          contrainte: resolu.candidat.contrainte,
          colonnes: resolu.candidat.colonnes,
          colonnesCibles: resolu.candidat.colonnesCibles,
          cardinalite: resolu.candidat.cardinalite,
          depart: resolu.depart,
          arrivee: resolu.arrivee,
          sensDepart: resolu.sensDepart,
          sensArrivee: resolu.sensArrivee,
        }
        const rang = couloirs.get(resolu.candidat.id) ?? 0
        if (resolu.reflexif) {
          return { ...commun, chemin: boucle(resolu.depart, resolu.arrivee, rang) }
        }
        return {
          ...commun,
          chemin: coude(resolu.depart, resolu.arrivee, couloirDe(resolu.bord, resolu.sens, rang)),
        }
      })
      // Un ordre stable, pour que deux dispositions équivalentes se comparent et que le DOM ne se
      // réordonne pas à chaque table qui arrive.
      .sort((a, b) => a.id.localeCompare(b.id))
  )
}

/**
 * L'abscisse du couloir de rang `rang`, à `sens` du bord de la gouttière.
 *
 * Les couloirs s'éloignent du bord par pas fixe, et **bouclent** au-delà de ce que la gouttière peut
 * tenir : deux traits confondus valent mieux qu'un trait passant sous une boîte. Le cas ne se
 * présente qu'à partir de six clés entrant dans une même colonne de tables.
 */
function couloirDe(bord: number, sens: -1 | 1, rang: number): number {
  return bord + sens * ECART_COULOIR * ((rang % COULOIRS_PAR_GOUTTIERE) + 1)
}

/**
 * Un coude à angles arrondis : horizontal, vertical, horizontal.
 *
 * Le rayon est **borné par les trois segments** qu'il rogne — la moitié du parcours vertical, et
 * chacune des deux portions horizontales. Sans cette borne, un lien dont les deux bouts sont presque
 * à la même hauteur verrait ses arrondis se croiser, et le tracé partirait à l'envers.
 *
 * Deux bouts à la même hauteur donnent un **trait droit**, sans coude ni arrondi : c'est le cas le
 * plus fréquent d'un schéma bien rangé, et un coude de rayon nul y laisserait des artefacts.
 */
function coude(
  depart: { x: number; y: number },
  arrivee: { x: number; y: number },
  couloir: number,
): string {
  const { x: x1, y: y1 } = depart
  const { x: x2, y: y2 } = arrivee
  if (Math.abs(y2 - y1) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`

  const versX = x2 >= x1 ? 1 : -1
  const versY = y2 > y1 ? 1 : -1
  const rayon = Math.min(
    RAYON_COUDE,
    Math.abs(y2 - y1) / 2,
    Math.abs(couloir - x1),
    Math.abs(x2 - couloir),
  )
  return [
    `M ${x1} ${y1}`,
    `L ${arrondi(couloir - versX * rayon)} ${y1}`,
    `Q ${couloir} ${y1} ${couloir} ${arrondi(y1 + versY * rayon)}`,
    `L ${couloir} ${arrondi(y2 - versY * rayon)}`,
    `Q ${couloir} ${y2} ${arrondi(couloir + versX * rayon)} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

/**
 * La boucle d'un lien réflexif : dehors à droite, le long, et retour.
 *
 * Un rectangle arrondi ouvert sur la boîte, plutôt qu'une courbe : c'est la même grammaire que les
 * autres liens, et une table qui se référence ne mérite pas un tracé d'une autre nature.
 */
function boucle(
  depart: { x: number; y: number },
  arrivee: { x: number; y: number },
  rang: number,
): string {
  const { x, y: y1 } = depart
  const { y: y2 } = arrivee
  const loin = x + BOUCLE + rang * ECART_COULOIR
  // Une boucle dont les deux bouts seraient à la même hauteur n'aurait pas de côté : le rayon est
  // borné par la moitié de sa hauteur, comme dans `coude`.
  const rayon = Math.min(RAYON_COUDE, Math.abs(y2 - y1) / 2, (loin - x) / 2)
  const versY = y2 > y1 ? 1 : -1
  return [
    `M ${x} ${y1}`,
    `L ${arrondi(loin - rayon)} ${y1}`,
    `Q ${loin} ${y1} ${loin} ${arrondi(y1 + versY * rayon)}`,
    `L ${loin} ${arrondi(y2 - versY * rayon)}`,
    `Q ${loin} ${y2} ${arrondi(loin - rayon)} ${y2}`,
    `L ${x} ${y2}`,
  ].join(' ')
}

/** Deux décimales suffisent à un tracé, et gardent l'attribut `d` lisible. */
function arrondi(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

/**
 * L'ordonnée absolue de la ligne d'une colonne, ou le milieu de la boîte à défaut.
 *
 * Le repli ne devrait pas servir : les colonnes d'une clé sont toujours montrées (voir `mesurer`).
 * Il couvre le cas où le catalogue nomme une colonne que la liste des colonnes ne contient pas —
 * `relation_depuis`, côté Rust, omet déjà une relation dont il ne sait pas nommer les colonnes, mais
 * une flèche qui disparaît est un moindre mal qu'un `NaN` dans un attribut `d`, qui effacerait le
 * tracé sans rien dire.
 */
function ancre(boite: Boite, colonne: string | undefined): number {
  const ligne = boite.lignes.find(
    (candidate) => candidate.sorte === 'colonne' && candidate.column === colonne,
  )
  return boite.y + (ligne ? ligne.y : boite.height / 2)
}
