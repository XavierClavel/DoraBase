import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import { cx } from '../cx'
import styles from './TabStrip.module.css'

export type Tab = {
  id: string
  icon: IconName
  /** Couleur du trait de l'icône — suit le **type d'objet** (schéma, table, console). */
  iconColor: string
  /** Couleur du filet supérieur quand l'onglet est actif — suit la **famille** d'onglet. */
  accentColor: string
  label: string
  /** Suffixe technique optionnel, ex. « ·psql ». */
  meta?: string
}

type TabStripProps = {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onReorder: (tabs: Tab[]) => void
}

// `iconColor` et `accentColor` sont deux valeurs distinctes, relevées sur les cinq onglets
// actifs du mockup : un onglet de table a un trait en accent mais une icône verte, une
// console a un trait violet et une icône `--violet-ink`. Les fusionner produirait deux
// combinaisons qui n'existent nulle part dans le handoff.
//
// Chaque onglet est un `<div>` inerte portant **deux boutons frères** — sélection et
// fermeture. Un bouton dans un bouton étant interdit en HTML, c'est ce qui évite la dette
// du `Chip` (racine `div[role=button]` avec clavier géré à la main) : ici les deux restent
// des `<button>` natifs, focalisables et activables sans code ajouté.
export function TabStrip({ tabs, activeId, onSelect, onClose, onReorder }: TabStripProps) {
  function handleDrop(targetId: string, draggedId: string) {
    if (draggedId === targetId) return
    const from = tabs.findIndex((tab) => tab.id === draggedId)
    const to = tabs.findIndex((tab) => tab.id === targetId)
    if (from === -1 || to === -1) return

    const next = [...tabs]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    onReorder(next)
  }

  return (
    <div className={styles.root} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          // `role="presentation"` rend l'enveloppe transparente pour les technologies
          // d'assistance : un `role="tablist"` attend des `role="tab"` pour enfants, et un
          // `<div>` nu au milieu casserait cette relation. Elle n'existe que pour porter le
          // filet supérieur coloré et grouper les deux boutons.
          <div
            key={tab.id}
            className={cx(styles.tab, active && styles.active)}
            style={active ? { borderTopColor: tab.accentColor } : undefined}
            data-active={active}
            role="presentation"
          >
            {/* Le glisser-déposer vit sur le bouton, pas sur l'enveloppe : c'est l'élément
                réellement interactif, et le corps de l'onglet est ce que l'utilisateur
                saisit. Conséquence assumée — sur l'onglet actif, la zone de dépôt exclut la
                largeur de la croix. Sans effet en pratique : on dépose sur les onglets
                voisins, pas sur celui qu'on est en train de déplacer. */}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={styles.select}
              onClick={() => onSelect(tab.id)}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(tab.id, event.dataTransfer.getData('text/plain'))}
            >
              <Icon
                name={tab.icon}
                size={13}
                strokeWidth={active ? 2 : 1.9}
                style={{ color: tab.iconColor }}
              />
              <span>{tab.label}</span>
              {tab.meta !== undefined && <span className={styles.meta}>{tab.meta}</span>}
            </button>
            {active && (
              <button
                type="button"
                aria-label={`Fermer ${tab.label}`}
                className={styles.close}
                onClick={() => onClose(tab.id)}
              >
                <Icon name="x" size={12} strokeWidth={2.2} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
