import { Icon } from '../../design/icons/Icon'
import type { Environment } from '../../domain/config'
import type { Value } from '../../domain/engine'
import { Badge } from '../../ui/Badge/Badge'
import { cx } from '../../ui/cx'
import type { EnAttente, Modification, Saisie } from './modifications'
import styles from './PendingPanel.module.css'
import { SqlColore } from './SqlColore'

type PendingPanelProps = {
  attente: EnAttente
  /** `public.orders`, pour l'en-tête des cartes et le titre. */
  table: string
  /** L'environnement de la base : l'encart d'avertissement n'existe que pour `prod`. */
  environment?: Environment
  /**
   * Le SQL rendu par le moteur, ou `null` tant qu'il n'est pas revenu.
   *
   * **Jamais fabriqué ici.** Le bloc annonce « SQL qui sera exécuté » : composer un équivalent côté
   * écran demanderait au JavaScript de citer les identifiants et littéraliser les valeurs pour sept
   * moteurs, et surtout produirait un texte *ressemblant* à celui qui partira. Tant que le cœur ne
   * l'a pas rendu, le panneau le dit.
   */
  sql: string | null
  /** Le refus de la prévisualisation, s'il y en a un. */
  erreurSql?: string | null
  onRetirer: (cle: string, column: string) => void
  onToutAnnuler: () => void
  onAppliquer?: () => void
  onCopierLeSQL?: () => void
}

/**
 * Le panneau droit du mode édition (`11c`) : une carte par modification, le diff, le SQL.
 *
 * **Il remplace le panneau de `10f`, il ne s'y ajoute pas.** `10f` a posé qu'il y a *un* panneau
 * droit dont le contenu suit l'écran. Conséquence assumée, et c'est ce que le mockup montre : en
 * éditant, on ne voit plus le détail de la ligne sélectionnée — ce qu'on veut voir est ce qu'on a
 * changé.
 *
 * **Le diff se lit, il ne s'édite pas.** Le mockup n'y met aucun champ ; la correction se fait dans
 * la grille, là où l'on voit la ligne entière.
 */
export function PendingPanel({
  attente,
  table,
  environment,
  sql,
  erreurSql = null,
  onRetirer,
  onToutAnnuler,
  onAppliquer,
  onCopierLeSQL,
}: PendingPanelProps) {
  return (
    // `<aside>` et non un `div` avec `aria-label` : **un nom accessible sur un élément sans rôle est
    // ignoré**, et Biome a raison de le signaler — le même piège qu'en `08c` avec le port local et
    // qu'en `09c` avec le point d'état. L'élément sémantique porte le rôle `complementary`, ce que ce
    // panneau est : un complément de la grille.
    <aside className={styles.root} aria-label="Modifications en attente de la table">
      <header className={styles.entete}>
        <Icon name="pencil" size={13} strokeWidth={2.1} className={styles.icone} />
        <h2 className={styles.titre}>Modifications en attente</h2>
        <Badge tone="warn" size="xs">
          {attente.length}
        </Badge>
      </header>

      <div className={styles.corps}>
        <ul className={styles.cartes}>
          {attente.map((modification) => (
            <li key={`${modification.cle}::${modification.column}`} className={styles.carte}>
              <div className={styles.carteEntete}>
                {/* Le rang **et** la clé : le rang situe la ligne à l'écran, la clé l'identifie
                    quand un tri l'aura déplacée (`11a`). */}
                <span className={styles.position}>
                  ligne {modification.rang} · {modification.cle}
                </span>
                <button
                  type="button"
                  className={styles.retirer}
                  aria-label={`Retirer la modification de ${modification.column}`}
                  onClick={() => onRetirer(modification.cle, modification.column)}
                >
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              </div>
              <div className={styles.colonne}>{modification.column}</div>
              <div className={styles.diff}>
                <Avant valeur={modification.avant} />
                <Icon name="chevr" size={10} strokeWidth={2.4} className={styles.fleche} />
                <Apres saisie={modification.apres} />
              </div>
            </li>
          ))}
        </ul>

        <section className={styles.bloc}>
          <div className={styles.blocEntete}>
            <span className={styles.blocTitre}>SQL qui sera exécuté</span>
            {onCopierLeSQL && sql !== null && (
              <button type="button" className={styles.copier} onClick={onCopierLeSQL}>
                <Icon name="copy" size={11} strokeWidth={2} />
                Copier
              </button>
            )}
          </div>
          {erreurSql !== null ? (
            <p className={styles.absent} role="alert">
              {erreurSql}
            </p>
          ) : sql === null ? (
            // **Pas de SQL fabriqué en attendant.** Un texte plausible affiché sous ce titre serait
            // pire qu'une absence : c'est le dernier endroit où l'on vérifie avant d'écrire.
            <p className={styles.absent}>Le moteur prépare la requête…</p>
          ) : (
            <SqlColore texte={sql} />
          )}
        </section>

        {environment === 'prod' && (
          // Sur l'**environnement déclaré**, jamais sur une devinette à partir du nom de l'hôte :
          // un serveur nommé `db-prod-replica` peut être une copie de travail, et l'inverse existe.
          <p className={styles.production}>
            <Icon name="warn" size={12} strokeWidth={2.2} className={styles.productionIcone} />
            <span>
              Cette base est en <strong>production</strong>. DoraBase demandera une confirmation
              supplémentaire et gardera le patch inverse pendant 24 h.
            </span>
          </p>
        )}
      </div>

      <footer className={styles.pied}>
        <span className={styles.cible}>{table}</span>
        {/* **« Tout annuler » existe aussi dans le bandeau de `11b`**, et le mockup montre bien les
            deux. Ce n'est pas une duplication à corriger : le bandeau est visible quel que soit le
            panneau ouvert, et le pied est là où l'on arrive après avoir relu le diff. Les deux font
            exactement la même chose, ce qui rend l'homonymie sans danger — à la différence de deux
            contrôles homonymes aux effets distincts, écartés en `08i`. */}
        <button type="button" className={styles.annuler} onClick={onToutAnnuler}>
          Tout annuler
        </button>
        <button
          type="button"
          className={styles.appliquer}
          onClick={onAppliquer}
          disabled={onAppliquer === undefined}
          title={
            onAppliquer === undefined
              ? 'L’écriture dans la base n’est pas encore branchée : rien ne peut partir.'
              : undefined
          }
        >
          <Icon name="check" size={12} strokeWidth={2.6} />
          Appliquer
          <span className={styles.raccourci}>⌘↩</span>
        </button>
      </footer>
    </aside>
  )
}

/**
 * L'ancienne valeur, barrée, **avec sa forme**.
 *
 * Trois natures, trois rendus, et c'est ce qui rend le diff lisible : « `NULL` → valeur » et
 * « `''` → valeur » sont deux changements différents qu'un rendu unique confondrait.
 */
function Avant({ valeur }: { valeur: Value }) {
  if (valeur.kind === 'null') {
    return <span className={cx(styles.jeton, styles.avant, styles.nul)}>NULL</span>
  }
  const texte = brut(valeur)
  return (
    <span className={cx(styles.jeton, styles.avant)}>
      {texte === '' ? <span className={styles.vide}>''</span> : texte}
    </span>
  )
}

function Apres({ saisie }: { saisie: Saisie }) {
  if (saisie.kind === 'null') {
    return <span className={cx(styles.jeton, styles.apres, styles.nul)}>NULL</span>
  }
  return (
    <span className={cx(styles.jeton, styles.apres)}>
      {saisie.texte === '' ? <span className={styles.vide}>''</span> : saisie.texte}
    </span>
  )
}

/**
 * La valeur d'origine en texte brut.
 *
 * Volontairement **non formatée** — pas de groupement des milliers : le diff montre ce que la base
 * contient et ce qui partira, et « 12 900 → 12901 » ferait douter d'une valeur pourtant juste.
 */
function brut(valeur: Value): string {
  switch (valeur.kind) {
    case 'null':
      return 'NULL'
    case 'bool':
      return valeur.value ? 'true' : 'false'
    case 'int':
    case 'float':
      return String(valeur.value)
    case 'decimal':
    case 'text':
    case 'timestamp':
    case 'json':
      return valeur.value
    case 'binary':
      return valeur.base64
  }
}

/** Le type est exporté pour les tests de l'écran, qui construisent des modifications. */
export type { Modification }
