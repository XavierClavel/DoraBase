/**
 * Le modèle de l'arbre JSON dépliable de `13b`, en fonctions **pures**.
 *
 * **Distinct de `JsonColore` (`10f`), qui rend un JSON entier.** Cela convient à une ligne de table ;
 * un document mongo peut avoir cinquante champs et trois niveaux, et il faut pouvoir le replier.
 *
 * Isolé du rendu pour la raison habituelle du projet : le dépliage, le repli et la reconnaissance
 * des types se testent sans DOM.
 */

/** Ce qu'un nœud de l'arbre porte. */
export type Noeud = {
  /** Le chemin depuis la racine — `2.livraison.ville`. C'est l'identité du nœud. */
  chemin: string
  /** La clé affichée : un nom de champ, ou un indice de tableau. */
  cle: string
  /** La profondeur, pour l'indentation. La racine est à 0. */
  niveau: number
  /** Le genre, qui décide du rendu et de la teinte. */
  genre: Genre
  /** Le texte de la valeur pour les feuilles, `null` pour un nœud qui se déplie. */
  texte: string | null
  /** Le nombre d'enfants, affiché replié — `{ 8 champs }`, `[ 3 ]`. */
  enfants: number
  /** Vrai quand le nœud a des enfants, donc qu'il se déplie. */
  depliable: boolean
}

/**
 * Les genres distingués à l'écran.
 *
 * **`objectId` et `date` sont des genres à part**, alors que le JSON n'en connaît pas : le JSON
 * étendu de MongoDB les note `{"$oid": …}` et `{"$date": …}`, et les afficher comme des objets à un
 * champ ferait perdre ce qu'ils sont — c'est ce que `13b` demande de distinguer.
 */
export type Genre =
  | 'objet'
  | 'tableau'
  | 'chaine'
  | 'nombre'
  | 'booleen'
  | 'nul'
  | 'objectId'
  | 'date'

/**
 * Les nœuds **visibles** d'une valeur, selon ce qui est déplié.
 *
 * Une liste plate et non un arbre imbriqué : c'est ce qu'un rendu indenté consomme, et cela évite un
 * composant récursif dont chaque niveau remonterait.
 */
export function noeudsVisibles(
  racine: unknown,
  ouverts: ReadonlySet<string>,
  cheminRacine = '',
): Noeud[] {
  const sortie: Noeud[] = []
  parcourir(racine, cheminRacine, cheminRacine === '' ? '' : cheminRacine, 0, ouverts, sortie)
  return sortie
}

function parcourir(
  valeur: unknown,
  chemin: string,
  cle: string,
  niveau: number,
  ouverts: ReadonlySet<string>,
  sortie: Noeud[],
): void {
  const genre = genreDe(valeur)
  const enfants = enfantsDe(valeur, genre)
  const depliable = enfants.length > 0

  sortie.push({
    chemin,
    cle,
    niveau,
    genre,
    texte: depliable ? null : texteDe(valeur, genre),
    enfants: enfants.length,
    depliable,
  })

  if (!depliable || !ouverts.has(chemin)) return
  for (const [sousCle, sousValeur] of enfants) {
    const sousChemin = chemin === '' ? sousCle : `${chemin}.${sousCle}`
    parcourir(sousValeur, sousChemin, sousCle, niveau + 1, ouverts, sortie)
  }
}

/**
 * Le genre d'une valeur, **JSON étendu compris**.
 *
 * Un `{"$oid": "…"}` est un `ObjectId`, pas un objet à un champ. Le reconnaître ici évite que chaque
 * écran ait à connaître la notation de MongoDB — la même raison qui a mis `TypeCategory` dans le
 * contrat plutôt que dans les écrans (`06a`).
 */
export function genreDe(valeur: unknown): Genre {
  if (valeur === null) return 'nul'
  if (typeof valeur === 'string') return 'chaine'
  if (typeof valeur === 'number') return 'nombre'
  if (typeof valeur === 'boolean') return 'booleen'
  if (Array.isArray(valeur)) return 'tableau'
  if (typeof valeur === 'object') {
    const cles = Object.keys(valeur as object)
    if (cles.length === 1 && cles[0] === '$oid') return 'objectId'
    if (cles.length === 1 && cles[0] === '$date') return 'date'
    return 'objet'
  }
  return 'nul'
}

/** Les enfants dépliables d'une valeur. Vide pour une feuille, y compris pour un `ObjectId`. */
function enfantsDe(valeur: unknown, genre: Genre): [string, unknown][] {
  if (genre === 'tableau') {
    return (valeur as unknown[]).map((v, i) => [String(i), v])
  }
  // **Ni `objectId` ni `date` ne se déplient** : ce sont des feuilles, malgré leur forme d'objet.
  if (genre === 'objet') {
    return Object.entries(valeur as Record<string, unknown>)
  }
  return []
}

/** Le texte d'une feuille, tel qu'il s'affiche. */
export function texteDe(valeur: unknown, genre: Genre): string {
  switch (genre) {
    case 'nul':
      return 'null'
    case 'chaine':
      return JSON.stringify(valeur)
    case 'objectId':
      return String((valeur as { $oid: string }).$oid)
    case 'date': {
      const brut = (valeur as { $date: unknown }).$date
      // `$date` est une chaîne ISO 8601 dans le JSON étendu *relâché*, et un objet
      // `{"$numberLong": …}` dans le *canonique*. Le moteur rend le relâché (`18a`), mais lire les
      // deux coûte trois lignes et évite un « [object Object] » à l'écran.
      if (typeof brut === 'string') return brut
      if (brut && typeof brut === 'object' && '$numberLong' in brut) {
        const millisecondes = Number((brut as { $numberLong: string }).$numberLong)
        return new Date(millisecondes).toISOString()
      }
      return String(brut)
    }
    // Un objet ou un tableau **vide** est une feuille, et son texte le dit : `{}` et `[]` sont des
    // valeurs, à ne pas confondre avec une absence.
    case 'objet':
      return '{}'
    case 'tableau':
      return '[]'
    default:
      return String(valeur)
  }
}

/**
 * Les chemins ouverts au premier affichage : **le premier niveau, et rien de plus** (`13b`).
 *
 * Un résultat d'agrégation à quatre documents déplié entièrement remplit l'écran de crochets ; tout
 * replié, on ne lit aucune clé. Le mockup montre les documents dépliés d'un cran.
 */
export function ouvertsParDefaut(documents: readonly unknown[]): Set<string> {
  return new Set(documents.map((_, index) => String(index)))
}

/** Bascule un chemin. Le rendu s'en sert comme unique geste. */
export function basculer(ouverts: ReadonlySet<string>, chemin: string): Set<string> {
  const suivant = new Set(ouverts)
  if (!suivant.delete(chemin)) suivant.add(chemin)
  return suivant
}

/**
 * Le résumé affiché à droite d'un nœud replié.
 *
 * **Le compte, et non un aperçu des valeurs.** Un aperçu tronqué de trois champs se lirait comme le
 * contenu entier — et pour savoir combien il en reste, il faudrait déplier.
 */
export function resume(noeud: Noeud): string {
  if (!noeud.depliable) return ''
  return noeud.genre === 'tableau'
    ? `[ ${noeud.enfants} ]`
    : `{ ${noeud.enfants} champ${noeud.enfants > 1 ? 's' : ''} }`
}
