import type { ReactNode } from 'react'
import styles from './SqlColore.module.css'

/**
 * Du SQL coloré, découpé par une seule expression rationnelle.
 *
 * **Quatre couleurs, et ce sont celles du handoff** : mots-clés `--syn-keyword`, chaînes
 * `--syn-string`, nombres `--syn-number`, délimiteurs de transaction `--syn-comment`. Les quatre
 * jetons existent depuis `02`.
 *
 * **Distinct de `JsonColore` (`10f`).** Les jetons d'un JSON et
 * ceux d'un SQL n'ont rien de commun ; un composant générique serait une abstraction pour deux
 * usages, et il faudrait la lire pour comprendre l'un ou l'autre.
 *
 * Un analyseur complet serait du gâchis, pour la même raison qu'en `10f` : le texte vient du moteur
 * (`preview_updates`, ou `TableDetail.ddl` en `14c`), donc il est déjà valide et normalisé. On colore
 * ce que ces formes produisent.
 */
export function SqlColore({ texte, jeu = 'ecriture' }: { texte: string; jeu?: Jeu }) {
  return <pre className={styles.root}>{decouper(texte, jeu)}</pre>
}

/**
 * Le vocabulaire coloré.
 *
 * **Deux jeux, un composant.** Les quatre classes de jetons sont les mêmes — mots-clés, chaînes,
 * nombres, atténué ; seule la liste des mots change, et le rôle de la quatrième classe avec elle
 * (les bornes de transaction pour `ecriture`, les commentaires `--` pour `ddl`). Deux composants
 * auraient dupliqué le découpage et la feuille de style pour une liste de mots.
 *
 * L'entête de ce fichier disait qu'un composant paramétré par une grammaire serait une abstraction
 * de trop ; ce n'en est pas une — ce n'est pas une grammaire, c'est un lexique, et le reste est
 * partagé mot pour mot.
 */
export type Jeu = 'ecriture' | 'ddl'

// L'ordre compte. `BEGIN` et `COMMIT` sont reconnus **avant** les autres mots-clés : ce sont des
// mots-clés aussi, et l'alternative générique les capterait la première, leur ôtant la teinte qui
// les distingue dans le mockup — ce sont les bornes de la transaction, pas des instructions.
const JETONS =
  /\b(BEGIN|COMMIT|ROLLBACK)\b|\b(UPDATE|SET|WHERE|AND|OR|NULL|INSERT|INTO|VALUES|DELETE|FROM)\b|('(?:[^']|'')*')|(\b\d+\.?\d*\b)/g

// Le jeu du DDL (`14c`). La première alternative capte les commentaires `--` plutôt que les bornes
// de transaction : un `CREATE TABLE` n'en a pas, et `pg_dump` comme `06c` terminent par une ligne
// de commentaire qui donne le compte de lignes et la taille.
//
// **Insensible à la casse**, contrairement au jeu d'écriture : celui-là colore un texte que
// DoraBase a produit en majuscules, celui-ci un texte du catalogue, qui est en minuscules.
const JETONS_DDL =
  /(--[^\n]*)|\b(create|table|index|unique|constraint|primary|foreign|key|references|check|generated|identity|always|default|not|null|using|on|delete|update|cascade|restrict|no|action|as|by|asc|desc|in|and|or|collate|with|partition|inherits|comment|is)\b|('(?:[^']|'')*')|(\b\d+\.?\d*\b)/gi

function decouper(texte: string, jeu: Jeu): ReactNode[] {
  const morceaux: ReactNode[] = []
  let curseur = 0
  let rang = 0

  for (const trouve of texte.matchAll(jeu === 'ddl' ? JETONS_DDL : JETONS)) {
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
