import { Icon } from '../../design/icons/Icon'
import type { Database, Project } from '../../domain/config'
import { Popover } from '../../ui/Popover/Popover'
import styles from './ProjectMenu.module.css'

type ProjectMenuProps = {
  projects: readonly Project[]
  /** Le projet dont les bases sont listées en premier — celui de la base ouverte. */
  actif: Project | null
  onEdit: (project: string, database: Database) => void
  onAddDatabase?: () => void
  /**
   * Ouvre la modale d'édition d'un projet (`23e`).
   *
   * Absent, l'entrée n'est pas rendue — plutôt que rendue inerte. Ce menu n'a pas de mécanisme de
   * raison écrite (il n'est pas un `RowMenu`), et un bouton muet qui ne fait rien est le défaut n° 36 ;
   * son absence, elle, ne promet rien.
   */
  onEditProject?: (project: string) => void
  children: React.ReactElement<Record<string, unknown>>
}

/**
 * Le menu de la pastille projet : les bases du projet, et le chemin vers leur modification.
 *
 * **Le point d'entrée existait déjà, inerte.** `ProjectPill` porte un `onOpenProjects` depuis
 * `09c` que rien n'appelait, et le mockup dessine un chevron sur la pastille — le design prévoit
 * donc un menu déroulant, sans en montrer le contenu. C'est un trou du handoff : le minimum
 * défendable est une liste des bases, sans inventer d'actions que rien ne réclame.
 *
 * Il porte `Popover` de `10a` : pas de nouveau composant, et les trois fermetures viennent avec.
 */
export function ProjectMenu({
  projects,
  actif,
  onEdit,
  onAddDatabase,
  onEditProject,
  children,
}: ProjectMenuProps) {
  // Le projet actif d'abord : c'est celui dont on regarde une base, donc celui qu'on veut corriger.
  const ordonnes = actif
    ? [actif, ...projects.filter((projet) => projet.name !== actif.name)]
    : [...projects]

  return (
    <Popover
      title="Projets et bases"
      content={(fermer) => (
        <div className={styles.root}>
          {ordonnes.map((projet) => (
            <section key={projet.name} className={styles.projet}>
              <h3 className={styles.nom}>
                <Icon name="bag" size={12} strokeWidth={1.8} className={styles.sac} />
                {projet.name}
                {onEditProject && (
                  <button
                    type="button"
                    className={styles.modifier}
                    aria-label={`Modifier ${projet.name}`}
                    onClick={() => {
                      fermer()
                      onEditProject(projet.name)
                    }}
                  >
                    <Icon name="pencil" size={12} strokeWidth={1.9} />
                  </button>
                )}
              </h3>
              {projet.databases.length === 0 ? (
                // Un projet vide est un état normal depuis `08f` — sa création n'exige pas une base.
                // Le taire laisserait croire à un défaut d'affichage.
                <p className={styles.vide}>Aucune base déclarée.</p>
              ) : (
                <ul className={styles.bases}>
                  {projet.databases.map((base) => (
                    <li key={base.name}>
                      <button
                        type="button"
                        className={styles.base}
                        onClick={() => {
                          fermer()
                          onEdit(projet.name, base)
                        }}
                      >
                        <Icon name="db" size={12} strokeWidth={1.8} className={styles.db} />
                        <span className={styles.baseNom}>{base.name}</span>
                        {/* **L'environnement de la connexion**, qui est ce qui distingue deux entrées
                          de même nom (`23b`) — et ce que l'utilisateur cherche quand il corrige un
                          port. C'était la liste des variantes d'une même base ; il n'y en a plus. */}
                        <span className={styles.envs}>
                          {libelleDeLEnvironnement(projet, base.environment)}
                        </span>
                        <Icon name="pencil" size={12} strokeWidth={1.9} className={styles.crayon} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {onAddDatabase && (
            <button
              type="button"
              className={styles.ajouter}
              onClick={() => {
                fermer()
                onAddDatabase()
              }}
            >
              <Icon name="plus" size={12} strokeWidth={2.2} />
              Ajouter une connexion
            </button>
          )}
        </div>
      )}
    >
      {children}
    </Popover>
  )
}

/**
 * Le libellé d'un environnement, tel que **son projet** le déclare (`23a`).
 *
 * Un identifiant à défaut : le modèle refuse une connexion visant un environnement non déclaré, donc
 * ce cas ne s'affiche jamais — mais afficher l'identifiant vaut mieux qu'une chaîne vide, qui se
 * lirait comme une connexion sans environnement.
 */
function libelleDeLEnvironnement(projet: Project, environnement: string): string {
  return (
    projet.environments.find((declaration) => declaration.id === environnement)?.label ??
    environnement
  )
}
