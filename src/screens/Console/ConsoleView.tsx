import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { QueryResult } from '../../domain/engine'
import { SplitPane } from '../../ui/SplitPane/SplitPane'
import { ConsoleResult } from './ConsoleResult'
import styles from './ConsoleView.module.css'
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
}: ConsoleViewProps) {
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
    if (action.libelle === 'Exécuter') return { ...action, onClick: executer }
    if (action.libelle === 'Sélection') return { ...action, onClick: executerLaSelection }
    return action
  })

  return (
    <div className={styles.root}>
      {/* `role="toolbar"`, comme celle de `A5` (`10e`) : un groupe de commandes qui agissent sur la
          même chose. Le nom la distingue — « Exécuter » ici et une action homonyme ailleurs
          s'annonceraient à l'identique sans lui. */}
      <div className={styles.toolbar} role="toolbar" aria-label="Actions de la console">
        {actions.map((action) => (
          <button
            key={action.libelle}
            type="button"
            className={action.principale ? styles.principale : styles.action}
            onClick={'onClick' in action ? action.onClick : undefined}
            disabled={!('onClick' in action) || action.onClick === undefined || enCours}
            title={'onClick' in action && action.onClick !== undefined ? undefined : action.raison}
          >
            {action.icone && <Icon name={action.icone} size={12} strokeWidth={2.1} />}
            {enCours && action.principale ? 'Exécution…' : action.libelle}
            {action.raccourci && <span className={styles.raccourci}>{action.raccourci}</span>}
          </button>
        ))}
        <span className={styles.espace} />
        {/* Le mockup montre l'auto-`LIMIT` comme un état affiché, pas comme un réglage : c'est `12c`
            qui l'appliquera, et `A10` qui le rendra réglable. */}
        <span className={styles.limite}>auto-LIMIT 1000</span>
      </div>

      <div className={styles.corps}>
        <SplitPane
          storageKey="console:resultat"
          orientation="vertical"
          defaultSize={240}
          min={120}
          max={520}
          handleShadow="end"
          start={
            <div className={styles.editeur}>
              <SqlEditor
                texteInitial={texte}
                onTexteChange={onTexteChange}
                onSelectionChange={setSelection}
                onExecuter={executer}
                onExecuterLaSelection={executerLaSelection}
              />
            </div>
          }
          end={<ConsoleResult resultat={resultat} erreur={erreur} enCours={enCours} />}
        />
      </div>

      {contexte && <div className={styles.pied}>{contexte}</div>}
    </div>
  )
}

/**
 * Les six actions de la toolbar du mockup, toutes désactivées à ce stade.
 *
 * **Présentes et désactivées, pas absentes** : les cacher ferait croire qu'elles n'existeront pas,
 * les laisser cliquables et inertes ferait croire à une panne. Chacune porte sa raison.
 */
const ACTIONS = [
  {
    libelle: 'Exécuter',
    icone: 'play' as const,
    raccourci: '⌘↩',
    principale: true,
    raison: 'Aucune base n’est ouverte : il n’y a rien à interroger.',
  },
  {
    libelle: 'Sélection',
    raccourci: '⌥↩',
    raison: 'Aucune base n’est ouverte : il n’y a rien à interroger.',
  },
  {
    libelle: 'Expliquer',
    icone: 'plan' as const,
    raison: 'Le plan d’exécution arrive avec 12e.',
  },
  {
    libelle: 'Enregistrer',
    icone: 'save' as const,
    raison: 'Les requêtes enregistrées arrivent avec 12f.',
  },
  {
    libelle: 'Formater',
    // **La seule action qui n'a pas de spec**, et sa raison le dit : formater du SQL demande un
    // formateur, qui est une décision de dépendance à part entière — pas un détail d'écran.
    raison: 'Formater demande un formateur SQL : aucune dépendance n’a encore été choisie.',
  },
] satisfies readonly {
  libelle: string
  icone?: 'play' | 'plan' | 'save'
  raccourci?: string
  principale?: boolean
  raison: string
}[]
