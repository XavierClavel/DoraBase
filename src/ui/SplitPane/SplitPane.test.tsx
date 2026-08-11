import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SplitPane } from './SplitPane'

afterEach(() => localStorage.clear())

test('applique la taille par défaut au montage', () => {
  render(
    <SplitPane
      storageKey="test-a"
      defaultSize={212}
      min={150}
      max={400}
      start={<div>gauche</div>}
      end={<div>droite</div>}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '212')
})

test('relit la taille stockée plutôt que la valeur par défaut', () => {
  localStorage.setItem('dorabase:split:test-b', '250')
  render(
    <SplitPane
      storageKey="test-b"
      defaultSize={212}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '250')
})

test('ignore une valeur stockée hors bornes', () => {
  localStorage.setItem('dorabase:split:test-c', '999')
  render(
    <SplitPane
      storageKey="test-c"
      defaultSize={212}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '400')
})

// Ces trois tests couvrent l'écriture dans `localStorage`, que les trois précédents
// laissaient entièrement de côté : constaté par contrôle négatif — supprimer l'appel à
// `setItem` du composant les laissait tous les trois au vert.
test('les flèches clavier redimensionnent par pas de 8px et persistent', async () => {
  render(
    <SplitPane
      storageKey="test-d"
      defaultSize={200}
      min={150}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  handle.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '208')
  expect(localStorage.getItem('dorabase:split:test-d')).toBe('208')
})

test('le glissement à la souris redimensionne et persiste', () => {
  render(
    <SplitPane
      storageKey="test-e"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  // Les événements vont à la **poignée**, qui capture le pointeur : écouter sur `window` obligeait à
  // retirer les écouteurs à la main et laissait passer la sélection de texte du navigateur.
  fireEvent.pointerDown(handle, { clientX: 100 })
  fireEvent.pointerMove(handle, { clientX: 130 })
  fireEvent.pointerUp(handle)
  expect(handle).toHaveAttribute('aria-valuenow', '230')
  expect(localStorage.getItem('dorabase:split:test-e')).toBe('230')
})

test('la taille n’est écrite qu’une fois, au relâchement', () => {
  render(
    <SplitPane
      storageKey="test-ecritures"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  const ecritures = vi.spyOn(window.localStorage, 'setItem')

  fireEvent.pointerDown(handle, { clientX: 100 })
  for (let x = 101; x <= 140; x++) fireEvent.pointerMove(handle, { clientX: x })
  // **Quarante mouvements, zéro écriture.** `localStorage.setItem` est synchrone : l'appeler à
  // chaque `pointermove` suffisait à rendre le glissement saccadé — la latence signalée le 11 août
  // 2026.
  expect(ecritures).not.toHaveBeenCalled()

  fireEvent.pointerUp(handle)
  expect(ecritures).toHaveBeenCalledOnce()
  expect(localStorage.getItem('dorabase:split:test-ecritures')).toBe('240')
  ecritures.mockRestore()
})

test('la largeur suit le geste dans le DOM, sans que React rende', () => {
  const { container } = render(
    <SplitPane
      storageKey="test-rendus"
      defaultSize={200}
      min={100}
      max={400}
      start={<div>contenu</div>}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  const panneau = container.firstElementChild?.firstElementChild as HTMLElement

  fireEvent.pointerDown(handle, { clientX: 100 })
  for (let x = 101; x <= 140; x++) fireEvent.pointerMove(handle, { clientX: x })

  // **`aria-valuenow` est rendu par React ; la largeur est écrite dans le DOM.** Le premier reste à
  // sa valeur d'origine pendant tout le geste, ce qui prouve qu'aucun rendu n'a eu lieu — chaque
  // `setSize` intermédiaire faisait retraverser la grille virtualisée entière, vingt-six lignes fois
  // trente-sept colonnes chez l'utilisateur qui a signalé la latence, à chaque trame.
  //
  // Une première version de ce test comptait les rendus d'un composant passé en `start` : elle était
  // verte quoi qu'il arrive, l'élément étant créé une seule fois par le parent et donc jamais
  // re-rendu par le `SplitPane`.
  expect(handle).toHaveAttribute('aria-valuenow', '200')
  expect(panneau.style.width).toBe('240px')

  fireEvent.pointerUp(handle)
  // Au relâchement, l'état rejoint le DOM : un seul rendu pour tout le geste.
  expect(handle).toHaveAttribute('aria-valuenow', '240')
})

test('le glissement empêche la sélection de démarrer sur la poignée', () => {
  render(
    <SplitPane
      storageKey="test-default"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  // `fireEvent` rend `false` quand `preventDefault` a été appelé. **Sans lui, le navigateur commence
  // une sélection de texte** dès le `pointerdown` sur la poignée, et surligne tout le passage du
  // curseur. jsdom ne sélectionne rien, donc c'est cet appel qu'on mesure — la sélection réelle est
  // vérifiée par un e2e.
  const poignee = screen.getByRole('separator')
  const nonAnnule = fireEvent.pointerDown(poignee, { clientX: 100 })
  expect(nonAnnule).toBe(false)
  // Le geste est refermé : `pointerdown` pose une classe sur `<body>`, partagé entre les tests.
  fireEvent.pointerUp(poignee)
})

test('le glissement suspend la sélection de texte, et la rend au relâchement', () => {
  render(
    <SplitPane
      storageKey="test-selection"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  const classes = () => document.body.className

  expect(classes()).toBe('')
  fireEvent.pointerDown(handle, { clientX: 100 })
  // Glisser la poignée surlignait les lignes de la grille sur tout le passage du curseur.
  expect(classes()).not.toBe('')

  fireEvent.pointerUp(handle)
  // **Rendue au relâchement** : la laisser suspendue rendrait la page inélectable ensuite.
  expect(classes()).toBe('')
})

test('un geste interrompu par le système rend aussi la sélection', () => {
  render(
    <SplitPane
      storageKey="test-annule"
      defaultSize={200}
      min={100}
      max={400}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  fireEvent.pointerDown(handle, { clientX: 100 })
  // Changement de fenêtre, geste tactile : le navigateur émet `pointercancel` et **pas**
  // `pointerup`. Sans cet écouteur, la page restait inélectable jusqu'au rechargement.
  fireEvent.pointerCancel(handle)
  expect(document.body.className).toBe('')
})

test('le clavier respecte les bornes', async () => {
  render(
    <SplitPane
      storageKey="test-f"
      defaultSize={155}
      min={150}
      max={160}
      start={<div />}
      end={<div />}
    />,
  )
  const handle = screen.getByRole('separator')
  handle.focus()
  for (let i = 0; i < 5; i++) await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '160')
})
