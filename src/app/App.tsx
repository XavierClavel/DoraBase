import { lazy, Suspense, useState } from 'react'
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
   * Les projets connus.
   *
   * **Encore vides au démarrage**, et c'est une limite assumée de `08e` : la commande
   * `load_config` existe depuis `05b` mais rien ne l'appelle, faute d'un écran qui affiche des
   * projets. `09` (l'explorateur `A4`) est celui qui la branchera. En attendant, un
   * enregistrement met bien la liste à jour — donc le compteur de `A1` cesse de mentir *pendant
   * la session*, mais repart à zéro au lancement suivant.
   *
   * Dit ici pour qu'un lecteur ne cherche pas le bug : la persistance fonctionne, c'est la
   * **relecture au démarrage** qui manque.
   */
  const [projects, setProjects] = useState<Project[]>([])

  return (
    <>
      <Sprite />
      {Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
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
