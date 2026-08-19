import { Icon } from '../../design/icons/Icon'
import type { TableDetail } from '../../domain/engine'
import { SqlColore } from '../TableView/SqlColore'
import styles from './DdlPanel.module.css'

type DdlPanelProps = {
  detail: TableDetail
  schema: string
  /** Ouvre le DDL dans une console (`12a`). Absent, l'action reste désactivée avec sa raison. */
  onOuvrirDansLaConsole?: (ddl: string) => void
}

/**
 * Le DDL de la table, dans la colonne de droite (`14c`, déplacé par `22`).
 *
 * **Il vivait dans `StructureView`, en colonne de 392 px sur la droite du centre**, comme le mockup
 * d'`A9` le montre. La spec `22` unifie la colonne de droite : elle porte le détail de ce que le
 * centre affiche, donc la ligne sélectionnée en vue Données et ce DDL en vue Structure. Sorti ici, il
 * ne dépend plus de la mise en page de la structure — et la structure, débarrassée de sa colonne,
 * rejoint le partage au lieu d'occuper toute la largeur.
 *
 * **Il hérite des 296 px de la colonne**, contre les 392 du handoff. Écart assumé, consigné dans
 * `22` : c'est le prix de l'unification, et la poignée le rattrape.
 */
export function DdlPanel({ detail, schema, onOuvrirDansLaConsole }: DdlPanelProps) {
  return (
    <aside className={styles.root} aria-label={`DDL de ${schema}.${detail.name}`}>
      <div className={styles.barre}>
        <Icon name="code" size={12} strokeWidth={2} />
        DDL
        <span className={styles.espace} />
        <button
          type="button"
          className={styles.action}
          onClick={() => void navigator.clipboard?.writeText(detail.ddl)}
        >
          <Icon name="copy" size={11} strokeWidth={2.2} />
          Copier
        </button>
      </div>
      <div className={styles.texte}>
        <SqlColore texte={detail.ddl} jeu="ddl" />
      </div>
      {/* **Ce DDL est reconstruit, et l'écran le dit.** PostgreSQL ne garde pas le texte du
          `CREATE TABLE` d'origine : `06c` le réassemble depuis le catalogue, comme `pg_dump`. Le
          résultat est équivalent, pas identique — l'ordre des clauses et les noms de contraintes
          générés peuvent différer de la migration écrite. Le taire ferait chercher une régression
          là où il n'y a qu'une reconstruction. */}
      <p className={styles.mention}>
        Reconstruit depuis le catalogue : équivalent au <code>CREATE TABLE</code> d’origine, pas
        identique.
      </p>
      <div className={styles.pied}>
        <button
          type="button"
          className={styles.bouton}
          onClick={
            onOuvrirDansLaConsole === undefined
              ? undefined
              : () => onOuvrirDansLaConsole(detail.ddl)
          }
          aria-disabled={onOuvrirDansLaConsole === undefined}
          title={
            onOuvrirDansLaConsole === undefined
              ? 'Aucune base ouverte : la console n’aurait rien à interroger.'
              : undefined
          }
        >
          <Icon name="term" size={12} strokeWidth={2} />
          Ouvrir dans la console
        </button>
      </div>
    </aside>
  )
}
