import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import { cx } from '../cx'
import styles from './ColumnRow.module.css'

type ColumnRowProps = {
  label: string
  /** Glyphe de type en lettre : `T`, `#`, `⏱`, `{}`, `ID`. Exclusif de `typeIcon`. */
  typeGlyph?: string
  /** Icône de type : clé primaire ou clé étrangère. Exclusif de `typeGlyph`. */
  typeIcon?: IconName
  typeIconColor?: string
  /** Type de la colonne, ou son état — « int8 », « filtré », « tri ↓ ». */
  meta?: string
  /** Passe la métadonnée en accent : la colonne est filtrée ou triée. */
  metaActive?: boolean
  /** Ligne de comptage (« + 11 autres ») : encre atténuée, aucun glyphe. */
  summary?: boolean
  onClick?: () => void
}

// Ligne de colonne de la section contextuelle de la sidebar (A5, A6, A9). Le glyphe garde
// sa largeur de 11 px même absent, pour que les libellés restent alignés d'une ligne à
// l'autre — y compris sur la ligne de résumé, que le mockup aligne aussi.
export function ColumnRow({
  label,
  typeGlyph,
  typeIcon,
  typeIconColor,
  meta,
  metaActive,
  summary,
  onClick,
}: ColumnRowProps) {
  const contenu = (
    <>
      {typeIcon !== undefined && summary !== true ? (
        <Icon
          name={typeIcon}
          size={11}
          strokeWidth={2}
          className={styles.typeIcon}
          style={{ color: typeIconColor }}
        />
      ) : typeGlyph !== undefined && summary !== true ? (
        <span data-glyph className={styles.glyph}>
          {typeGlyph}
        </span>
      ) : (
        <span data-glyph-slot className={styles.glyphSlot} />
      )}
      <span className={styles.label}>{label}</span>
      {meta !== undefined && (
        <span
          data-meta={metaActive === true ? 'active' : 'idle'}
          className={cx(styles.meta, metaActive === true && styles.metaActive)}
        >
          {meta}
        </span>
      )}
    </>
  )

  const className = cx(styles.root, summary === true && styles.summary)

  if (onClick === undefined) {
    return <div className={className}>{contenu}</div>
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {contenu}
    </button>
  )
}
