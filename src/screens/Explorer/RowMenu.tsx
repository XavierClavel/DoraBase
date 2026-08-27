import { Icon } from '../../design/icons/Icon'
import { useT } from '../../i18n/LanguageContext'
import type { EntreeDeMenu } from '../../ui/MenuContextuel/MenuContextuel'
import { Popover } from '../../ui/Popover/Popover'
import styles from './RowMenu.module.css'

type RowMenuProps = {
  /** Le libellé de la ligne, pour nommer le bouton — « Actions de analytics ». */
  cible: string
  /**
   * Ce que le menu propose. Une entrée sans `onClick` est **désactivée et dit pourquoi** : c'est la
   * règle de `09f`, et le défaut n° 36 est ce qui arrive quand on l'oublie — un bouton cliquable et
   * inerte se lit comme une panne, là où un bouton désactivé qui porte sa raison s'explique.
   *
   * **Le type est celui de `MenuContextuel`** depuis `26` : les mêmes entrées servent au « … » et au
   * clic droit sur la ligne, et deux formes voisines auraient fini par diverger d'une action.
   */
  entrees: readonly EntreeDeMenu[]
}

/**
 * Le menu « … » d'une ligne de l'arbre (`08h`).
 *
 * **Réutilise `Popover` (`10a`) sans nouveau composant** : celui-ci porte déjà les trois fermetures,
 * la bascule d'alignement et le rendu du panneau. Un menu d'actions est un panneau de boutons.
 *
 * **Le panneau s'ouvre au-dessus d'une sidebar qui défile**, et c'est le défaut n° 35 qui guette :
 * un `overflow` d'ancêtre le découperait sans qu'aucune assertion de visibilité s'en aperçoive. Le
 * test de `08h` interroge donc `elementFromPoint`, jamais `toBeVisible()` seul.
 */
export function RowMenu({ cible, entrees }: RowMenuProps) {
  const t = useT()
  return (
    <Popover
      title={t('explorer.rowMenu.title')}
      align="end"
      /* **Sortir de la ligne ferme le menu** (`26`). Ce n'était pas qu'un confort : le panneau vit
         dans la gouttière `.actions`, que `TreeRow` repasse en `visibility: hidden` hors survol. Le
         menu ne se fermait donc pas en quittant la ligne, il *disparaissait* — et le survol suivant le
         faisait réapparaître sans clic. */
      fermerEnSortant
      content={(fermer) => (
        <div className={styles.root}>
          {entrees.map((entree) => (
            <button
              key={entree.libelle}
              type="button"
              className={styles.entree}
              disabled={entree.onClick === undefined}
              title={entree.onClick === undefined ? entree.raison : undefined}
              onClick={() => {
                fermer()
                entree.onClick?.()
              }}
            >
              {entree.icone && (
                <Icon name={entree.icone} size={12} strokeWidth={1.9} className={styles.icone} />
              )}
              {entree.libelle}
            </button>
          ))}
        </div>
      )}
    >
      {/* **Trois points en texte, et non une icône.** Le handoff n'en dessine aucune : ses 48
          symboles sont extraits du mockup tels quels (`02`), et en inventer un tracé serait
          s'écarter de la source de vérité du design pour un glyphe que la typographie rend déjà.
          `aria-hidden` sur les points : leur sens est dans le nom du bouton, et « ··· » lu à voix
          haute ne dit rien. */}
      <button
        type="button"
        className={styles.declencheur}
        aria-label={t('explorer.rowMenu.actionsFor', { cible })}
      >
        <span aria-hidden="true">···</span>
      </button>
    </Popover>
  )
}
