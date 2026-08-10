import { Icon } from '../../design/icons/Icon'
import type { Database, Project } from '../../domain/config'
import { Popover } from '../../ui/Popover/Popover'
import { ENVIRONMENTS } from '../NewConnection/environments'
import styles from './ProjectMenu.module.css'

type ProjectMenuProps = {
  projects: readonly Project[]
  /** Le projet dont les bases sont listées en premier — celui de la base ouverte. */
  actif: Project | null
  onEdit: (project: string, database: Database) => void
  onAddDatabase?: () => void
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
                        {/* Les environnements déclarés : c'est ce qui distingue deux entrées de même
                          nom, et ce que l'utilisateur cherche quand il corrige un port. */}
                        <span className={styles.envs}>
                          {base.variants
                            .map((variante) => ENVIRONMENTS[variante.environment].label)
                            .join(' · ')}
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
              Ajouter une base
            </button>
          )}
        </div>
      )}
    >
      {children}
    </Popover>
  )
}
