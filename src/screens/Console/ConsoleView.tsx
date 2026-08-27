import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { QueryResult } from '../../domain/engine'
import { useT } from '../../i18n/LanguageContext'
import { SplitPane } from '../../ui/SplitPane/SplitPane'
import type { Dialecte } from '../Workbench/onglets'
import { ConsoleResult, type VueResultat } from './ConsoleResult'
import styles from './ConsoleView.module.css'
import type { Catalogue } from './completion'
import { SqlEditor } from './SqlEditor'

type ConsoleViewProps = {
  /**
   * Le texte de la console. **L'écran le détient**, et l'éditeur le reçoit au montage seulement —
   * voir `SqlEditor` pour pourquoi un éditeur contrôlé perd des caractères.
   */
  texte: string
  onTexteChange: (texte: string) => void
  /** Le libellé de la base, pour le pied — `analytics · public`. */
  contexte?: string
  /** Exécute la requête entière (`12c`). Absent, l'action est désactivée avec sa raison. */
  onExecuter?: (sql: string) => void
  /** Exécute la portion sélectionnée, ou la requête entière faute de sélection. */
  onExecuterLaSelection?: (sql: string) => void
  enCours?: boolean
  resultat?: QueryResult | null
  erreur?: string | null
  /** Ce que l'autocomplétion propose (`12d`), lu au moment de la frappe. */
  catalogue?: () => Catalogue
  vue?: VueResultat
  onVueChange?: (vue: VueResultat) => void
  /** Ouvre la modale d'enregistrement (`12f`) avec le texte courant. */
  onEnregistrer?: (sql: string) => void
  /**
   * La langue de la console (`13a`) — `sql` ou `mongo`.
   *
   * Elle suit le moteur de la base, elle ne se choisit pas : une console mongo sur une base
   * PostgreSQL n'aurait rien à interroger.
   */
  dialecte?: Dialecte
  /** La densité de `15c`, transmise à la grille du résultat. */
  rowHeight?: number
}

/**
 * L'écran de console SQL (`12a`) : la toolbar, l'éditeur, le résultat.
 *
 * **L'éditeur est celui de `12b`** — CodeMirror 6, au thème du handoff. L'exécution arrive en `12c`. Les actions qui en dépendent sont
 * **désactivées avec leur raison** : la règle de `09f`, et la leçon du défaut n° 36, où un bouton
 * cliquable et inerte s'est lu comme une panne.
 */
export function ConsoleView({
  texte,
  onTexteChange,
  contexte,
  onExecuter,
  onExecuterLaSelection,
  enCours = false,
  resultat = null,
  erreur = null,
  catalogue,
  vue,
  onVueChange,
  onEnregistrer,
  dialecte = 'sql',
  rowHeight,
}: ConsoleViewProps) {
  const t = useT()
  // La sélection courante, publiée par l'éditeur : « Sélection » l'exécute, et se replie sur la
  // requête entière quand il n'y a rien de sélectionné — un bouton qui ne ferait rien sur une
  // sélection vide se lirait comme une panne.
  const [selection, setSelection] = useState('')

  const executer = onExecuter === undefined ? undefined : () => onExecuter(texte)
  const executerLaSelection =
    onExecuterLaSelection === undefined
      ? undefined
      : () => onExecuterLaSelection(selection.trim() === '' ? texte : selection)

  const actions = ACTIONS.map((action) => {
    if (action.id === 'executer') return { ...action, onClick: executer }
    if (action.id === 'selection') return { ...action, onClick: executerLaSelection }
    if (action.id === 'enregistrer') {
      return {
        ...action,
        onClick: onEnregistrer === undefined ? undefined : () => onEnregistrer(texte),
      }
    }
    return action
  })

  return (
    <div className={styles.root}>
      {/* `role="toolbar"`, comme celle de `A5` (`10e`) : un groupe de commandes qui agissent sur la
          même chose. Le nom la distingue — « Exécuter » ici et une action homonyme ailleurs
          s'annonceraient à l'identique sans lui. */}
      <div className={styles.toolbar} role="toolbar" aria-label={t('console.toolbar.ariaLabel')}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.principale ? styles.principale : styles.action}
            onClick={'onClick' in action ? action.onClick : undefined}
            disabled={!('onClick' in action) || action.onClick === undefined || enCours}
            title={
              'onClick' in action && action.onClick !== undefined
                ? undefined
                : t(`console.toolbar.actions.${action.id}.raison`)
            }
          >
            {action.icone && <Icon name={action.icone} size={12} strokeWidth={2.1} />}
            {enCours && action.principale
              ? t('console.toolbar.enCours')
              : t(`console.toolbar.actions.${action.id}.libelle`)}
            {action.raccourci && <span className={styles.raccourci}>{action.raccourci}</span>}
          </button>
        ))}
        <span className={styles.espace} />
        {/* Le mockup montre l'auto-`LIMIT` comme un état affiché, pas comme un réglage : c'est `12c`
            qui l'appliquera, et `A10` qui le rendra réglable.

            **En mongo, le mot change** : ce n'est pas un `LIMIT` SQL mais un `$limit` ajouté en fin
            de pipeline (`18g`). Garder « LIMIT » ferait chercher une clause qui n'existe pas. */}
        <span className={styles.limite}>
          {dialecte === 'mongo'
            ? t('console.toolbar.autoLimitMongo')
            : t('console.toolbar.autoLimitSql')}
        </span>
      </div>

      <div className={styles.corps}>
        <SplitPane
          storageKey="console:resultat"
          orientation="vertical"
          defaultSize={240}
          min={120}
          max={520}
          start={
            <div className={styles.editeur}>
              <SqlEditor
                texteInitial={texte}
                onTexteChange={onTexteChange}
                onSelectionChange={setSelection}
                onExecuter={executer}
                onExecuterLaSelection={executerLaSelection}
                catalogue={catalogue}
                dialecte={dialecte}
              />
            </div>
          }
          end={
            <ConsoleResult
              resultat={resultat}
              erreur={erreur}
              enCours={enCours}
              vue={vue}
              onVueChange={onVueChange}
              dialecte={dialecte}
              rowHeight={rowHeight}
            />
          }
        />
      </div>

      {contexte && <div className={styles.pied}>{contexte}</div>}
    </div>
  )
}

/**
 * Les quatre actions de la toolbar du mockup, toutes désactivées à ce stade.
 *
 * **Présentes et désactivées, pas absentes** : les cacher ferait croire qu'elles n'existeront pas,
 * les laisser cliquables et inertes ferait croire à une panne. Chacune porte sa raison.
 */
const ACTIONS = [
  {
    id: 'executer',
    icone: 'play' as const,
    raccourci: '⌘↩',
    principale: true,
  },
  {
    id: 'selection',
    raccourci: '⌥↩',
  },
  {
    id: 'enregistrer',
    icone: 'save' as const,
  },
  {
    // **La seule action qui n'a pas de spec**, et sa raison le dit : formater du SQL demande un
    // formateur, qui est une décision de dépendance à part entière — pas un détail d'écran.
    id: 'formater',
  },
] satisfies readonly {
  id: 'executer' | 'selection' | 'enregistrer' | 'formater'
  icone?: 'play' | 'save'
  raccourci?: string
  principale?: boolean
}[]
