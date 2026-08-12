import { Icon } from '../../design/icons/Icon'
import { SplitPane } from '../../ui/SplitPane/SplitPane'
import styles from './ConsoleView.module.css'

type ConsoleViewProps = {
  /** Le texte de la console. **L'écran le détient** : voir `12b` pour pourquoi. */
  texte: string
  onTexteChange: (texte: string) => void
  /** Le libellé de la base, pour le pied — `analytics · public`. */
  contexte?: string
}

/**
 * L'écran de console SQL (`12a`) : la toolbar, l'éditeur, le résultat.
 *
 * **Ce qui est livré ici est la coquille.** L'éditeur arrive en `12b` — la zone accepte du texte mais
 * n'a ni coloration ni numéros de ligne — et l'exécution en `12c`. Les actions qui en dépendent sont
 * **désactivées avec leur raison** : la règle de `09f`, et la leçon du défaut n° 36, où un bouton
 * cliquable et inerte s'est lu comme une panne.
 */
export function ConsoleView({ texte, onTexteChange, contexte }: ConsoleViewProps) {
  return (
    <div className={styles.root}>
      {/* `role="toolbar"`, comme celle de `A5` (`10e`) : un groupe de commandes qui agissent sur la
          même chose. Le nom la distingue — « Exécuter » ici et une action homonyme ailleurs
          s'annonceraient à l'identique sans lui. */}
      <div className={styles.toolbar} role="toolbar" aria-label="Actions de la console">
        {ACTIONS.map((action) => (
          <button
            key={action.libelle}
            type="button"
            className={action.principale ? styles.principale : styles.action}
            disabled
            title={action.raison}
          >
            {action.icone && <Icon name={action.icone} size={12} strokeWidth={2.1} />}
            {action.libelle}
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
            <textarea
              className={styles.editeur}
              aria-label="Requête SQL"
              value={texte}
              spellCheck={false}
              // Les quatre attributs de `08a` : macOS corrigeait `localhost` en `Localhost`, et une
              // requête SQL n'a pas plus à être corrigée qu'un nom d'hôte.
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              onChange={(evenement) => onTexteChange(evenement.target.value)}
            />
          }
          end={
            <div className={styles.resultat}>
              <p className={styles.vide}>
                Aucun résultat : l’exécution des requêtes arrive avec la spec suivante.
              </p>
            </div>
          }
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
    raison: 'L’exécution des requêtes arrive avec 12c.',
  },
  {
    libelle: 'Sélection',
    raccourci: '⌥↩',
    raison: 'Exécuter la sélection arrive avec 12c.',
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
