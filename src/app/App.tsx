import { lazy, Suspense, useEffect, useState } from 'react'
import {
  createConsole,
  deleteConsole,
  renameConsole,
  saveConsole,
  savePreferences,
} from '../data/commandes'
import { useConfiguration } from '../data/useConfiguration'
import { Sprite } from '../design/icons/Sprite'
import type { Database, Preferences, Project } from '../domain/config'
import {
  renommerLaConnexion,
  renommerLeProjet,
  retirerLaConnexion,
  retirerLeProjet,
} from '../screens/NewConnection/enregistrerLaBase'
import { NewConnection } from '../screens/NewConnection/NewConnection'
import { ParcoursDeCreation } from '../screens/NewProject/ParcoursDeCreation'
import { PreferencesDialog } from '../screens/Preferences/PreferencesDialog'
import { jetonsDe, PREFERENCES_PAR_DEFAUT, themeApplique } from '../screens/Preferences/preferences'
import { WelcomeScreen } from '../screens/Welcome/WelcomeScreen'
import { Workbench } from '../screens/Workbench/Workbench'
import { useClicDroitDesactive } from '../shell/useClicDroit'
import { useZoom } from '../shell/useZoom'
import { BarresDeDefilement } from '../ui/BarresDeDefilement/BarresDeDefilement'
import { useRaccourcisDeCreation } from './useRaccourcisDeCreation'

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
  // Le zoom au geste, à pas fin — sous Tauri seulement, la webview étant ce qui zoome.
  useZoom()
  // Le menu contextuel du moteur de rendu, remplacé par le silence : nos menus s'ouvrent eux-mêmes.
  useClicDroitDesactive()

  const [connexionOuverte, setConnexionOuverte] = useState(false)
  /**
   * Le parcours de création est ouvert (`24d`).
   *
   * **Deux états distincts, non un mode d'un seul** : « ajouter une connexion » et « nouveau projet »
   * sont deux gestes, et les confondre ramènerait la sentinelle du sélecteur que `24c` a retirée.
   */
  const [projetOuvert, setProjetOuvert] = useState<{ raison?: string } | null>(null)
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
  /**
   * Les préférences (`15a`), lues au démarrage avec les projets.
   *
   * **Un état local, alimenté par le disque puis par la commande** — exactement le montage des
   * projets ci-dessus : le disque au démarrage, `save_preferences` ensuite, et c'est elle qui rend
   * la valeur retenue (bornée). Les deux ne peuvent donc pas diverger.
   */
  const [preferences, setPreferences] = useState<Preferences>(PREFERENCES_PAR_DEFAUT)
  const [preferencesOuvertes, setPreferencesOuvertes] = useState(false)

  // Les projets lus alimentent l'état local, que `08e` met ensuite à jour après chaque
  // enregistrement. Deux sources pour une même liste, mais dans le temps : le disque au
  // démarrage, la commande ensuite — et c'est la commande qui rend la liste à jour, donc les
  // deux ne peuvent pas diverger.
  useEffect(() => {
    if (configuration.kind === 'chargement') return
    setProjects(configuration.projects)
    setPreferences(configuration.preferences)
  }, [configuration])

  /**
   * Les jetons et le thème, posés **sur la racine du document**.
   *
   * `document.documentElement` et non un conteneur React : `--rowh` doit atteindre la grille,
   * `--accent` la pastille de projet, `--text-code` l'éditeur et les blocs SQL. Les poser composant
   * par composant en oublierait un — et c'est le genre d'oubli qui ne se voit que sur l'écran qu'on
   * n'a pas regardé (`15c`).
   *
   * **Aucun attribut pour « Système »** : sans lui, c'est `prefers-color-scheme` qui décide, donc le
   * thème suit l'OS sans rechargement.
   */
  useEffect(() => {
    const racine = document.documentElement
    const jetons = jetonsDe(preferences)
    for (const [nom, valeur] of Object.entries(jetons)) racine.style.setProperty(nom, valeur)

    const theme = themeApplique(preferences)
    if (theme === null) racine.removeAttribute('data-theme')
    else racine.setAttribute('data-theme', theme)

    return () => {
      for (const nom of Object.keys(jetons)) racine.style.removeProperty(nom)
      racine.removeAttribute('data-theme')
    }
  }, [preferences])

  /**
   * Applique un réglage : l'écran d'abord, le disque ensuite.
   *
   * **L'écran d'abord**, parce que « les préférences s'appliquent immédiatement » : attendre
   * l'écriture ferait sauter le curseur de densité à chaque mouvement. Le disque rend la valeur
   * **bornée**, qui est reposée — c'est ainsi qu'un curseur poussé trop bas remonte de lui-même.
   */
  const appliquer = async (suivantes: Preferences) => {
    setPreferences(suivantes)
    try {
      setPreferences(await savePreferences(suivantes))
    } catch {
      // Une écriture refusée (fichier en quarantaine) ne doit pas défaire le réglage à l'écran :
      // l'utilisateur verrait son geste annulé sans raison. Le blocage est déjà dit par `09b`.
    }
  }

  /**
   * « Ajouter une connexion » — **le geste, non le bouton** (`24d`).
   *
   * Sans aucun projet déclaré, il entre à l'étape 1 avec sa raison écrite, au lieu d'ouvrir un
   * formulaire dont le sélecteur de projet serait vide et le bouton d'enregistrement inerte (l'état
   * que `08e` rendait, faute de mieux). Le parcours aboutit là où l'on voulait aller ; il passe par ce
   * qui manquait.
   */
  const ajouterUneConnexion = () => {
    if (projects.length === 0)
      setProjetOuvert({
        raison: 'Une connexion appartient à un projet. Commençons par le projet.',
      })
    else setConnexionOuverte(true)
  }

  useRaccourcisDeCreation({
    nouveauProjet: () => setProjetOuvert({}),
    ajouterUneConnexion,
  })

  /**
   * Les projets sous la forme que les écrans de création attendent.
   *
   * **Calculée une fois** : l'expression était recopiée à chaque point de montage, et une recopie qui
   * oublie un champ ne se voit qu'à l'écran concerné.
   */
  const projetsPourLesEcrans = projects.map((projet) => ({
    id: projet.name,
    name: projet.name,
    // Ses environnements déclarés : c'est ce que `A2` propose (`23d`).
    environments: projet.environments,
  }))

  return (
    <>
      <Sprite />
      {/* **Montées une fois, pour toute l'application.** Elles écoutent le défilement en capture sur
          le document : n'importe quel panneau y a droit sans le savoir, y compris ceux qui n'existent
          pas encore. Voir `BarresDeDefilement` pour la raison de ce choix. */}
      <BarresDeDefilement />
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
            onOpenPreferences={() => setPreferencesOuvertes(true)}
            rowHeight={preferences.rowHeight}
            onNewDatabase={ajouterUneConnexion}
            onNewProject={() => setProjetOuvert({})}
            onEditDatabase={(project, database) => setEdition({ project, database })}
            // Le renommage rend les projets à jour : les reposer ici évite un second aller-retour,
            // et supprime la fenêtre pendant laquelle l'arbre montrerait l'ancien nom.
            // Les quatre écritures sur les consoles. Elles rendent les projets à jour, donc l'écran
            // n'a pas à relire — et l'arbre suit immédiatement.
            onCreateConsole={async (project, database, environment, name) => {
              setProjects(
                await createConsole({
                  project,
                  database,
                  environment,
                  name,
                  sql: null,
                  renameTo: null,
                }),
              )
            }}
            onSaveConsole={async (project, database, environment, name, sql) => {
              setProjects(
                await saveConsole({ project, database, environment, name, sql, renameTo: null }),
              )
            }}
            onDeleteConsole={async (project, database, environment, name) => {
              setProjects(
                await deleteConsole({
                  project,
                  database,
                  environment,
                  name,
                  sql: null,
                  renameTo: null,
                }),
              )
            }}
            onRenameConsole={async (project, database, environment, name, renameTo) => {
              setProjects(
                await renameConsole({
                  project,
                  database,
                  environment,
                  name,
                  sql: null,
                  renameTo,
                }),
              )
            }}
            onDelete={async (cible) => {
              const issue =
                cible.kind === 'project'
                  ? await retirerLeProjet({ project: cible.project })
                  : await retirerLaConnexion({
                      project: cible.project,
                      database: cible.database,
                      environment: cible.environment,
                    })
              setProjects(issue.projects)
              return issue
            }}
            // Les cinq gestes de `23c` rendent la liste entière : la reposer ici évite un second
            // aller-retour, et supprime la fenêtre pendant laquelle l'arbre montrerait l'ancien état.
            onProjets={setProjects}
            onRenameProject={async (project, nom) => {
              const issue = await renommerLeProjet({ project, name: nom })
              setProjects(issue.projects)
              return issue
            }}
            // Le renommage d'une connexion (`26`) : la liste rendue est reposée telle quelle, comme
            // pour le projet — l'arbre montre le nouveau nom sans second aller-retour.
            onRenameDatabase={async (project, database, environment, nouveau) => {
              const issue = await renommerLaConnexion({
                project,
                database,
                environment,
                name: nouveau,
              })
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
              projects={projetsPourLesEcrans}
              edition={edition ?? undefined}
              onSaved={setProjects}
            />
          )}
        </>
      ) : (
        <>
          {/* **Le bouton dit « Nouveau projet », et ouvre « Nouveau projet »** (`24d`). Il ouvrait la
              modale de connexion : ce n'était pas une erreur d'assemblage — `08f` créait le projet au
              passage, par une entrée du sélecteur — mais le geste s'est inversé, et l'écran de
              création existe désormais. */}
          <WelcomeScreen
            // **`A1` mène à l'étape 1**, non à la modale de connexion (`24d`). Le bouton disait
            // « Nouveau projet » et ouvrait « Nouvelle connexion » : ce n'était pas une erreur
            // d'assemblage — `08f` créait le projet au passage — mais le geste s'est inversé.
            onNewProject={() => setProjetOuvert({})}
            projectCount={projects.length}
            dimmed={connexionOuverte || projetOuvert !== null}
          />
        </>
      )}
      {/* **Monté hors des deux branches** — et c'est un défaut corrigé, non un rangement : le parcours
          ne vivait que dans la branche `A1`, si bien que « Nouveau projet » au pied de la sidebar de
          `A4` appelait un état que rien n'écoutait. Le geste existe sur les deux écrans (`24d`), donc
          la modale doit vivre au-dessus du choix de l'écran — la raison même qui met les préférences
          ici. */}
      {projetOuvert !== null && (
        <ParcoursDeCreation
          depart={{
            etape: 'projet',
            ...(projetOuvert.raison === undefined ? {} : { raison: projetOuvert.raison }),
          }}
          projets={projetsPourLesEcrans}
          onClose={() => setProjetOuvert(null)}
          onProjets={setProjects}
        />
      )}
      {/* **Au niveau de l'application, pas de l'écran de travail.** Les préférences règlent des
          jetons de la racine et des garde-fous globaux : les monter dans `Workbench` les rendrait
          inaccessibles depuis `A1`, où l'engrenage existe aussi. */}
      {preferencesOuvertes && (
        <PreferencesDialog
          preferences={preferences}
          onChange={appliquer}
          onClose={() => setPreferencesOuvertes(false)}
          version={VERSION_AFFICHEE}
        />
      )}
    </>
  )
}

/**
 * La version affichée en pied des préférences.
 *
 * Lue de `package.json` **à la construction** par Vite, et non écrite à la main : une version en dur
 * cesse d'être vraie à la publication suivante, et personne ne penserait à la corriger.
 *
 * L'architecture est celle de la machine qui exécute — `arm64` sur un Mac Apple Silicon, `x86_64`
 * sinon. `navigator.userAgent` ne la donne pas de façon fiable dans un WKWebView ; le mot vient donc
 * de ce que Vite a construit.
 */
const VERSION_AFFICHEE = `DoraBase ${__APP_VERSION__} (${__APP_ARCH__})`
