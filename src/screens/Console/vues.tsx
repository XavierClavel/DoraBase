import type { QueryPlan, QueryResult } from '../../domain/engine'
import { JsonColore } from '../TableView/JsonColore'
import { texteBrutDe } from '../TableView/modifications'
import styles from './vues.module.css'

/**
 * Les trois vues qui ne sont pas la grille (`12e`) : JSON, Plan, Messages.
 *
 * Regroupées dans un fichier : chacune fait dix lignes, et trois fichiers de dix lignes se
 * chercheraient plus longtemps qu'ils ne se liraient.
 */

/**
 * La ligne sélectionnée en JSON.
 *
 * **La ligne, pas le résultat entier.** Sérialiser mille lignes pour l'affichage contredirait la
 * contrainte transverse du projet — aucun résultat complet ne traverse ni l'IPC ni le rendu. La vue
 * suit donc la sélection, comme le panneau de `10f`.
 */
export function VueJson({ resultat, rang }: { resultat: QueryResult; rang: number | null }) {
  const ligne = rang === null ? null : resultat.rows[rang]
  if (!ligne) {
    return <p className={styles.invite}>Sélectionnez une ligne du résultat pour la voir en JSON.</p>
  }

  // Les valeurs **brutes**, non formatées : un JSON qui porterait « 12 900 » avec une espace
  // insécable ne serait pas du JSON valide, et c'est censé être copiable.
  const objet = Object.fromEntries(
    resultat.columns.map((nom, index) => {
      const valeur = ligne[index]
      if (!valeur || valeur.kind === 'null') return [nom, null]
      if (valeur.kind === 'int' || valeur.kind === 'float') return [nom, valeur.value]
      if (valeur.kind === 'bool') return [nom, valeur.value]
      return [nom, texteBrutDe(valeur)]
    }),
  )

  return <JsonColore texte={JSON.stringify(objet, null, 2)} />
}

/**
 * Le plan d'exécution, **estimé**.
 *
 * `EXPLAIN` et non `EXPLAIN ANALYZE` : ce dernier exécute la requête pour la mesurer, et sur une
 * console où l'on écrit aussi, « Expliquer » deviendrait un bouton qui écrit. La vue le dit — un plan
 * dont on croirait les temps réels ferait prendre des décisions sur des chiffres qui n'en sont pas.
 */
export function VuePlan({ plan, enCours }: { plan: QueryPlan | null; enCours: boolean }) {
  if (enCours) return <p className={styles.invite}>Lecture du plan…</p>
  if (!plan) {
    return <p className={styles.invite}>Cliquez « Expliquer » pour voir le plan d’exécution.</p>
  }

  return (
    <div className={styles.plan}>
      <p className={styles.estime}>
        Coûts <strong>estimés</strong> : la requête n’a pas été exécutée.
      </p>
      <pre className={styles.texte}>{plan.lines.join('\n')}</pre>
    </div>
  )
}

/**
 * Ce que le serveur a dit, et ce que DoraBase a fait (`12e`).
 *
 * **La limite ajoutée s'inscrit ici aussi**, en plus de la barre : la barre disparaît du regard, un
 * journal se relit. Et c'est là qu'on cherche pourquoi un résultat s'arrête à mille lignes.
 */
export function VueMessages({ resultat }: { resultat: QueryResult }) {
  return (
    <ul className={styles.messages}>
      <li>
        <span className={styles.horodatage}>exécuté</span> en {resultat.durationMs} ms,{' '}
        {resultat.rows.length} ligne{resultat.rows.length > 1 ? 's' : ''} rendue
        {resultat.rows.length > 1 ? 's' : ''}
      </li>
      {resultat.appliedLimit !== null && (
        <li className={styles.notable}>
          <span className={styles.horodatage}>DoraBase</span> a ajouté{' '}
          <code>limit {resultat.appliedLimit}</code> : la requête n’en portait pas.
        </li>
      )}
      <li className={styles.sql}>{resultat.sql}</li>
      {/* Les `NOTICE` du serveur viendront ici : `tokio_postgres` les expose par un canal séparé de
          la requête, ce qui demande de les capter à la connexion — hors périmètre de `12e`, et dit
          plutôt que tu. */}
      <li className={styles.absent}>
        Les avis du serveur (<code>NOTICE</code>, <code>WARNING</code>) ne sont pas encore captés.
      </li>
    </ul>
  )
}
