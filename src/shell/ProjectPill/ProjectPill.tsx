import type { ButtonHTMLAttributes } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { ConnectionState } from '../../domain/engine'
import { Badge } from '../../ui/Badge/Badge'
import styles from './ProjectPill.module.css'

type ProjectPillProps = {
  projectName: string
  /**
   * Le fil d'Ariane de la base ouverte : `analytics · public`. Absent quand aucune base ne
   * l'est — le mockup ne montre que le cas rempli.
   */
  breadcrumb?: string
  /**
   * L'état de la base **ouverte**, qui donne le point de couleur.
   *
   * Un projet n'a pas d'état de connexion — ses bases en ont. Le mockup montre un point vert
   * dans la pastille projet sans dire ce qu'il représente ; la seule lecture cohérente est
   * l'état de la base du fil d'Ariane. Absent, **aucun point** plutôt qu'un point gris inventé.
   * Question consignée au § « À trancher » de `specs/README.md`.
   */
  connection?: ConnectionState
  /** Vrai quand la base ouverte est en lecture seule. */
  readOnly?: boolean
  /**
   * Le nombre de modifications en attente (`11b`). Au-dessus de zéro, la pastille porte le badge
   * « ÉDITION » et son point passe à l'ambre.
   *
   * **Le point change de sens, et c'est le mockup qui le dit** : `A5` le montre vert (base
   * connectée), `A6` ambre — la même pastille, la même base. Il décrit donc l'état de l'**écran**
   * quand il y a quelque chose à signaler, et celui de la connexion sinon. Deux informations sur un
   * pixel de couleur n'est pas idéal ; le badge lève l'ambiguïté sans dépendre de la couleur, ce que
   * `09d` exige déjà de ses quatre états.
   */
  pendingChanges?: number
  onOpenProjects?: () => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>

/**
 * La pastille projet de la barre de titre des écrans de travail (`A4` → `A9`).
 *
 * **Toute la pastille est le bouton**, pas seulement le chevron : c'est ce que le mockup suggère
 * — aucun cadre n'entoure le chevron seul — et c'est une cible bien plus grande.
 */
export function ProjectPill({
  projectName,
  breadcrumb,
  connection,
  readOnly = false,
  pendingChanges = 0,
  onOpenProjects,
  ...rest
}: ProjectPillProps) {
  return (
    // `rest` est étalé pour que la pastille puisse **recevoir** ce qu'un parent lui donne :
    // `Popover` (`10a`) clone son déclencheur pour y poser `aria-haspopup`, `aria-expanded` et son
    // `onClick`. Sans cette transmission, le clone était silencieusement perdu — le menu de `08g`
    // ne s'ouvrait pas, et rien ne le signalait.
    <button type="button" className={styles.root} onClick={onOpenProjects} {...rest}>
      {(connection || pendingChanges > 0) && (
        <span
          className={styles.dot}
          data-state={pendingChanges > 0 ? 'pending' : connection?.kind}
          aria-hidden="true"
        />
      )}
      <Icon name="bag" size={12} strokeWidth={2} className={styles.bag} />
      <span className={styles.name}>{projectName}</span>
      <Icon name="chevd" size={11} strokeWidth={2.4} className={styles.chevron} />
      {breadcrumb && <span className={styles.breadcrumb}>{breadcrumb}</span>}
      {pendingChanges > 0 && (
        <Badge tone="warn" size="xs" icon={<Icon name="pencil" size={10} strokeWidth={2.6} />}>
          Édition
        </Badge>
      )}
      {/* **« Lecture seule » disparaît en édition** : les deux badges côte à côte se
          contrediraient. Le mockup de `A6` met « ÉDITION » là où `A5` met « LECTURE SEULE ». */}
      {readOnly && pendingChanges === 0 && (
        <Badge tone="muted" size="xs" icon={<Icon name="lock" size={10} strokeWidth={2.4} />}>
          Lecture seule
        </Badge>
      )}
      {/* **L'état en texte masqué visuellement, pas en `aria-label` sur le point.**
          `aria-label` sur un `<span>` sans rôle est *ignoré* — Biome le signale, et il a raison ;
          c'est le même piège qu'en `08c` avec le port local mappé. Le point étant une décoration
          du bouton, l'état a sa place dans le **nom du bouton**, que ce texte y ajoute.
          Un point vert et un point rouge sont de toute façon indiscernables pour une part des
          utilisateurs : la couleur renforce, elle ne porte pas.
          **Placé en dernier** : le nom se lit alors « Atelier Nord … connectée », l'identité
          avant l'état. En tête, il donnait « connectée · PostgreSQL 17.6Atelier Nord ».
          L'espace est explicite, faute de quoi les nœuds de texte se collent — le piège de
          `08a` et `09a`. */}
      {connection && pendingChanges === 0 && (
        <span className={styles.srOnly}>{` ${libelleDeConnexion(connection)}`}</span>
      )}
      {/* En édition, l'état annoncé est celui qui compte : ce qui attend d'être écrit. L'espace est
          explicite — le piège de `08a` et `09a`. */}
      {pendingChanges > 0 && (
        <span className={styles.srOnly}>
          {` ${pendingChanges} modification${pendingChanges > 1 ? 's' : ''} en attente`}
        </span>
      )}
    </button>
  )
}

/**
 * Le libellé d'un état de connexion.
 *
 * **Exporté**, parce que l'arbre de `09d` en a besoin lui aussi et que deux formulations
 * divergeraient. Les quatre états doivent se distinguer autrement que par la couleur.
 */
export function libelleDeConnexion(etat: ConnectionState): string {
  switch (etat.kind) {
    case 'never':
      return 'jamais connectée'
    case 'connecting':
      return 'connexion en cours'
    case 'connected':
      return `connectée · ${etat.serverVersion}`
    case 'offline':
      return `hors ligne · ${etat.reason}`
  }
}
