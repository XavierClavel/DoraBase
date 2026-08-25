import { Icon } from '../../design/icons/Icon'
import type { EnvironmentColor } from '../../domain/config'
import type { ConnectionState } from '../../domain/engine'
import { COULEURS_D_ENVIRONNEMENT } from '../../screens/NewConnection/environments'
import { Badge } from '../../ui/Badge/Badge'
import styles from './SelectionIndicator.module.css'

type SelectionIndicatorProps = {
  projectName: string
  /**
   * L'environnement de la sélection, **tel qu'il est déclaré** (`23a`).
   *
   * Absent quand la sélection ne le désigne pas — une ligne de projet, par exemple. Le libellé
   * s'affiche alors seul, plutôt qu'accompagné d'un environnement deviné.
   */
  environment?: { label: string; color: EnvironmentColor; production: boolean }
  /**
   * Le fil d'Ariane de la connexion ouverte : `analytics · public`. Absent quand rien n'est ouvert.
   */
  breadcrumb?: string
  /**
   * L'état de la connexion **ouverte**, qui donne le point de couleur.
   *
   * Un projet n'a pas d'état de connexion — ses connexions en ont. Absent, **aucun point** plutôt
   * qu'un point gris inventé.
   */
  connection?: ConnectionState
  /** Vrai quand la connexion ouverte est en lecture seule. */
  readOnly?: boolean
  /**
   * Le nombre de modifications en attente (`11b`). Au-dessus de zéro, l'indicateur porte le badge
   * « ÉDITION » et son point passe à l'ambre.
   *
   * **Le point change de sens, et c'est le mockup qui le dit** : `A5` le montre vert (connexion
   * ouverte), `A6` ambre — la même connexion. Il décrit donc l'état de l'**écran** quand il y a
   * quelque chose à signaler, et celui de la connexion sinon. Le badge lève l'ambiguïté sans
   * dépendre de la couleur, ce que `09d` exige déjà de ses quatre états.
   */
  pendingChanges?: number
}

/**
 * Ce que la barre de titre indique : le projet, l'environnement, ce qui est ouvert (`25b`).
 *
 * # Un indicateur, plus un contrôle
 *
 * C'était `ProjectPill` : un `<button>` dans une boîte blanche bordée, avec un chevron, qui ouvrait
 * le menu des projets et bases. À sa droite, dans une seconde boîte, un sélecteur d'environnement.
 * Les deux sont partis — l'environnement se choisit désormais dans l'arbre, où il est un palier
 * (`25a`), et le menu des projets vit dans le « … » de la ligne projet.
 *
 * **La boîte blanche part avec le bouton.** Un encadré sur fond de barre est une affordance, et ce
 * dépôt a déjà tranché ce point exact en refusant un `Chip` inerte pour la cellule « Projet » de
 * `24` : un contrôle inerte se lit comme un contrôle en panne. D'autant que cette boîte *a été* un
 * bouton pendant tout le développement — la garder inviterait au clic qu'elle a longtemps accepté.
 *
 * # Ce qui reste, et pourquoi
 *
 * L'élision sur le nom **et** sur le fil d'Ariane : c'est ce qui empêche un nom long de pousser les
 * icônes d'action hors de la barre. `.center` ne peut pas s'en charger — un `overflow: hidden` y
 * découpait le menu projet (défaut du 10 août 2026), et même sans menu ce n'est pas au conteneur de
 * décider ce qu'on sacrifie.
 *
 * # Le libellé d'environnement n'est pas capitalisé
 *
 * Depuis `23a` il est renommable : c'est une chaîne de l'utilisateur, et « Pré-production » ne doit
 * pas devenir « PRÉ-PRODUCTION ». Le seul mot en capitales est `PROD`, parce que c'est une catégorie
 * et non un nom — et il suit le **drapeau**, jamais le libellé ni la couleur déclarée.
 *
 * # Aucun rôle, et surtout pas `role="status"`
 *
 * `status` est une région live implicite. La sélection changeant à **chaque flèche** dans l'arbre, un
 * lecteur d'écran énoncerait tout l'indicateur par-dessus l'annonce de la ligne en cours de
 * parcours : c'est le pire endroit du produit pour une région live.
 *
 * `role="group"` a été essayé, et écarté : ARIA le destine à un ensemble de **contrôles** — Biome le
 * signale d'ailleurs en proposant `<fieldset>`, ce qui serait faux pour une zone en lecture seule.
 * Cette zone n'est que du texte, lu dans l'ordre du document, et c'est exactement ce qu'un indicateur
 * doit être. Ce qui compte pour un lecteur d'écran, c'est que la couleur ne porte rien seule : d'où
 * les mentions masquées visuellement, ci-dessous.
 */
export function SelectionIndicator({
  projectName,
  environment,
  breadcrumb,
  connection,
  readOnly = false,
  pendingChanges = 0,
}: SelectionIndicatorProps) {
  return (
    <div className={styles.root}>
      {(connection || pendingChanges > 0) && (
        <span
          className={styles.dot}
          data-state={pendingChanges > 0 ? 'pending' : connection?.kind}
          aria-hidden="true"
        />
      )}
      <Icon name="bag" size={12} strokeWidth={2} className={styles.bag} />
      <span className={styles.name}>{projectName}</span>
      {environment && (
        <>
          {/* La couleur **arrive de la déclaration**, non d'un attribut lu par le CSS : une table de
              teintes par identifiant redeviendrait le trio en dur que `23a` a fait disparaître. */}
          <span
            className={styles.envDot}
            style={{ background: COULEURS_D_ENVIRONNEMENT[environment.color] }}
            aria-hidden="true"
          />
          <span className={styles.env}>{environment.label}</span>
          {environment.production && (
            <Badge tone="danger" size="xs">
              PROD
            </Badge>
          )}
        </>
      )}
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
          `aria-label` sur un `<span>` sans rôle est *ignoré* — Biome le signale, et il a raison.
          Le point étant une décoration, l'état a sa place dans le nom du groupe, que ce texte y
          ajoute. Un point vert et un point rouge sont de toute façon indiscernables pour une part
          des utilisateurs : la couleur renforce, elle ne porte pas.
          Les espaces sont explicites, faute de quoi les nœuds de texte se collent — le piège de
          `08a`, `09a` et `09c`. */}
      {connection && pendingChanges === 0 && (
        <span className={styles.srOnly}>{` ${libelleDeConnexion(connection)}`}</span>
      )}
      {pendingChanges > 0 && (
        <span className={styles.srOnly}>
          {` ${pendingChanges} modification${pendingChanges > 1 ? 's' : ''} en attente`}
        </span>
      )}
      {/* **« Prod » est un sigle**, et la pastille de couleur est `aria-hidden` : sans cette ligne,
          rien n'annoncerait en clair qu'on regarde une production. */}
      {environment?.production === true && (
        <span className={styles.srOnly}> environnement de production</span>
      )}
    </div>
  )
}

/**
 * Le libellé d'un état de connexion.
 *
 * Les quatre états doivent se distinguer autrement que par la couleur. `arbre.ts` a son propre
 * `resumeEtat` — deux formulations, et c'est assumé : celle-ci nomme la version du serveur, dont une
 * ligne d'arbre n'a pas la place.
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
