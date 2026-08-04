import { lazy, Suspense } from 'react'
import { Sprite } from '../design/icons/Sprite'
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

// Pas de projet à ce stade : le modèle de domaine (Projet / Base / Environnement) et sa
// persistance viennent de la spec 05. `onNewProject` reste vide, la création de projet
// étant construite en spec 08 — voir specs/07-a1-accueil.md § Hors périmètre.
function handleNewProject() {}

export function App() {
  return (
    <>
      <Sprite />
      {Gallery ? (
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      ) : (
        <WelcomeScreen onNewProject={handleNewProject} projectCount={0} />
      )}
    </>
  )
}
