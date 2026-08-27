import type { QueryResult } from '../../domain/engine'
import { useT } from '../../i18n/LanguageContext'
import { JsonColore } from '../TableView/JsonColore'
import { texteBrutDe } from '../TableView/modifications'
import styles from './vues.module.css'

/**
 * Les deux vues qui ne sont pas la grille (`12e`) : JSON, Messages.
 *
 * Regroupées dans un fichier : chacune fait dix lignes, et deux fichiers de dix lignes se
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
  const t = useT()
  const ligne = rang === null ? null : resultat.rows[rang]
  if (!ligne) {
    return <p className={styles.invite}>{t('console.vues.jsonInvite')}</p>
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
 * Ce que le serveur a dit, et ce que DoraBase a fait (`12e`).
 *
 * **La limite ajoutée s'inscrit ici aussi**, en plus de la barre : la barre disparaît du regard, un
 * journal se relit. Et c'est là qu'on cherche pourquoi un résultat s'arrête à mille lignes.
 */
export function VueMessages({ resultat }: { resultat: QueryResult }) {
  const t = useT()
  return (
    <ul className={styles.messages}>
      <li>
        <span className={styles.horodatage}>{t('console.vues.execute')}</span>
        {t('console.vues.dureeEtLignes', { ms: resultat.durationMs, n: resultat.rows.length })}
      </li>
      {resultat.appliedLimit !== null && (
        <li className={styles.notable}>
          <span className={styles.horodatage}>{t('console.vues.dorabase')}</span>{' '}
          {t('console.vues.aAjoute')} <code>limit {resultat.appliedLimit}</code> :{' '}
          {t('console.vues.neEnPortaitPas')}
        </li>
      )}
      <li className={styles.sql}>{resultat.sql}</li>
      {/* Les `NOTICE` du serveur viendront ici : `tokio_postgres` les expose par un canal séparé de
          la requête, ce qui demande de les capter à la connexion — hors périmètre de `12e`, et dit
          plutôt que tu. */}
      <li className={styles.absent}>
        {t('console.vues.avisServeurAvant')}
        <code>NOTICE</code>
        {t('console.vues.avisServeurMilieu')}
        <code>WARNING</code>
        {t('console.vues.avisServeurApres')}
      </li>
    </ul>
  )
}
