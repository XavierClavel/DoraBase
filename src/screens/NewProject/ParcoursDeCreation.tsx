import { useState } from 'react'
import type {
  CreateProjectRequest,
  EnvironmentDeclaration,
  EnvironmentId,
  Project,
} from '../../domain/config'
import { NewConnection } from '../NewConnection/NewConnection'
import { NewProject } from './NewProject'

type ParcoursDeCreationProps = {
  /**
   * `projet` entre à l'étape 1 ; `connexion` entre directement à l'étape 2, dans le projet nommé.
   *
   * **Deux gestes, un seul composant** (`24d`) : c'est le paramètre d'entrée qui décide, et la bande de
   * progression en découle. Deux modales auraient deux formulaires de connexion à tenir.
   */
  depart:
    | {
        etape: 'projet' /** Voir `NewProject.raison` — le cas « aucun projet » de `24d`. */
        raison?: string
      }
    | {
        etape: 'connexion'
        projet: string
        /**
         * L'environnement visé, quand le geste part d'un palier d'arbre (26 août 2026).
         *
         * Absent, l'étape 2 propose le défaut de `emptyDraft` — `dev`, le moins risqué. Présent, elle
         * part sur l'environnement d'où l'on a cliqué : le redemander serait poser une question dont
         * l'appelant connaissait déjà la réponse.
         */
        environnement?: EnvironmentId
      }
  projets: readonly { id: string; name: string; environments: readonly EnvironmentDeclaration[] }[]
  onClose: () => void
  /** Les projets à jour, après création ou enregistrement. */
  onProjets: (projects: Project[]) => void
  onCreate?: (request: CreateProjectRequest) => Promise<Project[]>
}

/**
 * Le parcours de création : un projet, puis sa première connexion (`24c`).
 *
 * # Ce qu'il orchestre, et ce qu'il ne fait pas
 *
 * Il tient l'étape courante, et rien d'autre. Les deux écrans qu'il enchaîne sont ceux qui existaient
 * déjà — `NewProject` (`24a`) et `NewConnection` — et il ne duplique aucun de leurs états : le nom du
 * projet créé lui suffit pour passer à l'étape 2.
 *
 * **Il n'y a pas de retour.** Le projet est écrit à la fin de l'étape 1 : revenir voudrait dire
 * renommer un projet existant, ce qui est le geste de `23e`. La bande de progression ne le propose pas
 * (`24b`), et rien d'autre non plus.
 *
 * **Un projet créé puis abandonné reste**, vide, et rien ne le nettoie — arbitrage du commanditaire du
 * 19 août 2026, reconduisant celui de `08f`. Défaire la création à la suite d'un abandon supprimerait
 * un projet pour un échec de connexion, et détruirait un homonyme en cas de course. L'arbre le montre
 * avec sa phrase de `23g`, et `08j` sait le retirer.
 */
export function ParcoursDeCreation({
  depart,
  projets,
  onClose,
  onProjets,
  onCreate,
}: ParcoursDeCreationProps) {
  const [projetCree, setProjetCree] = useState<string | null>(
    depart.etape === 'connexion' ? depart.projet : null,
  )
  // Les projets à jour après l'étape 1 : l'étape 2 a besoin des environnements du projet créé, et
  // relire la liste d'origine ne les contiendrait pas.
  const [apresCreation, setApresCreation] = useState<Project[] | null>(null)

  if (projetCree === null) {
    return (
      <NewProject
        projets={projets}
        onClose={onClose}
        {...(onCreate === undefined ? {} : { onCreate })}
        {...(depart.etape === 'projet' && depart.raison !== undefined
          ? { raison: depart.raison }
          : {})}
        onCreated={(projects, nom) => {
          onProjets(projects)
          setApresCreation(projects)
          setProjetCree(nom)
        }}
      />
    )
  }

  const listeAJour =
    apresCreation?.map((projet) => ({
      id: projet.name,
      name: projet.name,
      environments: projet.environments,
    })) ?? projets

  return (
    <NewConnection
      projects={listeAJour}
      // **Imposé, non choisi** : à l'étape 2, le projet est celui de l'étape 1 (`24c`). C'est ce qui
      // remplace le sélecteur par un constat et fait paraître la bande.
      projetImpose={projetCree}
      {...(depart.etape === 'connexion' && depart.environnement !== undefined
        ? { cible: { project: projetCree, environment: depart.environnement } }
        : {})}
      onClose={onClose}
      onSaved={onProjets}
    />
  )
}
