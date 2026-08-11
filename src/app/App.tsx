import { lazy, Suspense, useEffect, useState } from 'react'
import { useConfiguration } from '../data/useConfiguration'
import { Sprite } from '../design/icons/Sprite'
import type { Database, Project } from '../domain/config'
import {
  renommerLeProjet,
  retirerLaConnexion,
  retirerLeProjet,
} from '../screens/NewConnection/enregistrerLaBase'
import { NewConnection } from '../screens/NewConnection/NewConnection'
import { WelcomeScreen } from '../screens/Welcome/WelcomeScreen'
import { Workbench } from '../screens/Workbench/Workbench'

// La galerie (`src/design/gallery/`) ne doit jamais partir dans le bundle livré : elle
// est montée derrière deux conditions, `import.meta.env.DEV` ET `?gallery` dans l'URL.
// `import.meta.env.DEV` est remplacé par `false` à la construction de production ; le
// bloc qui suit devient alors du code mort que Vite/Rollup élague — y compris l'appel
// `import()` lui-même, qui ne doit donc apparaître nulle part dans `dist/`. Un import
// statique de `Gallery` aurait suffi à la faire fuir dans le bundle initial ; l'import
// dynamique évite ce piège même si l'élagage venait à échouer.
const showGallery =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('gallery')

const Gallery = showGallery
  ? lazy(() => import('../design/gallery/Gallery').then((module) => ({ default: module.Gallery })))
  : null

// L'écran de travail sur données figées, monté aux mêmes deux conditions que la galerie et
// pour une raison analogue : Playwright pilote Chromium, où le pont Tauri ne répond pas, et
// `10b` exige qu'au moins un test parte de `/` plutôt que de `?gallery`.
const showDemo = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')

const WorkbenchDemo = showDemo
  ? lazy(() =>
      import('../screens/Workbench/demo').then((module) => ({ default: module.WorkbenchDemo })),
    )
  : null

export function App() {
  const [connexionOuverte, setConnexionOuverte] = useState(false)
  /**
   * La base en cours de modification (`08g`), ou `null` quand la modale **crée**.
   *
   * Un seul état pour les deux usages : c'est la même modale, et deux drapeaux indépendants
   * permettraient de l'ouvrir en création *et* en édition à la fois.
   */
  const [edition, setEdition] = useState<{ project: string; database: Database } | null>(null)
  /**
   * Les projets connus, **relus au démarrage** depuis `09b`.
   *
   * La boucle du produit est désormais complète : saisir (`08e`), persister, relire, afficher.
   * `load_config` existait depuis `05b` et n'était appelée par personne — une base enregistrée
   * était bien écrite sur le disque mais jamais retrouvée au lancement suivant.
   */
  const configuration = useConfiguration()
  const [projects, setProjects] = useState<Project[]>([])

  // Les projets lus alimentent l'état local, que `08e` met ensuite à jour après chaque
  // enregistrement. Deux sources pour une même liste, mais dans le temps : le disque au
  // démarrage, la commande ensuite — et c'est la commande qui rend la liste à jour, donc les
  // deux ne peuvent pas diverger.
  useEffect(() => {
    if (configuration.kind !== 'chargement') setProjects(configuration.projects)
  }, [configuration])

  return (
    <>
      <Sprite />
      {Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : configuration.kind ===
        'chargement' ? // Rien pendant la lecture : afficher `A1` (« aucun projet ») ferait clignoter l'écran
      // d'accueil devant un utilisateur qui en a dix. La lecture d'un fichier local est
      // immédiate ; un état de chargement visible serait un scintillement de plus.
      null : WorkbenchDemo ? (
        <Suspense fallback={null}>
          <WorkbenchDemo />
        </Suspense>
      ) : projects.length > 0 ? (
        // **Un projet existe : l'écran de travail est le bon écran.** `A1` est l'écran des
        // débuts — `07` le décrit comme « première ouverture, aucun projet » — et le laisser
        // devant un utilisateur qui a dix bases ferait de l'accueil une impasse. C'est aussi ce
        // qui rend `A4` atteignable : jusqu'ici, rien ne le montait.
        <>
          <Workbench
            projects={projects}
            onNewDatabase={() => setConnexionOuverte(true)}
            onEditDatabase={(project, database) => setEdition({ project, database })}
            // Le renommage rend les projets à jour : les reposer ici évite un second aller-retour,
            // et supprime la fenêtre pendant laquelle l'arbre montrerait l'ancien nom.
            onDelete={async (cible) => {
              const issue =
                cible.kind === 'project'
                  ? await retirerLeProjet({ project: cible.project })
                  : await retirerLaConnexion({
                      project: cible.project,
                      database: cible.database,
                    })
              setProjects(issue.projects)
              return issue
            }}
            onRenameProject={async (project, nom) => {
              const issue = await renommerLeProjet({ project, name: nom })
              setProjects(issue.projects)
              return issue
            }}
          />
          {(connexionOuverte || edition) && (
            <NewConnection
              onClose={() => {
                setConnexionOuverte(false)
                setEdition(null)
              }}
              projects={projects.map((projet) => ({ id: projet.name, name: projet.name }))}
              edition={edition ?? undefined}
              onSaved={setProjects}
            />
          )}
        </>
      ) : (
        <>
          {/* **Le bouton dit « Nouveau projet », la modale « Nouvelle connexion ».**
              Ce n'est pas une erreur d'assemblage : `A1` n'offre que cette action et `⌘N`, et
              depuis `08f` la modale sait créer le projet **et** sa première base en un geste —
              sans aucun projet, elle propose la création d'emblée. Le trou consigné au
              § « À trancher » est donc fermé : l'application neuve n'est plus une impasse. */}
          <WelcomeScreen
            onNewProject={() => setConnexionOuverte(true)}
            projectCount={projects.length}
            dimmed={connexionOuverte}
          />
          {connexionOuverte && (
            <NewConnection
              onClose={() => setConnexionOuverte(false)}
              projects={projects.map((projet) => ({ id: projet.name, name: projet.name }))}
              onSaved={setProjects}
            />
          )}
        </>
      )}
    </>
  )
}
