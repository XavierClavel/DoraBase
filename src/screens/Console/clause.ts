/**
 * Où le curseur se trouve dans la requête, en fonctions **pures**.
 *
 * # Pourquoi
 *
 * La liste proposait la même chose partout : les colonnes des tables citées, **toutes** les tables du
 * catalogue, et trente mots-clés. Après un `order by`, elle offrait donc des noms de tables et
 * `select` — deux choses qu'on ne peut pas écrire là. Une suggestion invalide n'est pas seulement du
 * bruit : elle se lit comme une affirmation que le produit sait ce qu'il propose.
 *
 * # Par lecture, pas par analyse syntaxique
 *
 * La clause est celle du **dernier mot-clé rencontré avant le curseur**, dans l'instruction courante.
 * C'est le même arbitrage qu'`alias.ts` — un analyseur SQL complet est hors de proportion — et il
 * couvre ce qu'on écrit à la main.
 *
 * **Les limites sont nommées**, et elles se ressemblent toutes : un mot-clé qui n'en est pas un
 * trompe la lecture. `extract(day from x)` et `is not distinct from` portent un `from` qui n'ouvre
 * aucune clause de table ; un mot-clé dans une chaîne littérale compte comme les autres. Dans ces
 * cas la liste propose la mauvaise nature — jamais une colonne ou une table inventée, puisque
 * celles-ci viennent toujours du catalogue et de la requête.
 */

/** La nature de ce qui peut s'écrire à l'endroit du curseur. */
export type Clause =
  /** Rien encore, ou après un `;` : seule une instruction peut commencer. */
  | 'debut'
  /** La liste de projection d'un `select`. */
  | 'select'
  /** Là où une table se nomme : `from`, `join`, `update`, `insert into`, `delete from`. */
  | 'table'
  /** Une liste de colonnes nue — celle que `insert into t (…)` demande. */
  | 'colonnes'
  | 'where'
  | 'on'
  | 'groupe'
  /** `order by`. */
  | 'tri'
  | 'having'
  /** Le `set` d'un `update`. */
  | 'set'
  | 'returning'
  /** Le `values` d'un `insert` : des littéraux, pas des colonnes. */
  | 'valeurs'
  /** `limit` et `offset` : un nombre. */
  | 'limite'

/**
 * Les mots-clés qui ouvrent une clause.
 *
 * **Les formes en deux mots doivent y être en entier**, parce qu'aucune de leurs moitiés n'ouvre de
 * clause toute seule : sans `insert\s+into`, `insert into t (` ne rencontre aucun mot-clé et passe
 * pour un début d'instruction ; sans `order\s+by`, un tri est lu comme la clause qui le précède.
 *
 * `delete\s+from` fait exception et le dit : son `from` suffirait à donner la même clause. Il est
 * gardé pour nommer la forme, pas parce qu'il change une lecture — un sabotage l'a montré vert.
 *
 * **L'ordre des alternatives, lui, ne décide de rien** : deux formes ne peuvent pas commencer au même
 * caractère, et le moteur essaie toutes les alternatives à chaque position avant d'avancer.
 */
const MOTIF_DE_CLAUSE =
  /\b(select|delete\s+from|insert\s+into|group\s+by|order\s+by|from|join|update|truncate|where|having|returning|values|offset|limit|using|on|set)\b/gi

const CLAUSE_PAR_MOT: Readonly<Record<string, Clause>> = {
  select: 'select',
  from: 'table',
  join: 'table',
  'insert into': 'table',
  'delete from': 'table',
  update: 'table',
  truncate: 'table',
  where: 'where',
  on: 'on',
  // **`using` est lu comme une clause de colonnes**, ce qui est le cas de `join … using (a, b)`.
  // `delete … using autre_table` en attend une, et c'est la lecture qu'on abandonne : la première
  // forme est celle qu'on écrit à la main, la seconde est rare et propre à PostgreSQL.
  using: 'on',
  'group by': 'groupe',
  'order by': 'tri',
  having: 'having',
  set: 'set',
  returning: 'returning',
  values: 'valeurs',
  limit: 'limite',
  offset: 'limite',
}

/** Le SQL sans ses commentaires. Pour l'analyse seulement — l'exécution garde le texte entier. */
export function sansCommentaires(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/**
 * L'instruction en cours, c'est-à-dire ce qui suit le dernier `;`.
 *
 * Sans cela, la seconde instruction d'une console hériterait de la clause de la première : après
 * `select … order by x; ` on proposerait `asc` au lieu de `select`.
 */
function instructionCourante(avant: string): string {
  return avant.slice(avant.lastIndexOf(';') + 1)
}

/** La clause où se trouve le curseur. */
export function clauseA(texte: string, position: number): Clause {
  const avant = instructionCourante(sansCommentaires(texte.slice(0, position)))

  let dernier: string | null = null
  let finDuDernier = 0
  for (const trouve of avant.matchAll(MOTIF_DE_CLAUSE)) {
    dernier = trouve[1] ? trouve[1].toLowerCase().replace(/\s+/g, ' ') : null
    finDuDernier = trouve.index + trouve[0].length
  }
  if (dernier === null) return 'debut'
  const clause = CLAUSE_PAR_MOT[dernier] ?? 'debut'

  // **Une parenthèse ouverte dans une clause de table est la liste de colonnes d'un `insert`.**
  // Une sous-requête, elle, ne passe pas par ici : son `select` est alors le dernier mot-clé, donc
  // la clause est déjà celle de la projection.
  if (clause === 'table' && parentheseOuverte(avant.slice(finDuDernier))) return 'colonnes'
  return clause
}

/** Vrai quand il reste une parenthèse ouverte à la fin du fragment. */
function parentheseOuverte(fragment: string): boolean {
  let profondeur = 0
  for (const caractere of fragment) {
    if (caractere === '(') profondeur += 1
    else if (caractere === ')') profondeur -= 1
  }
  return profondeur > 0
}

/**
 * Vrai quand le curseur est à l'endroit où **seule une table** a un sens.
 *
 * Ce n'est pas la clause : dans `from orders o `, la clause est encore celle de la table, mais on y
 * écrit un alias puis un `join` ou un `where`, pas une seconde table. La place de table est le
 * **premier élément** de la clause, ou celui qui suit une virgule — `from orders o, users`.
 */
export function enPositionDeTable(texte: string, position: number): boolean {
  const avant = instructionCourante(sansCommentaires(texte.slice(0, position)))
  if (clauseA(texte, position) !== 'table') return false

  MOTIF_DE_CLAUSE.lastIndex = 0
  let apres = ''
  for (const trouve of avant.matchAll(MOTIF_DE_CLAUSE)) {
    apres = avant.slice(trouve.index + trouve[0].length)
  }
  // Rien d'autre que le mot en cours de frappe, éventuellement précédé d'une virgule.
  return /^\s*[\w$.]*$/.test(apres) || /,\s*[\w$.]*$/.test(apres)
}

/** Vrai quand un nom de colonne peut s'écrire à cet endroit. */
export function accepteDesColonnes(clause: Clause): boolean {
  return (
    clause === 'select' ||
    clause === 'colonnes' ||
    clause === 'where' ||
    clause === 'on' ||
    clause === 'groupe' ||
    clause === 'tri' ||
    clause === 'having' ||
    clause === 'set' ||
    clause === 'returning'
  )
}

/**
 * Les mots-clés qu'on peut écrire dans une clause.
 *
 * **Ce qui suit la clause en fait partie** : dans un `where`, `group by` est proposé, parce que c'est
 * là qu'on l'écrit. Ce qui est écarté est ce qui serait invalide — `select` au milieu d'un `where`,
 * `asc` ailleurs que dans un tri.
 *
 * Ils sont **toujours sûrs** : ils existent quelle que soit la base, et c'est ce qu'on propose quand
 * le catalogue n'a rien à dire.
 */
export function motsClesDe(clause: Clause): readonly string[] {
  return MOTS_CLES[clause]
}

const FONCTIONS = ['count(', 'sum(', 'avg(', 'min(', 'max(', 'coalesce(', 'date_trunc(', 'now()']
const COMPARAISONS = [
  'and',
  'or',
  'not',
  'null',
  'is null',
  'is not null',
  'in',
  'like',
  'ilike',
  'between',
]

const MOTS_CLES: Readonly<Record<Clause, readonly string[]>> = {
  debut: ['select', 'with', 'insert into', 'update', 'delete from', 'explain'],
  select: ['distinct', 'as', 'case when', 'from', ...FONCTIONS],
  // À la place d'une table, **aucun mot-clé** : seul un nom de table est valide. Ailleurs dans la
  // clause — après l'alias — c'est la suite de la requête qu'on écrit.
  table: ['as', 'join', 'left join', 'inner join', 'on', 'where', 'group by', 'order by', 'limit'],
  colonnes: [],
  where: [...COMPARAISONS, 'group by', 'order by', 'limit', ...FONCTIONS],
  on: ['and', 'or', 'is not distinct from', 'where', 'join', 'left join', 'inner join'],
  groupe: ['having', 'order by', 'limit'],
  tri: ['asc', 'desc', 'nulls first', 'nulls last', 'limit', 'offset'],
  having: [...COMPARAISONS, 'order by', 'limit', ...FONCTIONS],
  set: ['where', 'returning', ...FONCTIONS],
  returning: [],
  valeurs: ['null', 'default', 'now()'],
  limite: ['offset'],
}
