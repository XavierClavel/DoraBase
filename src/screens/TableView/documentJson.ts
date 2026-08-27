import type { ColumnInfo, Value } from '../../domain/engine'
import type { useT } from '../../i18n/LanguageContext'
import {
  estEditableALAjout,
  type ModificationDeCellule,
  raisonDuRefus,
  type Saisie,
} from './modifications'

type Traduire = ReturnType<typeof useT>

/**
 * Le repli de ce module, en français — même arbitrage que `modifications.ts` : `t` est optionnel
 * pour que `documentJson.test.ts` n'ait pas à en passer un à chaque appel, et seul l'appelant réel
 * (`TableView`) a besoin de la vraie traduction.
 */
const traduireEnFrancais: Traduire = (cle, parametres = {}) => {
  switch (cle) {
    case 'tableView.documentJson.invalidJson':
      return `JSON invalide : ${parametres.message}`
    case 'tableView.documentJson.mustBeObject':
      return 'Le document doit être un objet JSON, entre accolades.'
    // Les deux mêmes clés que `modifications.ts` — `raisonDuRefus` est appelée avec **ce** repli
    // par défaut quand l'appelant n'en fournit aucun, et le sien ne serait alors jamais atteint.
    case 'tableView.grid.primaryKeyColumnReason':
      return `${parametres.column} identifie la ligne : la modifier déplacerait la ligne à mettre à jour.`
    case 'tableView.grid.binaryReason':
      return `${parametres.column} est binaire : sa valeur ne se saisit pas au clavier.`
    default:
      return cle
  }
}

/**
 * L'édition d'un document NoSQL en JSON, en fonctions **pures** — comme `modifications.ts`.
 *
 * **Aucun changement de contrat côté moteur.** Le JSON édité n'est jamais envoyé tel quel : il est
 * comparé au document d'origine, et chaque champ de premier niveau qui change devient une
 * `ModificationDeCellule` ordinaire — la même que produirait une cellule éditée une à une. La
 * console d'édition JSON n'est donc qu'une **autre façon de saisir** les modifications déjà
 * comprises par `retenir`, `useSqlPrevu` et `apply_changes` ; elle ne leur ajoute rien à
 * comprendre.
 *
 * **Une valeur imbriquée voyage en texte JSON**, exactement comme une colonne de catégorie `json`
 * éditée cellule par cellule (voir `texteBrutDe` dans `modifications.ts`) : le contrat ne connaît
 * que du texte, jamais de type. Éditer `adresse` en entier dans le document produit donc la même
 * écriture que l'aurait produite une cellule `adresse` où l'on aurait tapé le même texte.
 */

/**
 * La ligne en objet JSON, telle qu'elle se recopie et telle qu'elle se réédite.
 *
 * **Les mêmes limites que l'onglet JSON du panneau de ligne** (`RowPanel`) : seules les colonnes
 * déduites par échantillonnage apparaissent. Un champ du document réel qui n'a pas été échantillonné
 * reste invisible ici comme partout ailleurs dans la grille — ce n'est pas une régression propre à
 * l'éditeur, c'est la limite déjà assumée de `18d`.
 */
export function documentJson(columns: readonly ColumnInfo[], ligne: readonly Value[]): string {
  const objet: Record<string, unknown> = {}
  columns.forEach((colonne, index) => {
    objet[colonne.name] = brutDe(ligne[index])
  })
  return JSON.stringify(objet, null, 2)
}

/** Une `Value` de la base, réduite à ce que `JSON.stringify` sait écrire. */
export function brutDe(valeur: Value | undefined): unknown {
  if (!valeur) return null
  switch (valeur.kind) {
    case 'null':
      return null
    case 'bool':
    case 'int':
    case 'float':
    case 'text':
    case 'timestamp':
      return valeur.value
    // **En chaîne, et c'est voulu** : un décimal exact ne se représente pas en nombre JSON sans
    // perte, et JSON n'a pas de type décimal. Le rendre en `number` transformerait
    // `12345678.91` en `12345678.909999999`.
    case 'decimal':
      return valeur.value
    case 'json':
      // Réinjecté tel quel quand il est analysable : imbriquer une chaîne de JSON dans du JSON
      // produirait un objet doublement échappé, illisible et non recollable.
      try {
        return JSON.parse(valeur.value)
      } catch {
        return valeur.value
      }
    case 'binary':
      return { base64: valeur.base64 }
  }
}

/** La `Saisie` d'une valeur JSON — le pendant de `texteBrutDe`, mais pour du JSON déjà analysé. */
export function saisieDeJson(valeur: unknown): Saisie {
  if (valeur === null) return { kind: 'null' }
  if (typeof valeur === 'string') return { kind: 'texte', texte: valeur }
  return { kind: 'texte', texte: JSON.stringify(valeur) }
}

export type DocumentParse =
  | { ok: true; valeur: Record<string, unknown> }
  | { ok: false; erreur: string }

/**
 * Analyse le texte saisi, et vérifie que c'est bien **un objet** — un tableau ou une valeur nue à
 * la racine n'a pas de champs à comparer au document d'origine.
 */
export function documentDepuisTexte(
  texte: string,
  t: Traduire = traduireEnFrancais,
): DocumentParse {
  let analyse: unknown
  try {
    analyse = JSON.parse(texte)
  } catch (erreur) {
    return {
      ok: false,
      erreur: t('tableView.documentJson.invalidJson', { message: messageDErreur(erreur) }),
    }
  }
  if (analyse === null || typeof analyse !== 'object' || Array.isArray(analyse)) {
    return { ok: false, erreur: t('tableView.documentJson.mustBeObject') }
  }
  return { ok: true, valeur: analyse as Record<string, unknown> }
}

function messageDErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}

export type DiffDocument =
  | { ok: true; modifications: readonly Omit<ModificationDeCellule, 'sorte'>[] }
  | { ok: false; erreur: string }

/**
 * Compare le document édité au document lu, et rend une `ModificationDeCellule` par champ de
 * premier niveau qui change — ajouté, changé ou retiré.
 *
 * **Retiré devient un `NULL` demandé**, jamais une chaîne vide : c'est le même geste que `⌥⌫` sur
 * une cellule, et il traverse jusqu'à `$unset` côté MongoDB (`18f`) — voir `mise_a_jour` dans
 * `documents.rs`. Un champ absent du document édité ne peut pas vouloir dire autre chose que « je
 * ne veux plus de ce champ ».
 *
 * **Refuse plutôt que d'ignorer** un changement sur une colonne que `raisonDuRefus` interdit déjà
 * à la cellule — clé primaire, binaire — avec le **même message** : une cellule refusée avec une
 * raison et un JSON qui l'accepterait en silence donneraient deux réponses à la même question.
 */
export function diffDocument(
  columns: readonly ColumnInfo[],
  ligne: readonly Value[],
  rang: number,
  cle: string,
  edite: Record<string, unknown>,
  t: Traduire = traduireEnFrancais,
): DiffDocument {
  const modifications: Omit<ModificationDeCellule, 'sorte'>[] = []
  const connues = new Set(columns.map((colonne) => colonne.name))

  for (const [index, colonne] of columns.entries()) {
    const avant: Value = ligne[index] ?? { kind: 'null' }
    const present = Object.hasOwn(edite, colonne.name)
    const avantCanon = JSON.stringify(brutDe(avant))
    const apresCanon = present ? JSON.stringify(edite[colonne.name] ?? null) : undefined

    if (present && apresCanon === avantCanon) continue
    if (!present && avantCanon === 'null') continue

    const refus = raisonDuRefus(colonne, t)
    if (refus !== null) return { ok: false, erreur: refus }

    modifications.push({
      cle,
      rang,
      column: colonne.name,
      avant,
      apres: present ? saisieDeJson(edite[colonne.name]) : { kind: 'null' },
    })
  }

  for (const [nom, valeur] of Object.entries(edite)) {
    if (connues.has(nom)) continue
    modifications.push({
      cle,
      rang,
      column: nom,
      avant: { kind: 'null' },
      apres: saisieDeJson(valeur),
    })
  }

  return { ok: true, modifications }
}

export type DiffCreation =
  | { ok: true; valeurs: Readonly<Record<string, Saisie>> }
  | { ok: false; erreur: string }

/**
 * Traduit un document saisi en JSON vers les valeurs d'une `LigneAjoutee` — le pendant de
 * `diffDocument`, mais pour le `+` d'une base NoSQL (`18g`).
 *
 * **La clé primaire s'y saisit**, à l'inverse de `diffDocument` : c'est la même règle qu'à l'ajout
 * cellule par cellule (`estEditableALAjout`) — il n'y a aucun `WHERE` à déplacer pour une ligne qui
 * n'existe pas encore.
 */
export function diffCreation(
  columns: readonly ColumnInfo[],
  edite: Record<string, unknown>,
  t: Traduire = traduireEnFrancais,
): DiffCreation {
  const valeurs: Record<string, Saisie> = {}
  for (const [nom, valeur] of Object.entries(edite)) {
    const colonne = columns.find((c) => c.name === nom)
    // **Le même message que `raisonDuRefus`**, pour la même raison qu'en `diffDocument` : un refus
    // dit deux fois différemment donnerait l'impression de deux règles.
    if (colonne && !estEditableALAjout(colonne)) {
      return { ok: false, erreur: t('tableView.grid.binaryReason', { column: colonne.name }) }
    }
    valeurs[nom] = saisieDeJson(valeur)
  }
  return { ok: true, valeurs }
}
