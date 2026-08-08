import { lazy, Suspense, useEffect, useState } from 'react'
import { useConfiguration } from '../data/useConfiguration'
import { Sprite } from '../design/icons/Sprite'
import type { Project } from '../domain/config'
import { NewConnection } from '../screens/NewConnection/NewConnection'
import { WelcomeScreen } from '../screens/Welcome/WelcomeScreen'

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

export function App() {
  const [connexionOuverte, setConnexionOuverte] = useState(false)
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
      null : (
        <>
          {/* **Le bouton dit « Nouveau projet », la modale « Nouvelle connexion ».**
              Ce n'est pas une erreur d'assemblage : `A1` n'offre que cette action et `⌘N`,
              tandis que `A2` déclare une base *dans un projet existant*. Le handoff ne
              maquette pas le parcours d'un utilisateur sans projet — trou consigné au
              § « À trancher » de `specs/README.md`. En attendant, `A2` est câblée ici parce
              que c'est la seule entrée qui existe, et `08e` refusera l'enregistrement tant
              qu'aucun projet n'existe. */}
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
