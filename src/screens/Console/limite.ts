/**
 * Le `limit` final d'une requête de console — le lire, l'écrire — en fonctions **pures**.
 *
 * C'est ce qui rend le stepper `LIMIT` de la barre (le même que celui d'`A5`) **bidirectionnel** :
 * il affiche ce que la requête porte, et ses flèches l'écrivent dans la requête. Même arbitrage de
 * lecture qu'`alias.ts` et `projection.ts` — par lecture, pas par analyse syntaxique, et le refus
 * (`null`) est la direction sûre : l'appelant laisse alors la requête telle quelle.
 *
 * **Seul le `limit` qui termine l'instruction compte.** Celui d'une sous-requête est suivi d'une
 * parenthèse ou d'autre chose, jamais de la fin du texte. Un script de plusieurs instructions
 * refuse — lecture comprise : un stepper qui afficherait la limite de la dernière instruction
 * parlerait d'autre chose que ce que la barre annonce. Limites nommées : `fetch first n rows
 * only` n'est pas lu, et une citation en dollars portant un `;` passe pour un script.
 */

import { uneSecondeInstructionSuit } from './projection'

/** Le `limit N` (et son éventuel `offset`) qui termine l'instruction, hors ponctuation finale. */
const LIMIT_FINAL = /(\blimit\s+)(\d+)(\s+offset\s+\d+)?$/i

/**
 * Où commence la ponctuation finale — blancs, `;`, commentaires — après laquelle rien d'utile ne
 * s'écrit plus. Parcourue **depuis le début**, citations lues : un `--` ou un `;` enfermé dans une
 * chaîne qui termine le texte n'est pas de la ponctuation, et repartir de la fin le prendrait pour
 * telle — c'est le chemin qui aurait inséré un `limit` au milieu d'un littéral.
 */
function debutDeLaPonctuationFinale(sql: string): number {
  let fin = 0
  let i = 0
  while (i < sql.length) {
    const c = sql[i] as string
    if (c === "'" || c === '"' || c === '`') {
      i++
      while (i < sql.length) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      fin = i
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      continue
    }
    i++
    if (!' \t\n\r;'.includes(c)) fin = i
  }
  return fin
}

/** La valeur du `limit` final de la requête, ou `null` si elle n'en porte pas (ou n'est pas lue). */
export function limiteDe(sql: string): number | null {
  if (uneSecondeInstructionSuit(sql)) return null
  const correspondance = LIMIT_FINAL.exec(sql.slice(0, debutDeLaPonctuationFinale(sql)))
  if (correspondance === null) return null
  const valeur = Number(correspondance[2])
  return Number.isSafeInteger(valeur) ? valeur : null
}

/**
 * Écrit `limite` comme `limit` final : remplace le nombre s'il y en a un — sans toucher à un
 * `offset` qui le suivrait —, l'ajoute sinon, avant le `;` et les commentaires de fin. L'ajout
 * n'est tenté que sur un `select` : un `limit` posé sur autre chose serait refusé par certains
 * moteurs et changerait le sens chez d'autres (`update … limit` en MySQL). Rend `null` quand rien
 * ne peut s'écrire — la barre laisse alors la requête telle quelle.
 */
export function poserLaLimite(sql: string, limite: number): string | null {
  if (uneSecondeInstructionSuit(sql)) return null
  const fin = debutDeLaPonctuationFinale(sql)
  const corps = sql.slice(0, fin)
  const correspondance = LIMIT_FINAL.exec(corps)
  if (correspondance !== null) {
    const debut = correspondance.index + (correspondance[1] as string).length
    return (
      sql.slice(0, debut) + String(limite) + sql.slice(debut + (correspondance[2] as string).length)
    )
  }
  if (!/^\s*select\b/i.test(corps)) return null
  // Sur sa propre ligne : la forme que l'auto-LIMIT du produit emploie déjà dans ses messages.
  return `${corps}\nlimit ${limite}${sql.slice(fin)}`
}
