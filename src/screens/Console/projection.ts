/**
 * La réécriture de la projection d'un `select`, quand les colonnes du résultat sont réordonnées ou
 * masquées à la grille — en fonction **pure**.
 *
 * # Pourquoi
 *
 * Déplacer ou masquer une colonne du résultat ne change que l'affichage ; la requête, elle,
 * continue de dire l'ancien état. Réécrire sa liste de projection rend le geste durable —
 * relancer la requête rend les colonnes visibles, dans l'ordre qu'on vient de composer — et la
 * requête reste **exécutable** : la liste est toujours écrite en entier, jamais élidée. Une `…`
 * dans un `select` ferait échouer `⌘↩` sur une syntaxe que le produit aurait lui-même écrite.
 *
 * La projection devient donc **exactement** `colonnes` : un élément écrit que la liste ne demande
 * plus est retiré (une colonne masquée), un nom demandé que la liste ne porte pas est écrit nu
 * (une colonne réaffichée, dont le retrait a effacé la forme écrite).
 *
 * Une liste repliée sur plusieurs lignes rend aussi **où la replier à l'écran** (`repli`) :
 * l'éditeur masque ces lignes derrière une `…` cliquable, mais le *texte*, lui, reste entier — ce
 * qui s'exécute, se copie et se relit est toujours la requête complète. C'est ce qui réconcilie
 * « trop de colonnes à afficher » et « jamais une `…` dans du SQL ».
 *
 * # Par lecture, pas par analyse syntaxique
 *
 * Même arbitrage qu'`alias.ts` et `clause.ts` : un analyseur SQL complet est hors de proportion.
 * La fonction ne réécrit que ce qu'elle est **certaine** de lire — une liste plate de colonnes, ou
 * `*` — et rend `null` pour tout le reste : l'appelant laisse alors la requête telle quelle, et la
 * grille, elle, s'est déjà réordonnée. Le refus est la direction sûre — une requête de
 * l'utilisateur corrompue en silence serait le pire défaut de ce geste, la même famille que le
 * dump tronqué présenté comme une sauvegarde.
 *
 * **Les limites sont nommées.** Rendent `null` : une CTE (`with … select`), `distinct`, une
 * expression ou une fonction dans la liste, un alias (`as`), un commentaire avant le `from`, une
 * seconde instruction après un `;`, un `*` qualifié (`t.*`), deux colonnes homonymes, et un nom à
 * **écrire** — développement de `*`, ou retour d'une colonne masquée — qui demanderait des
 * guillemets : le style de citation dépend du moteur, que cette fonction ne connaît pas. Un `;`
 * enfermé dans une citation en dollars (`$$…$$`) passe pour une seconde instruction : refus en
 * trop, jamais réécriture en trop. Et le retour d'une colonne retirée regénère son nom **nu** —
 * la forme écrite d'origine (`o."Total"`) est perdue avec le retrait ; quand elle ne se regénère
 * pas, la réécriture entière refuse, et la requête garde l'état du masquage.
 */

/**
 * Les mots qu'un développement de `*` ne peut pas écrire nus : le moteur les lirait comme des
 * mots-clés. Les citer demanderait de choisir un style de citation par moteur ; on refuse.
 * Une liste **écrite par l'utilisateur**, elle, n'y passe pas — ses éléments sont repris tels
 * quels, citation comprise.
 */
const MOTS_RESERVES = new Set([
  'select',
  'from',
  'where',
  'group',
  'order',
  'by',
  'having',
  'limit',
  'offset',
  'join',
  'inner',
  'left',
  'right',
  'full',
  'outer',
  'cross',
  'on',
  'as',
  'and',
  'or',
  'not',
  'union',
  'all',
  'distinct',
  'case',
  'when',
  'then',
  'else',
  'end',
  'null',
  'true',
  'false',
  'in',
  'is',
  'like',
  'between',
  'exists',
  'user',
  'table',
  'into',
  'values',
  'cast',
  'with',
])

/** Un nom que tous les moteurs lisent nu : minuscules, chiffres, soulignés, hors mots réservés. */
function estUnNomNu(nom: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(nom) && !MOTS_RESERVES.has(nom)
}

/** Largeur au-delà de laquelle la liste passe sur plusieurs lignes plutôt que de courir. */
const LARGEUR_MAX = 80
/** « select » et son espace : ce que la première ligne porte déjà avant la liste. */
const PREFIXE_SELECT = 7
/** L'indentation des lignes de continuation d'une liste repliée. */
const INDENTATION = 2

/** Une réécriture : le SQL entier, et les bornes de ce que l'éditeur replie à l'écran. */
export type Reecriture = {
  sql: string
  /**
   * Les lignes de continuation d'une liste repliée — du premier retour à la ligne à la fin de la
   * liste, bornes en indices de `sql`. `null` quand la liste tient sur sa ligne. C'est un repli
   * d'**affichage** : le texte les porte toujours.
   */
  repli: { de: number; a: number } | null
}

/**
 * Réécrit la liste de projection de `sql` pour qu'elle devienne **exactement** `colonnes` — les
 * colonnes **visibles** du résultat, dans leur ordre d'affichage : ce qui est écrit et n'y figure
 * plus est retiré (masquer), ce qui y figure sans être écrit est ajouté nu (réafficher). Rend le
 * SQL réécrit et son repli d'affichage, ou `null` quand la requête ne se laisse pas lire avec
 * certitude — voir l'en-tête. Tout ce qui n'est pas la liste — casse du `select`, clause `from`
 * et la suite, `;` final — est repris à l'octet près.
 */
/** La tête lue d'un `select … from` : les bornes de la liste de projection, et ce qu'elle porte. */
type Tete = {
  /** Juste après le mot `select`. */
  finDuSelect: number
  /** Juste avant le mot `from` — la liste vit entre les deux. */
  debutDuFrom: number
  etoile: boolean
  elements: readonly { texte: string; nom: string }[]
}

/**
 * Lit la tête `select <liste> from` d'une requête — la lecture partagée entre la réécriture et le
 * repli d'affichage. Rend `null` dès que la structure n'est pas une liste plate de colonnes (ou
 * `*`) : c'est le refus décrit dans l'en-tête du fichier.
 */
function lireLaTete(sql: string): Tete | null {
  let i = 0

  function blancs() {
    while (i < sql.length && ' \t\n\r'.includes(sql[i] as string)) i++
  }

  /** Un mot nu — lettres, chiffres, `_`, `$` — ou `null` si le curseur n'est pas dessus. */
  function mot(): string | null {
    if (!/[A-Za-z_]/.test(sql[i] ?? '')) return null
    const depart = i
    while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i] as string)) i++
    return sql.slice(depart, i)
  }

  /**
   * Un segment d'identifiant : nu, `"…"` ou `` `…` `` (le doublement échappe la citation). Rend
   * `[texte écrit, nom effectif]`, ou `null` — citation jamais refermée, ou autre chose qu'un
   * identifiant.
   */
  function segment(): [string, string] | null {
    const citation = sql[i]
    if (citation === '"' || citation === '`') {
      const depart = i
      i++
      let nom = ''
      while (i < sql.length) {
        if (sql[i] === citation) {
          if (sql[i + 1] === citation) {
            nom += citation
            i += 2
            continue
          }
          i++
          return [sql.slice(depart, i), nom]
        }
        nom += sql[i]
        i++
      }
      return null
    }
    const nu = mot()
    return nu === null ? null : [nu, nu]
  }

  // Le mot `select`, et rien avant lui — ni commentaire, ni `with`, ni instruction précédente.
  blancs()
  const tete = mot()
  if (tete === null || tete.toLowerCase() !== 'select') return null
  const finDuSelect = i

  blancs()

  // La liste telle qu'écrite : chaque élément avec son texte exact et son nom effectif — le
  // dernier segment d'un chemin qualifié (`o.total` se nomme `total`, comme dans le résultat).
  let etoile = false
  const elements: { texte: string; nom: string }[] = []

  if (sql[i] === '*') {
    etoile = true
    i++
  } else {
    for (;;) {
      const departDeLElement = i
      let dernier = segment()
      if (dernier === null) return null
      while (sql[i] === '.') {
        i++
        dernier = segment()
        // Un `t.*` : développer le reste de la table demanderait le catalogue, pas le résultat.
        if (dernier === null) return null
      }
      elements.push({ texte: sql.slice(departDeLElement, i), nom: dernier[1] })

      blancs()
      if (sql[i] === ',') {
        i++
        blancs()
        continue
      }
      break
    }
  }

  // Après la liste (ou l'étoile), le seul mot admis est `from` — nu, jamais cité. Deux mots
  // adjacents (`distinct x`, `a as x`), une parenthèse, un opérateur ou un commentaire arrivent
  // ici et refusent.
  blancs()
  const debutDuFrom = i
  const suivant = mot()
  if (suivant === null || suivant.toLowerCase() !== 'from') return null

  return { finDuSelect, debutDuFrom, etoile, elements }
}

export function reordonnerLaProjection(
  sql: string,
  colonnes: readonly string[],
): Reecriture | null {
  if (colonnes.length === 0) return null
  const tete = lireLaTete(sql)
  if (tete === null) return null
  const { finDuSelect, debutDuFrom, etoile, elements } = tete

  // Une seule instruction : la réécriture porte sur la requête dont `colonnes` est le résultat,
  // et un script en aurait exécuté d'autres. Le `;` final, seul, reste admis — et repris tel quel.
  if (uneSecondeInstructionSuit(sql.slice(debutDuFrom))) return null

  // Les textes à écrire, dans l'ordre des colonnes du résultat.
  let textes: readonly string[]
  if (etoile) {
    if (!colonnes.every(estUnNomNu)) return null
    textes = colonnes
  } else {
    const parNom = new Map<string, string>()
    for (const element of elements) {
      // La correspondance est insensible à la casse — PostgreSQL replie les noms nus, MySQL rend
      // la casse écrite. Deux éléments qui s'y confondent (`"ID"` et `id`) refusent.
      const cle = element.nom.toLowerCase()
      if (parNom.has(cle)) return null
      parNom.set(cle, element.texte)
    }
    const ecrits: string[] = []
    const vues = new Set<string>()
    for (const colonne of colonnes) {
      const cle = colonne.toLowerCase()
      if (vues.has(cle)) return null
      vues.add(cle)
      const ecrit = parNom.get(cle)
      // Une colonne demandée que la liste ne porte plus : le retour d'une colonne masquée, dont
      // le retrait a effacé la forme écrite. Elle se regénère nue, ou toute la réécriture refuse
      // — les guillemets sont une affaire de moteur. Ce qui est écrit et non demandé est
      // simplement laissé de côté : c'est le retrait du masquage.
      if (ecrit === undefined && !estUnNomNu(colonne)) return null
      ecrits.push(ecrit ?? colonne)
    }
    textes = ecrits
  }

  const reecrit = sql.slice(0, finDuSelect) + milieu(textes) + sql.slice(debutDuFrom)
  return { sql: reecrit, repli: repliDeLaProjection(reecrit) }
}

/**
 * Où replier l'affichage d'une requête **telle qu'elle est** : les lignes de continuation de sa
 * liste de projection, du premier retour à la ligne à son dernier élément — le retour final reste
 * visible, pour que `from` garde sa ligne une fois la liste pliée. `null` quand la liste tient sur
 * sa ligne, ou que la tête ne se laisse pas lire.
 *
 * C'est la lecture qui rend le pli **réversible** : la gouttière de l'éditeur s'en sert pour
 * proposer de replier ce qu'une `…` a déplié — et une liste écrite à la main y a droit aussi.
 */
export function repliDeLaProjection(sql: string): { de: number; a: number } | null {
  const tete = lireLaTete(sql)
  if (tete === null || tete.etoile) return null
  const premierRetour = sql.slice(tete.finDuSelect, tete.debutDuFrom).indexOf('\n')
  if (premierRetour === -1) return null
  const de = tete.finDuSelect + premierRetour
  let a = tete.debutDuFrom
  while (a > tete.finDuSelect && ' \t\n\r'.includes(sql[a - 1] as string)) a--
  // Un simple retour à la ligne avant `from`, sans ligne de continuation : rien à replier.
  return de >= a ? null : { de, a }
}

/**
 * La liste mise en forme, du `select` (exclu) au `from` (exclu) : sur une ligne quand elle tient,
 * repliée sinon — remplissage glouton, `from` rendu à sa propre ligne. C'est le « trop de
 * colonnes » du geste : la requête reste entière et exécutable, seule sa mise en page se replie.
 */
function milieu(textes: readonly string[]): string {
  const enLigne = textes.join(', ')
  if (PREFIXE_SELECT + enLigne.length <= LARGEUR_MAX) return ` ${enLigne} `

  const lignes: string[] = []
  let courante = ''
  for (const texte of textes) {
    const prefixe = lignes.length === 0 ? PREFIXE_SELECT : INDENTATION
    const candidate = courante === '' ? texte : `${courante}, ${texte}`
    if (courante !== '' && prefixe + candidate.length > LARGEUR_MAX) {
      lignes.push(courante)
      courante = texte
    } else {
      courante = candidate
    }
  }
  lignes.push(courante)
  return ` ${lignes.join(`,\n${' '.repeat(INDENTATION)}`)}\n`
}

/**
 * Vrai si un `;` hors citation et hors commentaire est suivi d'autre chose que du blanc et des
 * commentaires. Les citations en dollars ne sont pas lues — un `;` dedans compte, donc refuse.
 * Partagée avec `limite.ts` : le stepper `LIMIT` ne parle lui aussi qu'à une requête seule.
 */
export function uneSecondeInstructionSuit(queue: string): boolean {
  let apresPointVirgule = false
  let i = 0
  while (i < queue.length) {
    const c = queue[i] as string
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < queue.length) {
        if (queue[i] === c) {
          if (queue[i + 1] === c) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      if (apresPointVirgule) return true
      continue
    }
    if (c === '-' && queue[i + 1] === '-') {
      while (i < queue.length && queue[i] !== '\n') i++
      continue
    }
    if (c === '/' && queue[i + 1] === '*') {
      i += 2
      while (i < queue.length && !(queue[i] === '*' && queue[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === ';') {
      apresPointVirgule = true
      i++
      continue
    }
    if (apresPointVirgule && !' \t\n\r'.includes(c)) return true
    i++
  }
  return false
}
