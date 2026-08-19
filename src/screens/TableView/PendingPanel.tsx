import { Icon } from '../../design/icons/Icon'
import type { EnvironmentId } from '../../domain/config'
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
  environment?: EnvironmentId
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
  /** Vrai pendant l'écriture : les actions attendent. */
  enCours?: boolean
  /** Le refus de l'application — conflit, contrainte violée. Affiché ici, près du diff. */
  refus?: string | null
  /**
   * Le SQL qui **annule** l'application qui vient de réussir (`11d`).
   *
   * Disponible tant que l'onglet est ouvert, pas persisté : `A10` en fera une préférence à 24 h, ce
   * qui suppose de décider où le garder et ce qu'il advient d'un patch dont la base a changé.
   */
  patchInverse?: string | null
  onCopierLePatch?: () => void
  /** Écarte le rapport d'écriture et revient à la lecture. */
  onEcarterLePatch?: () => void
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
  enCours = false,
  refus = null,
  patchInverse = null,
  onCopierLePatch,
  onEcarterLePatch,
}: PendingPanelProps) {
  // **Deux états pour un panneau** : ce qui attend d'être écrit, et ce qui vient de l'être. Le
  // second n'a ni carte ni SQL à venir — seulement de quoi défaire.
  const apresEcriture = attente.length === 0 && patchInverse !== null
  return (
    // `<aside>` et non un `div` avec `aria-label` : **un nom accessible sur un élément sans rôle est
    // ignoré**, et Biome a raison de le signaler — le même piège qu'en `08c` avec le port local et
    // qu'en `09c` avec le point d'état. L'élément sémantique porte le rôle `complementary`, ce que ce
    // panneau est : un complément de la grille.
    <aside className={styles.root} aria-label="Modifications en attente de la table">
      <header className={styles.entete}>
        <Icon name="pencil" size={13} strokeWidth={2.1} className={styles.icone} />
        <h2 className={styles.titre}>
          {apresEcriture ? 'Écriture appliquée' : 'Modifications en attente'}
        </h2>
        {apresEcriture ? (
          <Badge tone="success" size="xs">
            fait
          </Badge>
        ) : (
          <Badge tone="warn" size="xs">
            {attente.length}
          </Badge>
        )}
      </header>

      <div className={styles.corps}>
        {/* **Après une écriture réussie, le modèle est vide** — et le panneau reste pour montrer de
            quoi défaire. Une première version le démontait avec la dernière carte, emportant le
            patch inverse avec elle : l'utilisateur perdait le seul moyen d'annuler, à l'instant
            précis où il pouvait en avoir besoin. Trouvé par le test de relecture. */}
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

        {!apresEcriture && (
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
        )}

        {refus !== null && (
          <p className={styles.refus} role="alert">
            {refus}
          </p>
        )}

        {patchInverse !== null && (
          // **Après le succès, de quoi défaire.** Le montrer est le minimum honnête : `A10`
          // promettra de le garder 24 h, et annoncer cette garantie sans la tenir serait pire que ne
          // rien annoncer.
          <section className={styles.bloc}>
            <div className={styles.blocEntete}>
              <span className={styles.blocTitre}>SQL qui annule cette écriture</span>
              {onCopierLePatch && (
                <button type="button" className={styles.copier} onClick={onCopierLePatch}>
                  <Icon name="copy" size={11} strokeWidth={2} />
                  Copier
                </button>
              )}
            </div>
            <SqlColore texte={patchInverse} />
            <p className={styles.rappelPatch}>
              Disponible tant que cet onglet est ouvert. DoraBase ne l’a pas enregistré.
            </p>
          </section>
        )}

        {environment === 'prod' && !apresEcriture && (
          // Sur l'**environnement déclaré**, jamais sur une devinette à partir du nom de l'hôte :
          // un serveur nommé `db-prod-replica` peut être une copie de travail, et l'inverse existe.
          <p className={styles.production}>
            <Icon name="warn" size={12} strokeWidth={2.2} className={styles.productionIcone} />
            {/* **Rédigé au présent depuis `11d`, et sans la promesse des 24 h.** `11c` l'annonçait au
                futur — « demandera une confirmation supplémentaire et gardera le patch inverse
                pendant 24 h » — parce que rien ne le livrait encore. La confirmation existe
                maintenant, donc elle se dit au présent ; la conservation du patch, elle, n'existe
                pas : `A10` en fera une préférence, et l'annoncer avant serait une promesse fausse.
                C'est le panneau qui dit ce qu'il en est vraiment, sous le patch lui-même. */}
            <span>
              Cette base est en <strong>production</strong>. DoraBase demande une confirmation avant
              d’écrire, et affiche ensuite le SQL qui annule l’écriture.
            </span>
          </p>
        )}
      </div>

      <footer className={styles.pied}>
        <span className={styles.cible}>{table}</span>
        {apresEcriture ? (
          // Rien à annuler ni à appliquer : l'écriture a eu lieu. Le seul geste restant est
          // d'écarter le rapport pour revenir à la lecture.
          <button type="button" className={styles.annuler} onClick={onEcarterLePatch}>
            Fermer
          </button>
        ) : (
          <>
            {/* **« Tout annuler » existe aussi dans le bandeau de `11b`**, et le mockup montre bien les
            deux. Ce n'est pas une duplication à corriger : le bandeau est visible quel que soit le
            panneau ouvert, et le pied est là où l'on arrive après avoir relu le diff. Les deux font
            exactement la même chose, ce qui rend l'homonymie sans danger — à la différence de deux
            contrôles homonymes aux effets distincts, écartés en `08i`. */}
            <button
              type="button"
              className={styles.annuler}
              onClick={onToutAnnuler}
              disabled={enCours}
            >
              Tout annuler
            </button>
            <button
              type="button"
              className={styles.appliquer}
              onClick={onAppliquer}
              disabled={onAppliquer === undefined || enCours}
              title={
                onAppliquer === undefined
                  ? 'L’écriture dans la base n’est pas encore branchée : rien ne peut partir.'
                  : undefined
              }
            >
              <Icon name="check" size={12} strokeWidth={2.6} />
              {enCours ? 'Écriture…' : 'Appliquer'}
              <span className={styles.raccourci}>⌘↩</span>
            </button>
          </>
        )}
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
