import { useMemo, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import { useT } from '../../i18n/LanguageContext'
import styles from './ArbreJson.module.css'
import { basculer, type Noeud, noeudsVisibles, ouvertsParDefaut, resume } from './noeudsJson'

type ArbreJsonProps = {
  /** Les documents rendus par le moteur, déjà décodés. */
  documents: readonly unknown[]
  /** Copie **un** document — voir `13b` sur pourquoi pas le résultat entier. */
  onCopier?: (document: unknown, rang: number) => void
}

/**
 * L'arbre JSON dépliable de `13b`.
 *
 * **Un arbre, pas un bloc coloré.** `JsonColore` (`10f`) rend un JSON entier, ce qui convient à une
 * ligne de table ; un document mongo peut avoir cinquante champs et trois niveaux. C'est le premier
 * composant du projet à porter un état d'ouverture par nœud.
 *
 * **Une liste plate, indentée par le niveau.** Un composant récursif remonterait tout un sous-arbre
 * à chaque dépliage ; ici un seul état d'ensemble décide de ce qui est visible, et `arbreJson.ts`
 * calcule la liste — testable sans DOM.
 */
export function ArbreJson({ documents, onCopier }: ArbreJsonProps) {
  const t = useT()
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(() => ouvertsParDefaut(documents))

  const noeuds = useMemo(
    () => documents.flatMap((document, rang) => noeudsVisibles(document, ouverts, String(rang))),
    [documents, ouverts],
  )

  if (documents.length === 0) {
    return <p className={styles.vide}>{t('console.arbreJson.vide')}</p>
  }

  return (
    <div className={styles.root}>
      <div className={styles.barre}>
        <button
          type="button"
          className={styles.action}
          onClick={() => setOuverts(new Set())}
          // « Tout replier » ramène à **rien d'ouvert**, et non à l'état initial : c'est ce que le
          // libellé dit. « Rouvrir d'un cran » est le bouton d'à côté.
        >
          {t('console.arbreJson.toutReplier')}
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => setOuverts(ouvertsParDefaut(documents))}
        >
          {t('console.arbreJson.deplierUnCran')}
        </button>
      </div>
      {/* Un nom accessible sur la liste : sans lui, ces champs se confondent avec ceux de la
          section « Schéma déduit » de la sidebar, qui porte les mêmes noms — et une assertion de
          test comme une lecture à la voix viserait le mauvais. */}
      <ul className={styles.liste} aria-label={t('console.arbreJson.documentsAriaLabel')}>
        {noeuds.map((noeud) => (
          <Ligne
            key={noeud.chemin}
            noeud={noeud}
            ouvert={ouverts.has(noeud.chemin)}
            onBasculer={() => setOuverts((precedent) => basculer(precedent, noeud.chemin))}
            onCopier={
              // La copie n'est offerte qu'à la **racine d'un document** : c'est l'unité qu'on
              // rejoue ailleurs, et copier le résultat entier ferait passer par le presse-papiers
              // ce que la contrainte transverse interdit de faire traverser l'IPC (`13b`).
              noeud.niveau === 0 && onCopier
                ? () => onCopier(documents[Number(noeud.chemin)], Number(noeud.chemin))
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  )
}

function Ligne({
  noeud,
  ouvert,
  onBasculer,
  onCopier,
}: {
  noeud: Noeud
  ouvert: boolean
  onBasculer: () => void
  onCopier?: () => void
}) {
  const t = useT()
  const etiquette =
    noeud.niveau === 0
      ? t('console.arbreJson.document', { numero: Number(noeud.chemin) + 1 })
      : noeud.cle

  return (
    <li className={styles.ligne} style={{ paddingLeft: `${noeud.niveau * 14 + 8}px` }}>
      {noeud.depliable ? (
        <button
          type="button"
          className={styles.chevron}
          onClick={onBasculer}
          aria-expanded={ouvert}
          aria-label={t('console.arbreJson.basculerAriaLabel', {
            action: t(ouvert ? 'console.arbreJson.replier' : 'console.arbreJson.deplier'),
            etiquette,
          })}
        >
          <Icon name={ouvert ? 'chevd' : 'chevr'} size={11} strokeWidth={2.4} />
        </button>
      ) : (
        // Une pastille de la largeur du chevron : sans elle, les feuilles se décaleraient de onze
        // pixels vers la gauche et l'indentation ne se lirait plus.
        <span className={styles.sansChevron} aria-hidden="true" />
      )}
      <span className={styles.cle}>{etiquette}</span>
      {noeud.texte === null ? (
        <span className={styles.resume}>{resume(noeud, t)}</span>
      ) : (
        <span className={styles[noeud.genre]}>{noeud.texte}</span>
      )}
      {onCopier && (
        <button type="button" className={styles.copier} onClick={onCopier}>
          <Icon name="copy" size={11} strokeWidth={2.2} />
          {t('console.arbreJson.copier')}
        </button>
      )}
    </li>
  )
}
