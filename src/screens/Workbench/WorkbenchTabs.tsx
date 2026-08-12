import { Icon } from '../../design/icons/Icon'
import { type Tab, TabStrip } from '../../ui/TabStrip/TabStrip'
import { Tooltip } from '../../ui/Tooltip/Tooltip'
import { type EtatOnglets, idOnglet } from './onglets'
import styles from './WorkbenchTabs.module.css'

type WorkbenchTabsProps = {
  etat: EtatOnglets
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onReorder: (ids: string[]) => void
}

/**
 * La bande d'onglets de l'écran de travail, et le couple « Données / Structure » à sa droite.
 *
 * `TabStrip` (`03`) est purement présentationnelle : elle ne sait rien des tables. La traduction
 * du modèle d'onglets en `Tab` vit donc ici, comme `arbre.ts` traduit les projets en `Noeud`.
 */
export function WorkbenchTabs({ etat, onSelect, onClose, onReorder }: WorkbenchTabsProps) {
  const consoleActive = etat.onglets.some(
    (onglet) => onglet.sorte === 'console' && idOnglet(onglet) === etat.actif,
  )
  const tabs: Tab[] = etat.onglets.map((onglet) => {
    // **Une console n'est pas une table**, et le mockup lui donne son icône et son libellé
    // « console 1 ». C'est le seul endroit où l'union de `12a` se traduit en interface.
    if (onglet.sorte === 'console') {
      return {
        id: idOnglet(onglet),
        icon: 'term' as const,
        iconColor: 'var(--info)',
        accentColor: 'var(--accent)',
        label: `console ${onglet.numero}`,
      }
    }
    return {
      id: idOnglet(onglet),
      icon: onglet.kind === 'view' ? ('view' as const) : ('table' as const),
      // L'icône suit le **type d'objet**, le filet suit la **famille** d'onglet : deux valeurs
      // distinctes, relevées sur les cinq onglets actifs du mockup (voir `TabStrip`).
      iconColor: onglet.kind === 'view' ? 'var(--violet)' : 'var(--success)',
      accentColor: 'var(--accent)',
      label: onglet.table,
    }
  })

  return (
    <div className={styles.root}>
      <div className={styles.strip}>
        <TabStrip
          tabs={tabs}
          activeId={etat.actif ?? ''}
          onSelect={onSelect}
          onClose={onClose}
          onReorder={(suivants) => onReorder(suivants.map((tab) => tab.id))}
        />
      </div>
      {/* **« Données / Structure » ne concerne qu'une table.** Le couple décrit deux vues d'un objet
          de base ; au-dessus d'une console, il proposerait de basculer la structure d'une requête.
          Vu à l'écran en assemblant `12a`. */}
      {!consoleActive && (
        <div className={styles.vues}>
          {/* « Données » est l'état courant, pas un bouton : le mockup l'affiche comme le second
            d'une paire dont un seul répond. Le rendre cliquable promettrait une bascule qui ne
            fait rien. */}
          <span className={styles.vueActive} aria-current="page">
            <Icon name="cols" size={13} strokeWidth={1.9} />
            Données
          </span>
          <Tooltip label="Viendra avec A9">
            <button type="button" className={styles.vue} aria-disabled="true">
              <Icon name="plan" size={13} strokeWidth={1.9} />
              Structure
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
