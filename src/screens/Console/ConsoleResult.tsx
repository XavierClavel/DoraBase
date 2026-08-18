import { useState } from 'react'
import type { QueryPlan, QueryResult, Value } from '../../domain/engine'
import { formatInteger } from '../../ui/format'
import { SegmentedControl } from '../../ui/SegmentedControl/SegmentedControl'
import { type GridColumn, VirtualGrid } from '../../ui/VirtualGrid/VirtualGrid'
import { estNumerique, rendreValeur } from '../TableView/cellule'
import type { Dialecte } from '../Workbench/onglets'
import { ArbreJson } from './ArbreJson'
import styles from './ConsoleResult.module.css'
import { documentsDe } from './documents'
import { VueJson, VueMessages, VuePlan } from './vues'

/** Les quatre vues d'un résultat (`12e`). */
export type VueResultat = 'resultat' | 'json' | 'plan' | 'messages'

type ConsoleResultProps = {
  resultat: QueryResult | null
  erreur: string | null
  enCours: boolean
  vue?: VueResultat
  onVueChange?: (vue: VueResultat) => void
  /** Le plan de la requête courante, ou `null` tant qu'il n'a pas été demandé. */
  plan?: QueryPlan | null
  planEnCours?: boolean
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
  plan = null,
  planEnCours = false,
  dialecte = 'sql',
  rowHeight,
}: ConsoleResultProps) {
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

  const mongo = dialecte === 'mongo'

  const onglets = onVueChange && (
    <div className={styles.vues}>
      <SegmentedControl
        label="Vue du résultat"
        segments={[
          {
            value: 'resultat' as const,
            // « Documents » et non « Résultat » : c'est ce que la vue contient, et le mot dit du
            // même coup que ce n'est pas une grille de lignes.
            label: mongo ? 'Documents' : 'Résultat',
            count: resultat.rows.length,
          },
          // **Pas d'onglet « JSON » en mongo** : la vue « Documents » *est* du JSON. Deux onglets
          // pour la même chose feraient chercher la différence.
          ...(mongo ? [] : [{ value: 'json' as const, label: 'JSON' }]),
          { value: 'plan' as const, label: 'Plan' },
          { value: 'messages' as const, label: 'Messages' },
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
        <Barre resultat={resultat} plan={plan} dialecte={dialecte} />
      </div>
    )
  }

  if (vue !== 'resultat') {
    return (
      <div className={styles.root}>
        {onglets}
        <div className={styles.panneau}>
          {vue === 'json' && <VueJson resultat={resultat} rang={rangChoisi} />}
          {vue === 'plan' && <VuePlan plan={plan} enCours={planEnCours} />}
          {vue === 'messages' && <VueMessages resultat={resultat} />}
        </div>
        <Barre resultat={resultat} plan={plan} dialecte={dialecte} />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {onglets}
      <div className={styles.grille}>
        <VirtualGrid
          rowHeight={rowHeight}
          label={`Résultat de la requête, ${resultat.rows.length} ligne${
            resultat.rows.length > 1 ? 's' : ''
          }`}
          columns={colonnes}
          rows={resultat.rows}
          rowId={(_, index) => String(index)}
          selectedId={rangChoisi === null ? null : String(rangChoisi)}
          onSelect={(_, index) => setRangChoisi(index)}
          viewportHeight={320}
          empty={<span>La requête n’a rendu aucune ligne.</span>}
        />
      </div>
      <Barre resultat={resultat} plan={plan} dialecte={dialecte} />
    </div>
  )
}

/** La barre de chiffres, partagée par les quatre vues — ils décrivent la même exécution. */
function Barre({
  resultat,
  plan,
  dialecte,
}: {
  resultat: QueryResult
  plan: QueryPlan | null
  dialecte: Dialecte
}) {
  // « 4 docs · 61 ms », le pied du mockup d'`A8`. Compter des « lignes » sous un arbre de documents
  // nommerait la mauvaise chose.
  const unite = dialecte === 'mongo' ? 'doc' : 'ligne'
  return (
    <div className={styles.barre} role="status" aria-label="État du résultat">
      <span className={styles.compte}>
        {formatInteger(resultat.rows.length)} {unite}
        {resultat.rows.length > 1 ? 's' : ''}
      </span>
      <span>·</span>
      <span>{resultat.durationMs} ms</span>
      {plan !== null && (
        <>
          <span>·</span>
          {/* Le temps du plan, distinct de celui de la requête : le mockup les montre côte à côte,
                et les confondre ferait croire qu'expliquer coûte le prix d'exécuter. */}
          <span>plan {plan.durationMs} ms</span>
        </>
      )}
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
  )
}
