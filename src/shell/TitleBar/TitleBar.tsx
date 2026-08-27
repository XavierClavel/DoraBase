import type { ReactNode } from 'react'
import { Icon } from '../../design/icons/Icon'
import { useT } from '../../i18n/LanguageContext'
import { cx } from '../../ui/cx'
import styles from './TitleBar.module.css'

/*
 * **La barre n'a plus d'accès à la console** (26 août 2026). Le bouton était livré sans `onClick`
 * depuis le premier assemblage : cliquable, inerte, donc lisible comme une panne — c'est exactement
 * le défaut n° 36, dont l'engrenage voisin porte le remède en commentaire. Les consoles s'ouvrent
 * depuis le menu d'une connexion, qui est le palier qui connaît son contexte ; un bouton de barre
 * de titre aurait dû deviner pour laquelle. La prop `showConsole` part avec lui.
 */
type TitleBarProps = {
  /**
   * Ternit la barre quand une modale bloque la fenêtre — `A2` et `A3`.
   *
   * **Le mockup grise aussi les trois feux, ce qui n'est pas réalisable** :
   * `titleBarStyle: "Overlay"` les fait dessiner par macOS, hors d'atteinte du CSS, et le
   * système ne les ternit que sur perte de focus — qu'une modale interne ne provoque pas.
   * Les deux autres effets du mockup sont appliqués : `saturate(.6)` sur la barre et
   * `opacity .55` sur le wordmark. Écart consigné dans `AGENTS.md`.
   */
  dimmed?: boolean
  /**
   * Le centre de la barre : l'indicateur de sélection (`A4` → `A9`).
   *
   * Passé en contenu plutôt qu'en propriétés : `A1` n'en a aucun, les écrans de travail en ont un, et
   * son contenu a déjà changé deux fois. Une liste de propriétés grandirait à chaque écran là où un
   * contenu s'assemble chez l'appelant.
   *
   * **La prop `right` a disparu avec `25b`.** Elle n'avait qu'un appelant, le sélecteur
   * d'environnement, posé là le 19 août 2026 pour qu'il cesse de se déplacer avec la longueur du fil
   * d'Ariane. Le sélecteur parti, une prop sans appelant n'est qu'un emplacement que le prochain
   * écran remplira sans savoir pourquoi il existe.
   */
  center?: ReactNode
  /**
   * Ouvre les préférences (`15a`). Absent, l'engrenage reste **désactivé avec sa raison** — la règle
   * de `09f` : un bouton cliquable et inerte se lit comme une panne (défaut n° 36).
   *
   * **Depuis le 26 août 2026, aucun écran du produit ne le laisse absent** : `A1` le passait pas, et
   * son engrenage ne faisait rien. La galerie est le dernier appelant à monter la barre sans, d'où
   * une infobulle qui ne nomme plus d'écran — celui qu'elle nommait n'existe pas quand `A1` est à
   * l'écran. Un tel bouton désactivé dans le produit serait désormais un défaut.
   */
  onOpenPreferences?: () => void
}

// `data-tauri-drag-region` rend la fenêtre déplaçable : sous `titleBarStyle: Overlay`
// (spec 01), macOS ne fournit plus de zone de glissement native.
//
// **La valeur `deep` est nécessaire, et l'attribut nu ne suffisait pas.** Le script de Tauri
// (`window/scripts/drag.js`) traite l'attribut nu comme « seuls les clics **directs** sur cet
// élément » : `el === composedPath[0]`. Or la barre est presque entièrement couverte par ses
// enfants — wordmark, centre, actions — donc seule la bande de fond autour des feux répondait.
// Constaté à l'usage le 10 août 2026, après avoir cru le problème réglé par la seule permission.
//
// `deep` étend le glissement au sous-arbre, et les éléments **cliquables** le bloquent
// d'eux-mêmes : le même script refuse de glisser dès qu'un `<button>`, `<select>` ou tout élément
// focalisable se trouve sur le chemin. Cliquer la pastille projet ou l'engrenage active donc le
// contrôle, sans déplacer la fenêtre — ce qui est le comportement voulu, et qu'il n'a pas fallu
// écrire.
export function TitleBar({ dimmed = false, center, onOpenPreferences }: TitleBarProps) {
  const t = useT()
  return (
    <div className={cx(styles.root, dimmed && styles.dimmed)} data-tauri-drag-region="deep">
      <div className={cx(styles.wordmark, dimmed && styles.wordmarkDimmed)}>
        <svg className={styles.logo} viewBox="0 0 512 512" aria-hidden="true">
          <use href="#logo" />
        </svg>
        <span className={styles.name}>DoraBase</span>
      </div>
      {/* Le centre est **centré dans la barre**, pas simplement placé après le wordmark : le
          mockup l'enveloppe dans un `flex:1; justify-content:center`. Sans cela, la pastille
          collerait au logo et se déplacerait avec la longueur du fil d'Ariane. */}
      <div className={styles.center}>{center}</div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          aria-label={t('shell.titleBar.preferences')}
          onClick={onOpenPreferences}
          disabled={onOpenPreferences === undefined}
          title={
            onOpenPreferences === undefined
              ? t('shell.titleBar.preferencesDisabledTitle')
              : undefined
          }
        >
          <Icon name="gear" size={15} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
