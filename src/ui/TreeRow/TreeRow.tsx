import type { ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import { cx } from '../cx'
import styles from './TreeRow.module.css'

/**
 * Indentation par palier, relevée littéralement dans le mockup A5 : les écarts valent
 * 14, 14 puis **16**. Aucune formule ne les reproduit — `8 + depth * 14` donnerait 50 au
 * dernier palier au lieu de 52. Table, donc, et non calcul.
 */
const INDENT = ['8px', '22px', '36px', '52px'] as const

export type TreeDepth = 0 | 1 | 2 | 3

type TreeRowProps = {
  depth: TreeDepth
  label: string
  icon?: IconName
  iconColor?: string
  chevron?: 'open' | 'closed'
  /** Métadonnée de fin de ligne : taille, comptage, nombre de bases. */
  meta?: string
  /** `mono` pour les tailles et comptages, `caps` pour le « n bases » des projets repliés. */
  metaVariant?: 'mono' | 'caps'
  /** Contenu libre de fin de ligne, un `Badge` d'environnement par exemple. */
  trailing?: ReactNode
  /** Cible courante : aplat d'accent atténué, filet gauche, encre pleine et graisse 700. */
  selected?: boolean
  /** Encre pleine et graisse 700 sans aplat — le projet actif déplié du mockup. */
  strong?: boolean
  /** Projet voisin replié : icônes ramenées à la teinte de métadonnée. */
  muted?: boolean
  onClick?: () => void
}

// Ligne d'arbre purement présentationnelle : elle ne connaît ni ses enfants, ni son état
// d'ouverture, ni le modèle de données. L'écran consommateur aplatit son arbre et fournit
// une liste de `TreeRow` déjà positionnées — voir `specs/04-menu-lateral-standard.md`, qui
// écarte volontairement toute récursion tant qu'aucun écran n'en impose la forme.
export function TreeRow({
  depth,
  label,
  icon,
  iconColor,
  chevron,
  meta,
  metaVariant = 'mono',
  trailing,
  selected,
  strong,
  muted,
  onClick,
}: TreeRowProps) {
  const contenu = (
    <>
      {chevron !== undefined && (
        <Icon
          name="chevr"
          size={11}
          strokeWidth={2.4}
          data-chevron={chevron}
          className={cx(styles.chevron, chevron === 'open' && styles.chevronOpen)}
        />
      )}
      {icon !== undefined && (
        <Icon
          name={icon}
          size={selected === true ? 12 : 13}
          // Trait plus épais sur la ligne sélectionnée : 2 contre 1,8 dans le mockup.
          strokeWidth={selected === true ? 2 : 1.8}
          className={styles.icon}
          style={{ color: muted === true ? 'var(--ink-meta)' : iconColor }}
        />
      )}
      <span className={styles.label}>{label}</span>
      {meta !== undefined && (
        <span
          data-meta={metaVariant}
          className={cx(styles.meta, metaVariant === 'caps' && styles.metaCaps)}
        >
          {meta}
        </span>
      )}
      {trailing}
    </>
  )

  const className = cx(
    styles.root,
    selected === true && styles.selected,
    strong === true && styles.strong,
  )

  // Une ligne cliquable est un vrai `<button>` : focus et activation clavier natifs, sans
  // `role` ni gestion de touches écrite à la main. Une ligne sans `onClick` reste un
  // `<div>` — c'est du contenu, elle n'a pas à entrer dans le parcours clavier.
  if (onClick === undefined) {
    return (
      <div className={className} style={{ paddingLeft: INDENT[depth] }} data-depth={depth}>
        {contenu}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      style={{ paddingLeft: INDENT[depth] }}
      data-depth={depth}
      onClick={onClick}
    >
      {contenu}
    </button>
  )
}
