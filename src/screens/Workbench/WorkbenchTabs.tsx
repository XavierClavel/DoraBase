import { Icon } from '../../design/icons/Icon'
import { type Tab, TabStrip } from '../../ui/TabStrip/TabStrip'
import { type EtatOnglets, idOnglet } from './onglets'
import styles from './WorkbenchTabs.module.css'

/** Les deux vues d'une table : ses lignes, ou sa structure (`14a`). */
export type VueObjet = 'donnees' | 'structure'

type WorkbenchTabsProps = {
  etat: EtatOnglets
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onReorder: (ids: string[]) => void
  vue?: VueObjet
  onVueChange?: (vue: VueObjet) => void
}

/**
 * La bande d'onglets de l'écran de travail, et le couple « Données / Structure » à sa droite.
 *
 * `TabStrip` (`03`) est purement présentationnelle : elle ne sait rien des tables. La traduction
 * du modèle d'onglets en `Tab` vit donc ici, comme `arbre.ts` traduit les projets en `Noeud`.
 */
export function WorkbenchTabs({
  etat,
  onSelect,
  onClose,
  onReorder,
  vue = 'donnees',
  onVueChange,
}: WorkbenchTabsProps) {
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
        // **Le couple bascule enfin.** `10b` l'avait livré désactivé sous l'infobulle « Viendra avec
        // A9 », la règle de `09f` ; `14a` est cet écran, et l'infobulle serait devenue un mensonge.
        // C'est le dernier bouton du produit qui annonçait une spec à venir.
        <div className={styles.vues}>
          <BoutonDeVue
            vue="donnees"
            courante={vue}
            onVueChange={onVueChange}
            icone="cols"
            libelle="Données"
          />
          <BoutonDeVue
            vue="structure"
            courante={vue}
            onVueChange={onVueChange}
            icone="plan"
            libelle="Structure"
          />
        </div>
      )}
    </div>
  )
}

/**
 * Un des deux boutons de vue.
 *
 * **La vue active porte une pastille sombre**, comme le mockup d'`A9` la montre. Celui d'`A5`
 * affiche les deux libellés du même gris — ce qui tenait tant que la paire ne basculait pas :
 * l'état actif n'avait pas à se voir. Maintenant qu'elle répond, deux libellés identiques ne
 * diraient plus laquelle des deux vues est à l'écran. Écart assumé, dans le sens de `A9`.
 */
function BoutonDeVue({
  vue,
  courante,
  onVueChange,
  icone,
  libelle,
}: {
  vue: VueObjet
  courante: VueObjet
  onVueChange?: (vue: VueObjet) => void
  icone: 'cols' | 'plan'
  libelle: string
}) {
  const active = vue === courante
  return (
    <button
      type="button"
      className={active ? styles.vueActive : styles.vue}
      aria-pressed={active}
      onClick={onVueChange === undefined ? undefined : () => onVueChange(vue)}
    >
      <Icon name={icone} size={13} strokeWidth={1.9} />
      {libelle}
    </button>
  )
}
