import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MiseAJour } from './MiseAJour'

// **Le cas nominal est de ne rien afficher.** C'est aussi celui de tous les autres tests du
// produit, de la galerie et de Playwright : hors de la webview, la recherche est rejetée.
test("ne rend rien quand la recherche échoue — le pont ne répond pas hors de l'application", async () => {
  const { container } = render(
    <MiseAJour chercher={() => Promise.reject(new Error('pont absent'))} />,
  )
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})

test("ne rend rien quand il n'y a pas de version plus récente", async () => {
  const { container } = render(<MiseAJour chercher={() => Promise.resolve(null)} />)
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})

test('annonce la version trouvée, et elle seule', async () => {
  render(<MiseAJour chercher={() => Promise.resolve({ version: '0.2.0', notes: null })} />)
  // Motif **ancré** : sans les bornes, « 0.2.0 disponible » compterait aussi pour un futur
  // « 0.2.0 disponible dans une heure ».
  expect(await screen.findByRole('button', { name: /^0\.2\.0 disponible$/ })).toBeInTheDocument()
})

test("les notes de la release s'affichent, et le panneau tient sans elles", async () => {
  const utilisateur = userEvent.setup()
  render(
    <MiseAJour
      chercher={() => Promise.resolve({ version: '0.2.0', notes: 'Deux moteurs de plus.' })}
    />,
  )
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  expect(screen.getByText('Deux moteurs de plus.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Installer et redémarrer' })).toBeEnabled()
})

test('sans notes, le panneau le dit plutôt que de laisser un vide', async () => {
  const utilisateur = userEvent.setup()
  render(<MiseAJour chercher={() => Promise.resolve({ version: '0.2.0', notes: null })} />)
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  expect(screen.getByText("Cette version n'a pas de notes.")).toBeInTheDocument()
})

// **Le chemin, pas seulement le résultat visible** : ce qui compte est que le clic appelle
// bien l'installation. Un test qui ne regarderait que le libellé « Téléchargement… » resterait
// vert si le bouton ne faisait que changer d'état.
test("le bouton lance l'installation et se désactive pendant", async () => {
  const utilisateur = userEvent.setup()
  let appels = 0
  render(
    <MiseAJour
      chercher={() => Promise.resolve({ version: '0.2.0', notes: null })}
      installer={() => {
        appels += 1
        return new Promise(() => {})
      }}
    />,
  )
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  await utilisateur.click(screen.getByRole('button', { name: 'Installer et redémarrer' }))
  expect(appels).toBe(1)
  const bouton = await screen.findByRole('button', { name: 'Téléchargement…' })
  expect(bouton).toBeDisabled()
})

test("un échec d'installation est dit, et le bouton redevient cliquable", async () => {
  const utilisateur = userEvent.setup()
  render(
    <MiseAJour
      chercher={() => Promise.resolve({ version: '0.2.0', notes: null })}
      installer={() => Promise.reject(new Error("l'installation a échoué : disque plein"))}
    />,
  )
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  await utilisateur.click(screen.getByRole('button', { name: 'Installer et redémarrer' }))
  expect(await screen.findByText("l'installation a échoué : disque plein")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Installer et redémarrer' })).toBeEnabled()
})

// Une promesse qui se résout est un **échec** : le succès remplace le processus, il ne rend
// jamais la main. Sans ce traitement, le bouton resterait sur « Téléchargement… » pour
// toujours, ce qui est le pire des deux messages possibles.
test('une installation qui rend la main est traitée comme un échec', async () => {
  const utilisateur = userEvent.setup()
  render(
    <MiseAJour
      chercher={() => Promise.resolve({ version: '0.2.0', notes: null })}
      installer={() => Promise.resolve()}
    />,
  )
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  await utilisateur.click(screen.getByRole('button', { name: 'Installer et redémarrer' }))
  expect(await screen.findByText("l'installation n'a pas abouti")).toBeInTheDocument()
})

// **Le panneau s'ouvre vers le haut, et c'est la moitié du défaut du 26 août 2026.** Le
// déclencheur vit dans la barre d'état, donc dans les 26 derniers pixels de la fenêtre : vers le
// bas, le panneau était dessiné hors de la fenêtre, que `html, body { overflow: hidden }` ne
// laisse pas défiler. L'état basculait — `aria-expanded` à `true`, le `dialog` dans le DOM — et il
// ne se passait rien de visible. C'est pour cela que le test porte sur la **classe** et non sur la
// présence du `dialog` : celle-ci était déjà vraie quand le défaut était là.
test('le panneau s’ouvre vers le haut — sous la barre d’état, il n’y a plus de fenêtre', async () => {
  const utilisateur = userEvent.setup()
  render(<MiseAJour chercher={() => Promise.resolve({ version: '0.2.1', notes: null })} />)
  await utilisateur.click(await screen.findByRole('button', { name: /disponible$/ }))
  expect(screen.getByRole('dialog')).toHaveAttribute('data-ouverture', 'haut')
})

// **« Une seule recherche au démarrage » est une propriété du produit**, et trois barres d'état
// la mettaient en jeu : le composant se démonte et se remonte à chaque changement d'onglet. Le
// test compte les appels sur **deux montages simultanés**, ce que trois barres ne font jamais —
// mais c'est la même mémoire qui répond, et un compteur est la seule mesure du chemin.
test('deux montages ne cherchent qu’une fois', async () => {
  let appels = 0
  const chercher = () => {
    appels += 1
    return Promise.resolve({ version: '0.2.1', notes: null })
  }
  render(
    <>
      <MiseAJour chercher={chercher} />
      <MiseAJour chercher={chercher} />
    </>,
  )
  expect(await screen.findAllByRole('button', { name: /disponible$/ })).toHaveLength(2)
  expect(appels).toBe(1)
})

// Le contrôle négatif du test précédent : deux fonctions distinctes gardent deux recherches
// distinctes. Sans lui, une mémoire cassée qui rendrait *toujours* le premier résultat passerait.
test('deux recherches différentes restent indépendantes', async () => {
  let appels = 0
  const compter = () => {
    appels += 1
    return Promise.resolve({ version: '0.2.1', notes: null })
  }
  render(
    <>
      <MiseAJour chercher={compter} />
      <MiseAJour chercher={() => Promise.resolve(null)} />
    </>,
  )
  expect(await screen.findByRole('button', { name: /disponible$/ })).toBeInTheDocument()
  expect(appels).toBe(1)
})
