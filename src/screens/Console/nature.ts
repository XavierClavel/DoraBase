/**
 * La nature d'une requête, pour décider s'il faut confirmer avant d'exécuter (`12c`).
 *
 * **Ce n'est pas un garde-fou de sécurité.** Un utilisateur qui veut écrire écrira, et une console
 * est faite pour ça. C'est un garde-fou contre la **faute de frappe** — le `where` oublié, le
 * `delete` lancé dans la mauvaise console — qui est le vrai risque d'une console.
 *
 * **La reconnaissance est syntaxique, donc approximative, et volontairement large** : demander une
 * confirmation de trop est un inconfort, manquer un `drop` ne l'est pas. Elle peut donc se déclencher
 * sur une requête inoffensive dont une chaîne contient le mot `delete`.
 *
 * Côté écran et non côté moteur, contrairement à la génération de SQL : il ne s'agit pas de composer
 * du SQL — ce que le front ne doit pas faire — mais de **classer un texte** pour décider d'afficher
 * une modale. Un aller-retour vers le moteur avant chaque confirmation ajouterait une latence là où
 * l'utilisateur attend une réponse immédiate.
 */
export type Nature =
  | { kind: 'lecture' }
  /** Écrit des données : `insert`, `update`, `delete`, `truncate`. */
  | { kind: 'ecriture'; instruction: string }
  /** Modifie le schéma : `drop`, `alter`, `create`, `grant`. Le plus coûteux à défaire. */
  | { kind: 'schema'; instruction: string }

/** Vrai quand la requête mérite une confirmation. */
export function demandeConfirmation(nature: Nature): boolean {
  return nature.kind !== 'lecture'
}

const ECRITURE = ['insert', 'update', 'delete', 'truncate', 'merge', 'copy']
const SCHEMA = ['drop', 'alter', 'create', 'grant', 'revoke', 'reindex', 'vacuum', 'cluster']

/**
 * Classe une requête d'après son premier mot significatif.
 *
 * **Les commentaires sont retirés d'abord.** Un `-- delete tout` en tête ferait croire à une écriture,
 * et surtout un `/* … *\/` en préambule masquerait le vrai premier mot — ce qui est le cas dangereux :
 * une requête classée « lecture » par erreur passerait sans confirmation.
 */
export function natureDe(sql: string): Nature {
  const nu = sansCommentaires(sql).trim().toLowerCase()
  const premier = nu.split(/[\s(;]+/)[0] ?? ''

  // `with … delete from` et `with … insert` existent en PostgreSQL : le premier mot est `with`, mais
  // la requête écrit. On regarde donc aussi la suite, ce qui est exactement le genre de cas qu'une
  // reconnaissance « premier mot seulement » laisserait passer.
  const mots = premier === 'with' ? nu : premier

  const trouve = (liste: readonly string[]) =>
    liste.find((mot) => (mots === nu ? new RegExp(`\\b${mot}\\b`).test(nu) : mots === mot))

  const schema = trouve(SCHEMA)
  if (schema) return { kind: 'schema', instruction: schema.toUpperCase() }
  const ecriture = trouve(ECRITURE)
  if (ecriture) return { kind: 'ecriture', instruction: ecriture.toUpperCase() }
  return { kind: 'lecture' }
}

/**
 * Vrai quand la requête modifie des lignes **sans `where`** — le cas le plus coûteux.
 *
 * Un `update` ou un `delete` sans clause de restriction touche toute la table. C'est la faute que
 * cette confirmation existe pour attraper, et elle mérite d'être nommée séparément : « UPDATE sans
 * WHERE » dit à l'utilisateur *quoi* vérifier, là où « UPDATE » ne dit que ce qu'il a tapé.
 */
export function sansRestriction(sql: string): boolean {
  const nu = sansCommentaires(sql).trim().toLowerCase()
  const nature = natureDe(sql)
  if (nature.kind !== 'ecriture') return false
  if (!['UPDATE', 'DELETE'].includes(nature.instruction)) return false
  return !/\bwhere\b/.test(nu)
}

/**
 * Le SQL débarrassé de ses commentaires, **pour l'analyse seulement**.
 *
 * Jamais pour l'exécution : c'est le texte de l'utilisateur qui part, commentaires compris.
 */
function sansCommentaires(sql: string): string {
  return (
    sql
      // Les blocs `/* … */` d'abord : ils peuvent contenir des `--`.
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
  )
}
