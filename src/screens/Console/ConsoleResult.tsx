import { useState } from 'react'
import type { QueryResult, Value } from '../../domain/engine'
import { useT } from '../../i18n/LanguageContext'
import { formatInteger } from '../../ui/format'
import { SegmentedControl } from '../../ui/SegmentedControl/SegmentedControl'
import { type GridColumn, VirtualGrid } from '../../ui/VirtualGrid/VirtualGrid'
import { estNumerique, rendreValeur } from '../TableView/cellule'
import type { Dialecte } from '../Workbench/onglets'
import { ArbreJson } from './ArbreJson'
import styles from './ConsoleResult.module.css'
import { documentsDe } from './documents'
import { VueJson, VueMessages } from './vues'

/** Les trois vues d'un résultat (`12e`). */
export type VueResultat = 'resultat' | 'json' | 'messages'

type ConsoleResultProps = {
  resultat: QueryResult | null
  erreur: string | null
  enCours: boolean
  vue?: VueResultat
  onVueChange?: (vue: VueResultat) => void
  /**
   * La langue de la console (`13a`).
   *
   * **En mongo, « Résultat » est l'arbre de documents, pas la grille.** Aplatir des documents
   * hétérogènes en colonnes est une décision de produit que `13b` a explicitement remise, et le
   * mockup d'`A8` ne montre pas de grille.
   */
  dialecte?: Dialecte
  /** La densité de `15c`, pour que la grille du résultat suive celle des tables. */
  rowHeight?: number
}

/**
 * Le résultat d'une requête de console (`12c`) : la grille, et les chiffres qui l'accompagnent.
 *
 * **La grille est celle de `10a`**, pas une seconde. Elle attend des colonnes décrites par
 * `ColumnInfo` ; une requête libre n'a que des noms et des valeurs, d'où la reconstitution ci-dessous
 * — dupliquer la grille pour lui donner une autre entrée serait deux grilles à maintenir, et deux
 * densités qui divergeraient au premier réglage.
 */
export function ConsoleResult({
  resultat,
  erreur,
  enCours,
  vue = 'resultat',
  onVueChange,
  dialecte = 'sql',
  rowHeight,
}: ConsoleResultProps) {
  const t = useT()
  // La ligne sélectionnée, pour la vue JSON : elle **suit la sélection**, comme le panneau de `10f`.
  // Sérialiser mille lignes pour l'affichage contredirait la contrainte transverse du projet.
  const [rangChoisi, setRangChoisi] = useState<number | null>(null)
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
        <p className={styles.attente}>{t('console.resultat.enCours')}</p>
      </div>
    )
  }

  if (resultat === null) {
    return (
      <div className={styles.root}>
        <p className={styles.vide}>{t('console.resultat.aucun')}</p>
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

  const mongo = dialecte === 'mongo'

  const onglets = onVueChange && (
    <div className={styles.vues}>
      <SegmentedControl
        label={t('console.resultat.vueLabel')}
        segments={[
          {
            value: 'resultat' as const,
            // « Documents » et non « Résultat » : c'est ce que la vue contient, et le mot dit du
            // même coup que ce n'est pas une grille de lignes.
            label: mongo ? t('console.resultat.documents') : t('console.resultat.resultat'),
            count: resultat.rows.length,
          },
          // **Pas d'onglet « JSON » en mongo** : la vue « Documents » *est* du JSON. Deux onglets
          // pour la même chose feraient chercher la différence.
          ...(mongo ? [] : [{ value: 'json' as const, label: t('console.resultat.json') }]),
          { value: 'messages' as const, label: t('console.resultat.messages') },
        ]}
        value={vue}
        onValueChange={onVueChange}
      />
    </div>
  )

  if (mongo && vue === 'resultat') {
    return (
      <div className={styles.root}>
        {onglets}
        <div className={styles.panneau}>
          <ArbreJson
            documents={documentsDe(resultat)}
            onCopier={(document: unknown) =>
              void navigator.clipboard?.writeText(JSON.stringify(document, null, 2))
            }
          />
        </div>
        <Barre resultat={resultat} dialecte={dialecte} />
      </div>
    )
  }

  if (vue !== 'resultat') {
    return (
      <div className={styles.root}>
        {onglets}
        <div className={styles.panneau}>
          {vue === 'json' && <VueJson resultat={resultat} rang={rangChoisi} />}
          {vue === 'messages' && <VueMessages resultat={resultat} />}
        </div>
        <Barre resultat={resultat} dialecte={dialecte} />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {onglets}
      <div className={styles.grille}>
        <VirtualGrid
          rowHeight={rowHeight}
          label={t('console.resultat.grilleLabel', { n: resultat.rows.length })}
          columns={colonnes}
          rows={resultat.rows}
          rowId={(_, index) => String(index)}
          selectedId={rangChoisi === null ? null : String(rangChoisi)}
          onSelect={(_, index) => setRangChoisi(index)}
          viewportHeight={320}
          empty={<span>{t('console.resultat.grilleVide')}</span>}
        />
      </div>
      <Barre resultat={resultat} dialecte={dialecte} />
    </div>
  )
}

/** La barre de chiffres, partagée par les trois vues — ils décrivent la même exécution. */
function Barre({ resultat, dialecte }: { resultat: QueryResult; dialecte: Dialecte }) {
  const t = useT()
  // « 4 docs · 61 ms », le pied du mockup d'`A8`. Compter des « lignes » sous un arbre de documents
  // nommerait la mauvaise chose.
  const compte =
    dialecte === 'mongo'
      ? t('console.resultat.compteDocuments', {
          n: resultat.rows.length,
          texte: formatInteger(resultat.rows.length),
        })
      : t('console.resultat.compteLignes', {
          n: resultat.rows.length,
          texte: formatInteger(resultat.rows.length),
        })
  return (
    <div className={styles.barre} role="status" aria-label={t('console.resultat.etatAriaLabel')}>
      <span className={styles.compte}>{compte}</span>
      <span>·</span>
      <span>{resultat.durationMs} ms</span>
      {resultat.appliedLimit !== null && (
        <>
          <span>·</span>
          {/* **La limite ajoutée est dite.** Une limite silencieuse ferait croire à une table de
                mille lignes — un mensonge sur les données, la pire catégorie de défaut pour cet
                outil. Le mot « par DoraBase » distingue cette limite de celle qu'on aurait écrite. */}
          <span className={styles.limite}>
            {t('console.resultat.limite', { n: resultat.appliedLimit })}
          </span>
        </>
      )}
    </div>
  )
}
