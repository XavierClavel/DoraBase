import type { ReactNode } from 'react'
import styles from './JsonColore.module.css'

/**
 * Du JSON coloré, découpé par une seule expression rationnelle.
 *
 * **Quatre couleurs, et ce sont celles du handoff** : clés `--json-key`, chaînes
 * `--json-string`, nombres et booléens `--json-number`, ponctuation `--json-punct`. Elles
 * existent dans `tokens.json` depuis `02` et n'avaient jamais servi.
 *
 * Un analyseur complet serait du gâchis : le texte vient de `JSON.stringify`, donc il est déjà
 * valide et normalisé. Ce qu'il faut colorer, c'est ce que cette forme produit — rien d'autre.
 */
export function JsonColore({ texte }: { texte: string }) {
  return <pre className={styles.root}>{decouper(texte)}</pre>
}

// L'ordre des alternatives compte : une clé est une chaîne **suivie de deux-points**, donc elle
// doit être reconnue avant la chaîne nue. L'inverse colorerait toutes les clés en chaînes.
const JETONS =
  /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*|true|false|null)|([{}[\],])/g

function decouper(texte: string): ReactNode[] {
  const morceaux: ReactNode[] = []
  let curseur = 0
  let rang = 0

  for (const trouve of texte.matchAll(JETONS)) {
    const debut = trouve.index
    if (debut > curseur) morceaux.push(texte.slice(curseur, debut))

    const [entier, cle, chaine, nombre, ponctuation] = trouve
    const classe = cle
      ? styles.cle
      : chaine
        ? styles.chaine
        : nombre
          ? styles.nombre
          : ponctuation
            ? styles.ponctuation
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
