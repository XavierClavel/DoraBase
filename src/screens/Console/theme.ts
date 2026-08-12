import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/**
 * Le thème de l'éditeur, **aux couleurs du handoff** (`12b`).
 *
 * Les six jetons `--syn-*` existent depuis `02` et servent déjà au bloc SQL de `11c`. Un éditeur aux
 * couleurs par défaut de CodeMirror à côté d'un bloc aux couleurs du handoff se lirait comme deux
 * applications — et les jetons, faits pour un fond sombre, iraient d'autant moins.
 *
 * **Les valeurs sont des `var(--…)`, pas des littéraux.** La règle du projet est qu'aucune couleur
 * n'existe hors `tokens.json` ; CodeMirror accepte n'importe quelle valeur CSS, donc rien n'oblige à
 * l'enfreindre ici.
 */
export const coloration = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syn-keyword)' },
  // Les fonctions et les types partagent la teinte des mots-clés dans le mockup : `date_trunc` et
  // `select` y sont de la même couleur, et distinguer plus finement que le handoff serait inventer.
  { tag: tags.function(tags.variableName), color: 'var(--syn-keyword)' },
  { tag: tags.typeName, color: 'var(--syn-keyword)' },
  { tag: tags.string, color: 'var(--syn-string)' },
  { tag: tags.number, color: 'var(--syn-number)' },
  { tag: tags.bool, color: 'var(--syn-number)' },
  { tag: tags.null, color: 'var(--syn-number)' },
  { tag: tags.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  // Les identifiants — noms de tables, de colonnes, d'alias — prennent l'encre de base du thème.
  { tag: tags.variableName, color: 'var(--syn-ident)' },
  { tag: tags.propertyName, color: 'var(--syn-ident)' },
  { tag: tags.operator, color: 'var(--syn-ident)' },
  { tag: tags.punctuation, color: 'var(--syn-ident)' },
])

/**
 * L'habillage de l'éditeur : fond, gouttière, ligne courante, sélection.
 *
 * **Le fond est sombre**, comme le bloc SQL de `11c` : c'est ce pour quoi les jetons `--syn-*` sont
 * faits, et le mockup d'`A7` montre un éditeur clair — écart assumé et consigné dans `12b`, parce
 * qu'un éditeur clair aux couleurs d'un thème sombre serait illisible, et que réinventer six couleurs
 * claires reviendrait à créer un second jeu de jetons pour un seul écran.
 */
export const habillage = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--dark)',
      color: 'var(--syn-ident)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-dense)',
      fontWeight: 'var(--weight-medium)',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: 'var(--leading-code)',
      // Le défilement vertical suit la hauteur donnée par le partage de `12a` ; l'horizontal est
      // laissé libre, une requête large ne devant pas être repliée au milieu d'un identifiant.
      overflow: 'auto',
    },
    '.cm-content': {
      padding: 'var(--space-5) 0',
      caretColor: 'var(--syn-keyword)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--dark)',
      border: 'none',
      color: 'var(--syn-linenum)',
      // `--syn-linenum` est déjà une couleur atténuée : les numéros doivent se lire sans capter le
      // regard, ce qui est exactement l'usage prévu de ce jeton depuis `02`.
      paddingRight: 'var(--space-4)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 var(--space-3) 0 var(--space-5)',
    },
    // La ligne active : un fond à peine plus clair, pas une bordure — une bordure décalerait le
    // texte d'un pixel à chaque déplacement du curseur.
    '.cm-activeLine': { backgroundColor: 'var(--dark-2)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--dark-2)', color: 'var(--syn-ident)' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--info)',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--syn-keyword)' },
  },
  { dark: true },
)

/** Les deux extensions de thème, dans l'ordre où CodeMirror les attend. */
export const themeDuHandoff = [habillage, syntaxHighlighting(coloration)]
