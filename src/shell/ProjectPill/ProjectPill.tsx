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
  onOpenProjects?: () => void
}

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
  onOpenProjects,
}: ProjectPillProps) {
  return (
    <button type="button" className={styles.root} onClick={onOpenProjects}>
      {connection && (
        <span className={styles.dot} data-state={connection.kind} aria-hidden="true" />
      )}
      <Icon name="bag" size={12} strokeWidth={2} className={styles.bag} />
      <span className={styles.name}>{projectName}</span>
      <Icon name="chevd" size={11} strokeWidth={2.4} className={styles.chevron} />
      {breadcrumb && <span className={styles.breadcrumb}>{breadcrumb}</span>}
      {readOnly && (
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
      {connection && <span className={styles.srOnly}>{` ${libelleDeConnexion(connection)}`}</span>}
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
