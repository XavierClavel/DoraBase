import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sprite } from '../../design/icons/Sprite'
import type { ConnectionState } from '../../domain/engine'
import { libelleDeConnexion, ProjectPill } from './ProjectPill'

const CONNECTEE: ConnectionState = {
  kind: 'connected',
  serverVersion: 'PostgreSQL 17.6',
  tunnelLocalPort: null,
}

function monter(props: Partial<Parameters<typeof ProjectPill>[0]> = {}) {
  return render(
    <>
      <Sprite />
      <ProjectPill projectName="Atelier Nord" {...props} />
    </>,
  )
}

test('le nom du projet est visible et la pastille est un bouton', () => {
  monter()
  expect(screen.getByRole('button', { name: /Atelier Nord/ })).toBeInTheDocument()
})

// Toute la pastille est le bouton, pas seulement le chevron : c'est ce que le mockup suggère
// — aucun cadre n'entoure le chevron seul — et c'est une cible bien plus grande.
test('un clic sur la pastille appelle l’ouverture des projets', async () => {
  const ouvrir = vi.fn()
  monter({ onOpenProjects: ouvrir })
  await userEvent.click(screen.getByRole('button', { name: /Atelier Nord/ }))
  expect(ouvrir).toHaveBeenCalledOnce()
})

test('le fil d’Ariane est rendu quand il y en a un', () => {
  monter({ breadcrumb: 'analytics · public' })
  expect(screen.getByText('analytics · public')).toBeInTheDocument()
})

test('sans base ouverte, aucun fil d’Ariane', () => {
  monter()
  expect(screen.queryByText(/·/)).not.toBeInTheDocument()
})

// Un projet n'a pas d'état de connexion — ses bases en ont. Sans base ouverte, **aucun point**
// plutôt qu'un point gris inventé.
test('sans base ouverte, aucun point d’état', () => {
  const { container } = monter()
  expect(container.querySelector('[data-state]')).toBeNull()
})

// L'état entre dans le **nom du bouton**, par du texte masqué visuellement. `aria-label` sur le
// point lui-même serait ignoré : un `<span>` sans rôle ne le porte pas — même piège qu'en `08c`.
test('l’état de connexion entre dans le nom accessible de la pastille', () => {
  monter({ connection: CONNECTEE })
  // L'identité avant l'état : « Atelier Nord … connectée », et non l'inverse.
  expect(
    screen.getByRole('button', { name: /^Atelier Nord.*connectée · PostgreSQL 17\.6$/ }),
  ).toBeInTheDocument()
})

test('le point lui-même est décoratif', () => {
  const { container } = monter({ connection: CONNECTEE })
  expect(container.querySelector('[data-state]')).toHaveAttribute('aria-hidden', 'true')
})

test('les quatre états portent leur nature dans un attribut, pas dans une classe', () => {
  const etats: ConnectionState[] = [
    { kind: 'never' },
    { kind: 'connecting' },
    CONNECTEE,
    { kind: 'offline', reason: 'hôte injoignable' },
  ]
  for (const etat of etats) {
    const { container, unmount } = monter({ connection: etat })
    expect(container.querySelector(`[data-state="${etat.kind}"]`)).not.toBeNull()
    unmount()
  }
})

test('le badge de lecture seule suit le réglage', () => {
  monter({ readOnly: true })
  expect(screen.getByText('Lecture seule')).toBeInTheDocument()
})

test('sans lecture seule, aucun badge', () => {
  monter()
  expect(screen.queryByText('Lecture seule')).not.toBeInTheDocument()
})

// --- Les libellés d'état ---

// Exportés parce que l'arbre de `09d` en a besoin lui aussi : deux formulations divergeraient.
test('les quatre libellés sont distincts et disent la nature de l’état', () => {
  const libelles = [
    libelleDeConnexion({ kind: 'never' }),
    libelleDeConnexion({ kind: 'connecting' }),
    libelleDeConnexion(CONNECTEE),
    libelleDeConnexion({ kind: 'offline', reason: 'hôte injoignable' }),
  ]
  expect(new Set(libelles).size).toBe(4)
  // « jamais connectée » n'est pas « hors ligne » : les confondre décrirait en panne une base
  // qu'on n'a simplement pas ouverte.
  expect(libelles[0]).not.toContain('hors ligne')
  expect(libelles[3]).toContain('hors ligne')
})

test('le libellé d’un échec porte la raison du moteur', () => {
  // `06b`–`06e` produisent des messages qui disent la manœuvre ; les réécrire créerait deux
  // vérités, dont une périmée.
  expect(libelleDeConnexion({ kind: 'offline', reason: 'hôte injoignable' })).toContain(
    'hôte injoignable',
  )
})
