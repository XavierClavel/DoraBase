import type { ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../../ui/cx'
import styles from './ColonneDroite.module.css'
import type { VueObjet } from './WorkbenchTabs'

type ColonneDroiteProps = {
  /** La vue courante de l'objet ouvert. Absente, le couple n'est pas rendu. */
  vue?: VueObjet
  onVueChange?: (vue: VueObjet) => void
  /**
   * La navigation entre lignes, quand elle a un sens : un rang, un total, et de quoi bouger.
   * Absente, les flèches ne sont pas rendues — plutôt que rendues inertes.
   */
  navigation?: { rang: number; total: number; onNavigate: (rang: number) => void }
  children?: ReactNode
}

/**
 * Le cadre de la colonne de droite : un en-tête permanent, et un corps qui suit la vue (`22`).
 *
 * # Pourquoi un cadre, et pas un en-tête dans chaque panneau
 *
 * Le couple « Données / Structure » était dans la bande d'onglets. Il est ici, dans l'en-tête de
 * cette colonne, et il doit y **rester** : en basculant de vue, en sélectionnant une ligne, en
 * éditant. Le poser dans `RowPanel` l'aurait fait disparaître dès que le panneau des modifications
 * prend la place (`11c`), et disparaître en vue Structure, où il est justement ce qui permet de
 * revenir. Un en-tête qui appartient au cadre ne dépend d'aucun de ses contenus.
 *
 * # Ce que l'en-tête ne porte plus
 *
 * « Ligne 5 · id 041ff6ac-ca09-4c57-b1fe-e4055c074abf » y était. Le rang est déjà dans la gouttière
 * `#` de la grille, sur la ligne surlignée ; l'identifiant est la première valeur du corps, trois
 * centimètres plus bas. La ligne répétait donc deux informations visibles, et l'identifiant long
 * poussait les flèches hors de l'en-tête — vu à l'écran le 19 août 2026.
 */
export function ColonneDroite({ vue, onVueChange, navigation, children }: ColonneDroiteProps) {
  return (
    // **Un `<div>`, et non un `<aside>`.** Les panneaux qu'il enveloppe — la ligne, le DDL, les
    // modifications, le détail d'objet — portent déjà leur propre repère et leur propre nom
    // accessible. En faire un second ici imbriquerait deux repères « complementary », dont l'externe
    // n'ajouterait qu'un nom générique. Le cadre est une mise en page ; ce qu'il contient est le
    // contenu.
    <div className={styles.root}>
      <header className={styles.header}>
        {vue !== undefined && (
          // `<fieldset>` et non `<div role="group">` : c'est la convention du projet pour un groupe
          // de contrôles nommé — `SegmentedControl` et `RadioGroup` font de même, et la règle
          // `useSemanticElements` de biome l'exige. La légende nomme le groupe à la voix sans occuper
          // de place ; `display: none` la retirerait du nom accessible.
          <fieldset className={styles.vues}>
            <legend className={styles.legende}>Vue de l’objet</legend>
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
          </fieldset>
        )}
        <span className={styles.espace} />
        {/* Précédent / suivant se déplacent dans la **fenêtre**, et se désactivent aux bords —
            plutôt que de boucler, ce qui ferait croire à un parcours infini sur 500 lignes. */}
        {navigation !== undefined && (
          <>
            <button
              type="button"
              className={styles.fleche}
              aria-label="Ligne précédente"
              disabled={navigation.rang <= 1}
              onClick={() => navigation.onNavigate(navigation.rang - 1)}
            >
              <Icon name="chevd" size={13} strokeWidth={2.4} className={styles.haut} />
            </button>
            <button
              type="button"
              className={styles.fleche}
              aria-label="Ligne suivante"
              disabled={navigation.rang >= navigation.total}
              onClick={() => navigation.onNavigate(navigation.rang + 1)}
            >
              <Icon name="chevd" size={13} strokeWidth={2.4} />
            </button>
          </>
        )}
      </header>
      {/* **Le corps peut être vide, et il l'est sans rien dire.** Une vue Données sans ligne
          sélectionnée affichait « Sélectionnez une ligne pour en voir le détail. » ; l'en-tête
          permanent rend la colonne lisible sans cette phrase, et une phrase qui décrit un geste
          évident finit par se lire comme du remplissage. */}
      <div className={styles.corps}>{children}</div>
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
      className={cx(styles.vue, active && styles.vueActive)}
      aria-pressed={active}
      onClick={onVueChange === undefined ? undefined : () => onVueChange(vue)}
    >
      <Icon name={icone} size={13} strokeWidth={1.9} />
      {libelle}
    </button>
  )
}
