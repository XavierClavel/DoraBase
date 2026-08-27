import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { useT } from '../../i18n/LanguageContext'
import { themeDuHandoff } from '../Console/theme'
import styles from './JsonEditor.module.css'

type JsonEditorProps = {
  /** Le texte au **montage** — voir `SqlEditor` pour pourquoi cet éditeur n'est pas « contrôlé ». */
  texteInitial: string
  onTexteChange: (texte: string) => void
  /** `⌘↩` valide, comme dans les autres saisies de modale multi-lignes du projet. */
  onValider?: () => void
}

/**
 * L'éditeur d'un document JSON — le même choix que la console (`SqlEditor`) pour les mêmes raisons :
 * placement du curseur, sélection au clavier, annulation, composition des accents.
 *
 * **Une grammaire dédiée, `@codemirror/lang-json`, plutôt que le JavaScript de la console mongo.**
 * La console accepte des pipelines — du JS, pas du JSON strict — alors qu'ici le texte doit
 * redevenir un document par `JSON.parse` : la grammaire JSON referme les guillemets de clé et
 * signale une virgule finale là où le JavaScript les tolérerait silencieusement.
 */
export function JsonEditor({ texteInitial, onTexteChange, onValider }: JsonEditorProps) {
  const t = useT()
  const hote = useRef<HTMLDivElement>(null)
  const rappels = useRef({ onTexteChange, onValider })
  rappels.current = { onTexteChange, onValider }

  // Aucune dépendance, comme `SqlEditor` : la vue est montée une fois, `texteInitial` ne vaut
  // qu'au montage, et reconstruire à chaque rendu perdrait le curseur et l'historique.
  // biome-ignore lint/correctness/useExhaustiveDependencies: voir ci-dessus
  useEffect(() => {
    if (!hote.current) return

    const editeur = new EditorView({
      parent: hote.current,
      state: EditorState.create({
        doc: texteInitial,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                rappels.current.onValider?.()
                return true
              },
            },
          ]),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          json(),
          // Le nom accessible vit sur `.cm-content`, seul élément qui porte `role="textbox"` — un
          // `aria-label` posé sur l'hôte serait ignoré (voir AGENTS.md, piège n° 2).
          EditorView.contentAttributes.of({
            'aria-label': t('tableView.documentJson.editorLabel'),
          }),
          themeDuHandoff,
          EditorView.updateListener.of((maj) => {
            if (maj.docChanged) rappels.current.onTexteChange(maj.state.doc.toString())
          }),
        ],
      }),
    })

    return () => editeur.destroy()
  }, [])

  return <div ref={hote} className={styles.hote} data-testid="editeur-json" />
}
