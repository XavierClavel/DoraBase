import { estWindows } from '../shell/plateforme'

/**
 * La frappe du modificateur de l'application, dans la syntaxe de `userEvent.keyboard`.
 *
 * **Pourquoi les tests ne peuvent pas écrire `{Meta>}` en dur.** `Meta` sous Windows est la
 * touche Windows, et aucun raccourci du produit n'y répond : une suite écrite en `{Meta>}`
 * passe sur macOS et échoue en bloc sur une machine Windows — 29 tests, mesuré le 31 août
 * 2026. Or « Windows tourne » veut aussi dire « on peut y développer », donc `pnpm test` doit
 * y être vert.
 *
 * Le pendant côté produit est `raccourci` (`shell/plateforme`) : là les **libellés**, ici les
 * **frappes**. Les deux lisent la même plateforme, et `plateforme.test.ts` est le seul endroit
 * qui épingle les chaînes littérales des deux systèmes — partout ailleurs on les demande.
 *
 * @example
 *   await userEvent.keyboard(auModificateur('n'))                       // ⌘N   / Ctrl+N
 *   await userEvent.keyboard(auModificateur('{Shift>}N{/Shift}'))       // ⇧⌘N  / Ctrl+Shift+N
 */
export function auModificateur(sequence: string): string {
  const touche = estWindows() ? 'Control' : 'Meta'
  return `{${touche}>}${sequence}{/${touche}}`
}
