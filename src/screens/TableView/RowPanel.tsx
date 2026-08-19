import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { ColumnInfo, DatabaseKey, Relation, Value } from '../../domain/engine'
import { cx } from '../../ui/cx'
import type { PasserelleDetail } from '../Workbench/useDetailTable'
import { rendreValeur } from './cellule'
import { JsonColore } from './JsonColore'
import { relationDe, valeurDeCle } from './ligneLiee'
import styles from './RowPanel.module.css'
import { useLigneLiee } from './useLigneLiee'
import type { PasserelleLignes } from './useLignes'

type Onglet = 'champs' | 'json' | 'liens'

type RowPanelProps = {
  cle: DatabaseKey
  columns: readonly ColumnInfo[]
  relations: readonly Relation[]
  /** La ligne sélectionnée, `null` quand il n'y en a pas. */
  ligne: readonly Value[] | null
  /**
   * Son rang dans la fenêtre, à partir de 1. **Il ne s'affiche plus** — il sert à nommer le panneau
   * pour un lecteur d'écran, et à savoir qu'une ligne est bien sélectionnée.
   */
  rang: number | null
  /** Le SQL d'insertion, demandé au moteur. `null` quand la commande n'est pas disponible. */
  onCopyInsert?: () => void
  passerelleDetail: PasserelleDetail
  passerelleLignes: PasserelleLignes
}

/**
 * Le panneau droit de `A5` : la ligne sélectionnée en clé-valeur, ses onglets, sa ligne liée.
 *
 * **Il n'a plus d'en-tête.** Son titre « Ligne 5 · id 041ff6ac… » répétait le rang déjà lisible dans
 * la gouttière `#` de la grille et l'identifiant déjà lisible trois centimètres plus bas, et son
 * identifiant long poussait les flèches hors de la barre. Les flèches, elles, sont remontées dans le
 * cadre de la colonne (`22`) : deux barres de chrome empilées là où la capture n'en montre qu'une
 * auraient été le prix de les garder ici.
 *
 * **Les trois onglets ne sont pas trois vues du même contenu.** Champs rend les colonnes dans
 * l'ordre du catalogue ; JSON rend la ligne entière en objet, ce qui sert à la recopier ; Liens
 * rend les relations de la **table**, et c'est le seul des trois qui ne dépend pas de la ligne
 * sélectionnée.
 */
export function RowPanel({
  cle,
  columns,
  relations,
  ligne,
  rang,
  onCopyInsert,
  passerelleDetail,
  passerelleLignes,
}: RowPanelProps) {
  const [onglet, setOnglet] = useState<Onglet>('champs')

  // La première clé étrangère de la ligne, et sa valeur. Le mockup n'en montre qu'une, et rien
  // ne dit comment il en présenterait plusieurs — trou consigné dans la spec.
  const colonneFk = columns.find((colonne) => relationDe(relations, colonne.name))
  const relation = colonneFk ? relationDe(relations, colonneFk.name) : undefined
  const valeurFk = colonneFk ? valeurDeCle(ligne?.[columns.indexOf(colonneFk)] ?? undefined) : null

  const apercu = useLigneLiee(
    ligne ? cle : null,
    relation,
    valeurFk,
    passerelleDetail,
    passerelleLignes,
  )

  // **Rien plutôt qu'une phrase.** Sans ligne sélectionnée, ce panneau affichait « Sélectionnez une
  // ligne pour en voir le détail. » ; l'en-tête permanent du cadre rend la colonne lisible sans elle,
  // et une phrase qui décrit un geste évident finit par se lire comme du remplissage (`22`).
  if (!ligne || rang === null) return null

  return (
    <aside className={styles.root} aria-label={`Détail de la ligne ${rang}`}>
      <div className={styles.onglets} role="tablist" aria-label="Vues de la ligne">
        {(
          [
            { id: 'champs', label: 'Champs', icon: 'cols' },
            { id: 'json', label: 'JSON', icon: 'json' },
            { id: 'liens', label: 'Liens', icon: 'link' },
          ] as const
        ).map((vue) => (
          <button
            key={vue.id}
            type="button"
            role="tab"
            aria-selected={onglet === vue.id}
            className={cx(styles.onglet, onglet === vue.id && styles.ongletActif)}
            onClick={() => setOnglet(vue.id)}
          >
            <Icon name={vue.icon} size={12} strokeWidth={2} />
            {vue.label}
          </button>
        ))}
      </div>

      <div className={styles.corps}>
        {onglet === 'champs' && (
          <dl className={styles.champs}>
            {columns.map((colonne, index) => (
              <div key={colonne.name} className={styles.champ}>
                <dt className={styles.etiquette}>{colonne.name}</dt>
                <dd className={styles.valeur}>{rendreValeur(ligne[index] ?? { kind: 'null' })}</dd>
                {colonne.key === 'primary' && (
                  <Icon name="key" size={11} strokeWidth={2} className={styles.cle} />
                )}
                {colonne.key === 'foreign' && (
                  <Icon name="fk" size={11} strokeWidth={2} className={styles.fk} />
                )}
              </div>
            ))}
          </dl>
        )}

        {onglet === 'json' && (
          <div className={styles.json}>
            {/* **Une icône seule, posée sur le JSON.** Le bouton du DDL porte son libellé « Copier »
                dans une barre qui lui est propre ; ici il n'y a pas de barre — le JSON occupe tout
                l'onglet — et en ajouter une prendrait 34 px des 296 de la colonne pour un mot. Le nom
                accessible, lui, est complet : une icône ne s'annonce pas. */}
            <button
              type="button"
              className={styles.copierJson}
              aria-label="Copier le JSON de la ligne"
              title="Copier le JSON de la ligne"
              onClick={() => void navigator.clipboard?.writeText(jsonDe(columns, ligne))}
            >
              <Icon name="copy" size={12} strokeWidth={2.2} />
            </button>
            <JsonColore texte={jsonDe(columns, ligne)} />
          </div>
        )}

        {onglet === 'liens' &&
          (relations.length === 0 ? (
            <p className={styles.vide}>Aucune clé étrangère.</p>
          ) : (
            <ul className={styles.liens}>
              {relations.map((r) => (
                <li
                  key={r.constraintName}
                  className={r.direction === 'incoming' ? styles.entrante : undefined}
                >
                  <Icon name="fk" size={12} strokeWidth={2} />
                  {r.direction === 'outgoing'
                    ? `${r.columns.join(', ')} → ${r.targetTable}.${r.targetColumns.join(', ')}`
                    : `${r.targetTable}.${r.targetColumns.join(', ')} → ${r.columns.join(', ')}`}
                </li>
              ))}
            </ul>
          ))}

        {/* **La règle du handoff, appliquée telle qu'elle est écrite.** L'aperçu n'apparaît que si
            la table cible porte un champ de la liste blanche ; sinon, rien — pas de dump
            d'identifiants techniques. La légende nomme les champs réellement détectés. */}
        {onglet === 'champs' && apercu && (
          <section className={styles.liee}>
            <h3 className={styles.lieeTitre}>
              Ligne liée · {apercu.table}
              <span className={styles.detectes}>
                {' '}
                — {apercu.champs.map((c) => c.name).join(', ')} détecté
                {apercu.champs.length > 1 ? 's' : ''}
              </span>
            </h3>
            <div className={styles.lieeCorps}>
              {apercu.champs.map((champ) => (
                <div key={champ.name}>
                  <span className={styles.lieeNom}>{champ.name} </span>
                  {champ.value}
                </div>
              ))}
            </div>
          </section>
        )}

        {onCopyInsert && (
          <button type="button" className={styles.copier} onClick={onCopyInsert}>
            <Icon name="copy" size={12} strokeWidth={2} />
            Copier la ligne en INSERT
          </button>
        )}
      </div>
    </aside>
  )
}

/**
 * La ligne en objet JSON, pour la recopier.
 *
 * Les valeurs y gardent leur **type JSON** — un nombre reste un nombre, `NULL` devient `null` —
 * là où l'onglet Champs les rend pour l'œil. Un JSON dont tout serait chaîne ne se recollerait
 * nulle part.
 */
function jsonDe(columns: readonly ColumnInfo[], ligne: readonly Value[]): string {
  const objet: Record<string, unknown> = {}
  columns.forEach((colonne, index) => {
    objet[colonne.name] = brutDe(ligne[index])
  })
  return JSON.stringify(objet, null, 2)
}

function brutDe(valeur: Value | undefined): unknown {
  if (!valeur) return null
  switch (valeur.kind) {
    case 'null':
      return null
    case 'bool':
    case 'int':
    case 'float':
    case 'text':
    case 'timestamp':
      return valeur.value
    // **En chaîne, et c'est voulu** : un décimal exact ne se représente pas en nombre JSON sans
    // perte, et JSON n'a pas de type décimal. Le rendre en `number` transformerait `12345678.91`
    // en `12345678.909999999`, dans un objet destiné à être recollé ailleurs.
    case 'decimal':
      return valeur.value
    case 'json':
      // Réinjecté tel quel quand il est analysable : imbriquer une chaîne de JSON dans du JSON
      // produirait un objet doublement échappé, illisible et non recollable.
      try {
        return JSON.parse(valeur.value)
      } catch {
        return valeur.value
      }
    case 'binary':
      return { base64: valeur.base64 }
  }
}
