import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { qualifiantAvant, tablesCitees } from './alias'

/**
 * Ce que l'écran connaît déjà de la base, et qui suffit à l'autocomplétion (`12d`).
 *
 * **Aucune requête n'est envoyée pendant la frappe.** L'arbre de `09d` a les tables du schéma, et
 * `06c` les colonnes d'une table déjà ouverte : interroger le serveur à chaque caractère ajouterait
 * une latence à l'endroit le plus sensible de l'écran.
 *
 * Conséquence honnête : une table créée par un tiers depuis l'ouverture n'est pas proposée, et les
 * colonnes d'une table jamais ouverte non plus. « Rafraîchir » recharge les premières ; les secondes
 * arrivent dès qu'on ouvre la table. C'est un compromis que la latence justifie.
 */
export type Catalogue = {
  /** Les tables du schéma courant. */
  tables: readonly string[]
  /** Les colonnes connues, par nom de table. Une table absente n'a rien à proposer. */
  colonnes: Readonly<Record<string, readonly { name: string; typeName: string }[]>>
}

/**
 * Les mots-clés proposés faute de mieux.
 *
 * **Toujours sûrs** : ils existent quelle que soit la base. C'est ce qu'on propose quand un alias
 * n'est pas résolu, plutôt que d'inventer des colonnes.
 */
const MOTS_CLES = [
  'select',
  'from',
  'where',
  'group by',
  'order by',
  'having',
  'limit',
  'join',
  'left join',
  'inner join',
  'on',
  'as',
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
  'distinct',
  'count(',
  'sum(',
  'avg(',
  'min(',
  'max(',
  'coalesce(',
  'date_trunc(',
  'now()',
]

/**
 * La source de complétion de la console (`12d`).
 *
 * **Trois natures, dans cet ordre de priorité** : les colonnes d'un alias résolu, les tables du
 * schéma, les mots-clés. Un alias résolu écarte les deux autres — après `o.`, seules des colonnes ont
 * un sens.
 *
 * **Un alias non résolu ne propose aucune colonne.** Une suggestion fausse produit une requête en
 * erreur que l'utilisateur croira correcte : en cas de doute, la liste ne devine pas.
 */
export function sourceDeCompletion(catalogue: () => Catalogue) {
  return (contexte: CompletionContext): CompletionResult | null => {
    const mot = contexte.matchBefore(/[\w$.]*/)
    if (!mot) return null
    // Sans frappe explicite, on n'ouvre la liste qu'à partir d'un caractère : proposer trente entrées
    // dès le premier clic dans un éditeur vide serait du bruit.
    if (!contexte.explicit && mot.from === mot.to) return null

    const texte = contexte.state.doc.toString()
    const qualifiant = qualifiantAvant(texte, contexte.pos)
    const { tables, colonnes } = catalogue()

    if (qualifiant !== null) {
      const table = tablesCitees(texte).get(qualifiant.toLowerCase())
      const connues = table ? colonnes[table] : undefined
      // **Rien plutôt qu'une devinette** : un alias inconnu, ou une table dont les colonnes ne sont
      // pas chargées, ne donne aucune suggestion. La liste se referme, ce qui est un signal juste.
      if (!table || !connues) return null
      return {
        from: debutDuMot(texte, contexte.pos),
        options: connues.map((colonne) => ({
          label: colonne.name,
          type: 'property',
          // Le type est **affiché**, comme dans le mockup : `country char(2)`. C'est ce qui permet de
          // choisir sans aller voir la structure.
          detail: colonne.typeName,
          // Le pied de la liste dit d'où vient la suggestion — `users.country` dans le mockup.
          info: `${table}.${colonne.name}`,
        })),
      }
    }

    return {
      from: mot.from,
      options: [
        ...tables.map(
          (nom): Completion => ({ label: nom, type: 'class', detail: 'table', info: nom }),
        ),
        ...MOTS_CLES.map((mot): Completion => ({ label: mot, type: 'keyword' })),
      ],
    }
  }
}

/**
 * Le début du mot en cours **après le point**, pour que l'insertion ne duplique pas le qualifiant.
 *
 * Sans cela, compléter `o.cou` insérerait `country` à la place de `o.cou` entier et donnerait
 * `country` au lieu de `o.country`.
 */
function debutDuMot(texte: string, position: number): number {
  const avant = texte.slice(0, position)
  const apresPoint = avant.lastIndexOf('.')
  return apresPoint === -1 ? position : apresPoint + 1
}
