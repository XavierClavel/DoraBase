import type { QueryResult, Value } from '../../domain/engine'
import { texteBrutDe } from '../TableView/modifications'

/**
 * Les documents d'un résultat mongo, reconstitués depuis les colonnes et les lignes (`13b`).
 *
 * **Pourquoi une reconstitution.** Le contrat de `06a` rend un `QueryResult` — des colonnes et des
 * lignes de `Value` — parce que c'est ce que six moteurs sur sept produisent. L'adaptateur MongoDB
 * aplatit donc ses documents (`18g`), et l'arbre de `13b` les réassemble.
 *
 * Le passage n'est **pas sans perte, et la perte est nommée** : un champ absent et un champ nul
 * arrivent tous deux en `Value::Null` (`18e`), donc le document reconstitué porte `null` là où
 * l'original n'avait rien. C'est visible dans l'arbre, et c'est la même limite que la grille.
 *
 * L'alternative — faire traverser l'IPC aux documents en BSON, en plus des lignes — doublerait ce
 * qui passe pour une seule vue.
 */
export function documentsDe(resultat: QueryResult): unknown[] {
  return resultat.rows.map((ligne) =>
    Object.fromEntries(resultat.columns.map((nom, index) => [nom, brutDe(ligne[index])])),
  )
}

/**
 * Une valeur du modèle en donnée JSON.
 *
 * **Les valeurs sont brutes, non formatées** : un nombre qui porterait « 12 900 » avec une espace
 * insécable ne serait pas du JSON valide, et l'arbre est censé être copiable. Même arbitrage que
 * `VueJson` en `12e`.
 */
function brutDe(valeur: Value | undefined): unknown {
  if (!valeur || valeur.kind === 'null') return null
  if (valeur.kind === 'int' || valeur.kind === 'float') return valeur.value
  if (valeur.kind === 'bool') return valeur.value
  // **Un document imbriqué redevient un objet**, et non une chaîne de JSON : sans cela, l'arbre
  // n'aurait rien à déplier — `livraison` s'afficherait comme une longue ligne de texte.
  if (valeur.kind === 'json') {
    try {
      return JSON.parse(valeur.value)
    } catch {
      // Un JSON illisible est rendu tel quel plutôt que perdu : c'est une donnée de la base, et la
      // masquer serait pire que l'afficher mal.
      return valeur.value
    }
  }
  return texteBrutDe(valeur)
}
