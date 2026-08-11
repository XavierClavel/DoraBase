import type { ReactNode } from 'react'
import styles from './SqlColore.module.css'

/**
 * Du SQL coloré, découpé par une seule expression rationnelle.
 *
 * **Quatre couleurs, et ce sont celles du handoff** : mots-clés `--syn-keyword`, chaînes
 * `--syn-string`, nombres `--syn-number`, délimiteurs de transaction `--syn-comment`. Les quatre
 * jetons existent depuis `02`.
 *
 * **Distinct de `JsonColore` (`10f`), et non paramétré par une grammaire.** Les jetons d'un JSON et
 * ceux d'un SQL n'ont rien de commun ; un composant générique serait une abstraction pour deux
 * usages, et il faudrait la lire pour comprendre l'un ou l'autre.
 *
 * Un analyseur complet serait du gâchis, pour la même raison qu'en `10f` : le texte vient du moteur
 * (`preview_updates`), donc il est déjà valide et normalisé. On colore ce que cette forme produit.
 */
export function SqlColore({ texte }: { texte: string }) {
  return <pre className={styles.root}>{decouper(texte)}</pre>
}

// L'ordre compte. `BEGIN` et `COMMIT` sont reconnus **avant** les autres mots-clés : ce sont des
// mots-clés aussi, et l'alternative générique les capterait la première, leur ôtant la teinte qui
// les distingue dans le mockup — ce sont les bornes de la transaction, pas des instructions.
const JETONS =
  /\b(BEGIN|COMMIT|ROLLBACK)\b|\b(UPDATE|SET|WHERE|AND|OR|NULL|INSERT|INTO|VALUES|DELETE|FROM)\b|('(?:[^']|'')*')|(\b\d+\.?\d*\b)/g

function decouper(texte: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  let curseur = 0
  let rang = 0

  for (const trouve of texte.matchAll(JETONS)) {
    const debut = trouve.index
    if (debut > curseur) morceaux.push(texte.slice(curseur, debut))

    const [entier, transaction, motCle, chaine, nombre] = trouve
    const classe = transaction
      ? styles.transaction
      : motCle
        ? styles.motCle
        : chaine
          ? styles.chaine
          : nombre
            ? styles.nombre
            : undefined

    morceaux.push(
      <span key={`${debut}-${rang++}`} className={classe}>
        {entier}
      </span>,
    )
    curseur = debut + entier.length
  }

  if (curseur < texte.length) morceaux.push(texte.slice(curseur))
  return morceaux
}
