import type { QueryResult, Value } from '../../domain/engine'
import { formatInteger } from '../../ui/format'
import { type GridColumn, VirtualGrid } from '../../ui/VirtualGrid/VirtualGrid'
import { estNumerique, rendreValeur } from '../TableView/cellule'
import styles from './ConsoleResult.module.css'

type ConsoleResultProps = {
  resultat: QueryResult | null
  erreur: string | null
  enCours: boolean
}

/**
 * Le résultat d'une requête de console (`12c`) : la grille, et les chiffres qui l'accompagnent.
 *
 * **La grille est celle de `10a`**, pas une seconde. Elle attend des colonnes décrites par
 * `ColumnInfo` ; une requête libre n'a que des noms et des valeurs, d'où la reconstitution ci-dessous
 * — dupliquer la grille pour lui donner une autre entrée serait deux grilles à maintenir, et deux
 * densités qui divergeraient au premier réglage.
 */
export function ConsoleResult({ resultat, erreur, enCours }: ConsoleResultProps) {
  // **L'erreur passe avant tout le reste**, y compris un résultat précédent encore en mémoire :
  // l'afficher à côté d'une erreur le ferait lire comme le résultat de la requête qui vient
  // d'échouer — la lecture la plus naturelle, et la plus fausse.
  if (erreur !== null) {
    return (
      <div className={styles.root}>
        {/* Le message du serveur, **entier** : c'est lui qui dit où est la faute. L'abréger pour
            tenir dans une ligne enlèverait la position, qui est le plus utile. */}
        <p className={styles.erreur} role="alert">
          {erreur}
        </p>
      </div>
    )
  }

  if (enCours) {
    return (
      <div className={styles.root}>
        <p className={styles.attente}>Exécution…</p>
      </div>
    )
  }

  if (resultat === null) {
    return (
      <div className={styles.root}>
        <p className={styles.vide}>Aucun résultat : exécutez une requête.</p>
      </div>
    )
  }

  // **La grille de `10a`, avec ses colonnes décrites comme elle l'attend.** Une requête libre n'a que
  // des noms et des valeurs ; la largeur et l'alignement se déduisent donc du résultat lui-même.
  const colonnes: GridColumn<readonly Value[]>[] = resultat.columns.map((nom, index) => ({
    key: nom,
    header: nom,
    // Une largeur unique : sans catalogue, rien ne dit qu'une colonne est plus large qu'une autre, et
    // la mesurer sur les valeurs demanderait de les parcourir toutes — ce que `10a` évite justement.
    width: 160,
    // L'alignement suit le **genre de la première valeur**, seule information disponible pour une
    // colonne calculée : `count(*)` n'existe dans aucun catalogue.
    numeric: estNumerique(resultat.rows[0]?.[index] ?? { kind: 'null' }),
    cell: (ligne) => rendreValeur(ligne[index] ?? { kind: 'null' }),
  }))

  return (
    <div className={styles.root}>
      <div className={styles.grille}>
        <VirtualGrid
          label={`Résultat de la requête, ${resultat.rows.length} ligne${
            resultat.rows.length > 1 ? 's' : ''
          }`}
          columns={colonnes}
          rows={resultat.rows}
          rowId={(_, index) => String(index)}
          viewportHeight={320}
          empty={<span>La requête n’a rendu aucune ligne.</span>}
        />
      </div>
      <div className={styles.barre} role="status" aria-label="État du résultat">
        <span className={styles.compte}>
          {formatInteger(resultat.rows.length)} ligne{resultat.rows.length > 1 ? 's' : ''}
        </span>
        <span>·</span>
        <span>{resultat.durationMs} ms</span>
        {resultat.appliedLimit !== null && (
          <>
            <span>·</span>
            {/* **La limite ajoutée est dite.** Une limite silencieuse ferait croire à une table de
                mille lignes — un mensonge sur les données, la pire catégorie de défaut pour cet
                outil. Le mot « par DoraBase » distingue cette limite de celle qu'on aurait écrite. */}
            <span className={styles.limite}>limité à {resultat.appliedLimit} par DoraBase</span>
          </>
        )}
      </div>
    </div>
  )
}
