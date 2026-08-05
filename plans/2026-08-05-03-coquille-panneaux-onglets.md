# Plan d'implémentation — 03 Coquille : panneaux et onglets

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** deux primitives génériques — panneaux redimensionnables persistés,
bande d'onglets réordonnable — plus l'icône console dans la barre de titre.

**Architecture :** `SplitPane` et `TabStrip` sont des composants contrôlés, sans
connaissance du contenu qu'ils portent. `TitleBar` gagne une prop optionnelle
plutôt qu'un ajout inconditionnel, pour ne pas casser `A1`.

**Stack :** React · CSS Modules · Vitest · Testing Library

**Spec :** `specs/03-coquille-panneaux-onglets.md` — **Prérequis :** plans `01`, `02`

---

## Une correction au périmètre, faite en écrivant ce plan

La spec dit l'icône console « ajoutée à côté de celle des préférences déjà
présente depuis `07` ». Prise au pied de la lettre, une addition inconditionnelle
casserait `A1` : `TitleBar.test.tsx` a un test qui **affirme l'absence** de la
console sur cet écran (`specs/07-a1-accueil.md` § Périmètre, « Pas d'icône
console sur cet écran »), et le mockup `A1` (l. 117-128) n'a bien qu'une icône
`gear`, alors que `A4`-`A9` en ont deux.

`TitleBar` reçoit donc une prop `showConsole?: boolean` (défaut `false`).
`WelcomeScreen` ne la passe pas, donc `A1` ne change pas de comportement — le
test existant reste vert sans modification. Les écrans qui la réclameront
(`09` et suivants) passeront `showConsole`.

## Un choix d'implémentation qui évite une dette déjà identifiée

`02` documente le `Chip` interactif comme une dette : sa croix de suppression
étant un vrai `<button>`, la racine ne peut pas en être un second — d'où un
`div[role=button]` avec clavier géré à la main. `TabStrip` a exactement le même
problème (un bouton de sélection, une croix de fermeture) et l'évite dès le
départ : chaque onglet est un `<div>` non interactif contenant **deux boutons
frères** — un pour la sélection, un pour la fermeture. Les deux restent des
`<button>` natifs, focalisables et activables au clavier sans code ajouté.

## Décision YAGNI, à ne pas rouvrir sans écran réel

`SplitPane` ne gère que l'orientation horizontale (deux zones côte à côte). Le
séparateur horizontal de `A7` (éditeur au-dessus, résultats en dessous,
`README.md` l. 244) a une géométrie différente (pastille 26×3 au lieu de 3×26) et
n'est réclamé par aucun écran de ce plan. L'ajouter maintenant reviendrait à
deviner une API avant le cas qui la contraint — exactement l'erreur évitée sur
le `Chip`. À construire quand `12` (Console SQL) en aura besoin.

## Un point technique à vérifier en écrivant les tests

Le glissement à la souris s'implémente avec les événements **pointeur**
(`pointerdown`/`pointermove`/`pointerup`), qui couvrent aussi le trackpad. Si
l'environnement de test ne les construit pas correctement via
`fireEvent.pointerDown` (jsdom a des versions inégales du support `PointerEvent`),
utiliser les événements `mouse*` équivalents **dans le test seulement** —
l'implémentation réelle garde les événements pointeur.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src/ui/SplitPane/{SplitPane.tsx,SplitPane.module.css,SplitPane.test.tsx}` | panneaux redimensionnables et persistés |
| `src/ui/TabStrip/{TabStrip.tsx,TabStrip.module.css,TabStrip.test.tsx}` | bande d'onglets |
| `src/shell/TitleBar/TitleBar.tsx` | modifié : prop `showConsole` |
| `src/design/gallery/Gallery.tsx` | modifié : sections `SplitPane` et `TabStrip` |

---

## Tâche 1 : `SplitPane` — dimensionnement, bornes, persistance

**Fichiers :** créer `src/ui/SplitPane/{SplitPane.tsx,SplitPane.module.css,SplitPane.test.tsx}`

Valeurs — `design/handoff/DoraBase.dc.html` l. 386 : poignée large 5,
`background: linear-gradient(90deg, rgba(35,32,28,.06), transparent)`, pastille
centrale `position:absolute; top:50%; left:1px; width:3px; height:26px;
border-radius:2px; background:var(--field); transform:translateY(-50%)` —
`--field` vaut déjà `rgba(35,32,28,.16)`, pas de nouveau token. Le `.06` du
dégradé est un littéral local, à documenter en commentaire dans le CSS Module,
comme la convention déjà posée en `02`.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
// src/ui/SplitPane/SplitPane.test.tsx
import { render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { SplitPane } from './SplitPane'

afterEach(() => localStorage.clear())

test('applique la taille par défaut au montage', () => {
  render(
    <SplitPane storageKey="test-a" defaultSize={212} min={150} max={400} start={<div>gauche</div>} end={<div>droite</div>} />,
  )
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '212')
})

test('relit la taille stockée plutôt que la valeur par défaut', () => {
  localStorage.setItem('dorabase:split:test-b', '250')
  render(<SplitPane storageKey="test-b" defaultSize={212} min={150} max={400} start={<div />} end={<div />} />)
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '250')
})

test('ignore une valeur stockée hors bornes', () => {
  localStorage.setItem('dorabase:split:test-c', '999')
  render(<SplitPane storageKey="test-c" defaultSize={212} min={150} max={400} start={<div />} end={<div />} />)
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '400')
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/SplitPane
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Étape 3 : implémenter**

```tsx
// src/ui/SplitPane/SplitPane.tsx
import { type ReactNode, useState } from 'react'
import { cx } from '../cx'
import styles from './SplitPane.module.css'

type SplitPaneProps = {
  storageKey: string
  defaultSize: number
  min: number
  max: number
  handleShadow?: 'start' | 'end'
  start: ReactNode
  end: ReactNode
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readStoredSize(storageKey: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(`dorabase:split:${storageKey}`)
    if (raw === null) return fallback
    const parsed = Number(raw)
    return Number.isNaN(parsed) ? fallback : clamp(parsed, min, max)
  } catch {
    return fallback
  }
}

export function SplitPane({ storageKey, defaultSize, min, max, handleShadow = 'start', start, end }: SplitPaneProps) {
  const [size, setSize] = useState(() => readStoredSize(storageKey, defaultSize, min, max))

  function commit(next: number) {
    const clamped = clamp(next, min, max)
    setSize(clamped)
    try {
      localStorage.setItem(`dorabase:split:${storageKey}`, String(clamped))
    } catch {
      // stockage indisponible (navigation privée) : la taille reste en mémoire pour la session
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    const startX = event.clientX
    const startSize = size
    function onMove(moveEvent: PointerEvent) {
      commit(startSize + (moveEvent.clientX - startX))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowLeft') commit(size - 8)
    if (event.key === 'ArrowRight') commit(size + 8)
  }

  return (
    <div className={styles.root}>
      <div className={styles.pane} style={{ width: size }}>
        {start}
      </div>
      <div
        className={cx(styles.handle, handleShadow === 'end' && styles.handleEnd)}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <div className={styles.grip} />
      </div>
      <div className={styles.end}>{end}</div>
    </div>
  )
}
```

```css
/* src/ui/SplitPane/SplitPane.module.css */
.root {
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.pane {
  flex: none;
  min-width: 0;
}

.end {
  flex: 1;
  min-width: 0;
}

.handle {
  width: 5px;
  flex: none;
  position: relative;
  cursor: col-resize;
  /* .06 : littéral du mockup (l. 386), sans rôle sémantique propre — pas de token dédié */
  background: linear-gradient(90deg, rgba(35, 32, 28, 0.06), transparent);
}

.handleEnd {
  background: linear-gradient(-90deg, rgba(35, 32, 28, 0.06), transparent);
}

.handle:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.grip {
  position: absolute;
  top: 50%;
  left: 1px;
  width: 3px;
  height: 26px;
  border-radius: 2px;
  background: var(--field);
  transform: translateY(-50%);
}
```

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/ui/SplitPane
```

Attendu : 3 tests passants.

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(ui): SplitPane, dimensionnement et persistance"
```

---

## Tâche 2 : `SplitPane` — redimensionnement souris et clavier

**Fichiers :** modifier `src/ui/SplitPane/SplitPane.test.tsx`

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('les flèches clavier redimensionnent par pas de 8px et persistent', async () => {
  render(<SplitPane storageKey="test-d" defaultSize={200} min={150} max={400} start={<div />} end={<div />} />)
  const handle = screen.getByRole('separator')
  handle.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '208')
  expect(localStorage.getItem('dorabase:split:test-d')).toBe('208')
})

test('le glissement à la souris redimensionne et persiste', () => {
  render(<SplitPane storageKey="test-e" defaultSize={200} min={100} max={400} start={<div />} end={<div />} />)
  const handle = screen.getByRole('separator')
  fireEvent.pointerDown(handle, { clientX: 100 })
  fireEvent.pointerMove(window, { clientX: 130 })
  fireEvent.pointerUp(window)
  expect(handle).toHaveAttribute('aria-valuenow', '230')
  expect(localStorage.getItem('dorabase:split:test-e')).toBe('230')
})

test('le clavier respecte les bornes', async () => {
  render(<SplitPane storageKey="test-f" defaultSize={155} min={150} max={160} start={<div />} end={<div />} />)
  const handle = screen.getByRole('separator')
  handle.focus()
  for (let i = 0; i < 5; i++) await userEvent.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '160')
})
```

Ces trois tests exercent le code déjà écrit à la tâche 1 (`onPointerDown`,
`onKeyDown`) — ils devraient déjà passer. S'ils échouent, c'est le signal que
`fireEvent.pointerDown` ne construit pas l'événement attendu dans cet
environnement : voir la note en tête de plan, remplacer par les événements
`mouse*` dans le test uniquement.

- [ ] **Étape 2 : lancer**

```bash
pnpm vitest run src/ui/SplitPane
```

Attendu : 6 tests passants au total. Si le test de glissement échoue à cause du
support `PointerEvent`, appliquer le remplacement `mouse*` noté plus haut et
relancer avant de continuer.

- [ ] **Étape 3 : vérifier à la souris dans l'app réelle**

```bash
pnpm dev
```

Ouvrir la galerie (tâche 6), glisser une poignée, recharger la page, constater
que la taille est restée.

- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "test(ui): SplitPane, redimensionnement souris et clavier"
```

---

## Tâche 3 : `TabStrip` — rendu et état actif

**Fichiers :** créer `src/ui/TabStrip/{TabStrip.tsx,TabStrip.module.css,TabStrip.test.tsx}`

Valeurs — l. 381-385 : bande 34px (`--h-bar`), fond `--bar`, filet bas
`--divider`. Onglet : `padding 0 12px`, filet droit `--divider`. Actif : fond
`--paper-bright`, `border-top: 2px solid` dans la couleur de son type (prop
`iconColor`, qui sert aussi au trait de l'icône), `font: 700 11.5px Nunito`.
Inactif : pas de fond propre (transparent, la bande se voit derrière), `font:
600 11.5px Nunito`, couleur `--ink-2`. La croix (`i-x`, 12px, `--ink-5`) n'est
rendue **que sur l'onglet actif** — lecture littérale du mockup, voir
`specs/03-coquille-panneaux-onglets.md` § Approche.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
// src/ui/TabStrip/TabStrip.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TabStrip, type Tab } from './TabStrip'

const demoTabs: Tab[] = [
  { id: 'public', icon: 'schema', iconColor: 'var(--accent-deep)', label: 'public' },
  { id: 'orders', icon: 'table', iconColor: 'var(--accent)', label: 'orders' },
  { id: 'console-1', icon: 'term', iconColor: 'var(--violet)', label: 'console 1', meta: '·psql' },
]

test('l’onglet actif est marqué sélectionné et porte une croix de fermeture', () => {
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
  expect(screen.getByRole('tab', { name: /orders/i })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: /fermer orders/i })).toBeInTheDocument()
})

test('un onglet inactif n’a pas de croix', () => {
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
  expect(screen.queryByRole('button', { name: /fermer public/i })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /public/i })).toHaveAttribute('aria-selected', 'false')
})

test('affiche le suffixe optionnel', () => {
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={vi.fn()} onClose={vi.fn()} onReorder={vi.fn()} />)
  expect(screen.getByText('·psql')).toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/TabStrip
```

- [ ] **Étape 3 : implémenter**

```tsx
// src/ui/TabStrip/TabStrip.tsx
import type { IconName } from '../../design/icons/names'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './TabStrip.module.css'

export type Tab = {
  id: string
  icon: IconName
  iconColor: string
  label: string
  meta?: string
}

type TabStripProps = {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onReorder: (tabs: Tab[]) => void
}

export function TabStrip({ tabs, activeId, onSelect, onClose, onReorder }: TabStripProps) {
  function handleDrop(targetId: string, draggedId: string) {
    if (draggedId === targetId) return
    const next = [...tabs]
    const from = next.findIndex((tab) => tab.id === draggedId)
    const to = next.findIndex((tab) => tab.id === targetId)
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onReorder(next)
  }

  return (
    <div className={styles.root} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            className={cx(styles.tab, active && styles.active)}
            style={active ? { borderTopColor: tab.iconColor } : undefined}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', tab.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(tab.id, event.dataTransfer.getData('text/plain'))}
          >
            <button type="button" role="tab" aria-selected={active} className={styles.select} onClick={() => onSelect(tab.id)}>
              <Icon name={tab.icon} size={13} style={{ color: tab.iconColor }} />
              <span>{tab.label}</span>
              {tab.meta ? <span className={styles.meta}>{tab.meta}</span> : null}
            </button>
            {active ? (
              <button type="button" aria-label={`Fermer ${tab.label}`} className={styles.close} onClick={() => onClose(tab.id)}>
                <Icon name="x" size={12} />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
```

```css
/* src/ui/TabStrip/TabStrip.module.css */
.root {
  display: flex;
  align-items: stretch;
  height: var(--h-bar);
  background: var(--bar);
  border-bottom: 1px solid var(--divider);
  box-sizing: content-box;
}

.tab {
  display: flex;
  /* stretch, pas center : .select/.close doivent remplir toute la hauteur de la bande
     pour que leur fond (actif) couvre bien du filet du haut à celui du bas, comme dans
     le mockup où tout tenait dans un seul élément — pas juste la hauteur de leur contenu */
  align-items: stretch;
  border-right: 1px solid var(--divider);
}

.select {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: none;
  background: none;
  font: var(--weight-semibold) 11.5px var(--font-ui);
  color: var(--ink-2);
  cursor: pointer;
}

.active .select {
  background: var(--paper-bright);
  font-weight: var(--weight-bold);
  color: var(--ink);
}

.tab.active {
  border-top: 2px solid transparent;
}

.meta {
  font: 500 10px var(--font-mono);
  color: var(--ink-4);
}

.close {
  display: flex;
  align-items: center;
  padding: 0 8px;
  border: none;
  background: var(--paper-bright);
  color: var(--ink-5);
  cursor: pointer;
}

.close:focus-visible,
.select:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
```

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/ui/TabStrip
```

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(ui): TabStrip, rendu et état actif"
```

---

## Tâche 4 : `TabStrip` — sélection, fermeture, réordonnancement

**Fichiers :** modifier `src/ui/TabStrip/TabStrip.test.tsx`

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { fireEvent } from '@testing-library/react'

test('cliquer un onglet le sélectionne', async () => {
  const onSelect = vi.fn()
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={onSelect} onClose={vi.fn()} onReorder={vi.fn()} />)
  await userEvent.click(screen.getByRole('tab', { name: /public/i }))
  expect(onSelect).toHaveBeenCalledWith('public')
})

test('la croix ferme sans sélectionner', async () => {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={onSelect} onClose={onClose} onReorder={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /fermer orders/i }))
  expect(onClose).toHaveBeenCalledWith('orders')
  expect(onSelect).not.toHaveBeenCalled()
})

test('glisser un onglet sur un autre les réordonne', () => {
  const onReorder = vi.fn()
  render(<TabStrip tabs={demoTabs} activeId="orders" onSelect={vi.fn()} onClose={vi.fn()} onReorder={onReorder} />)
  const wrappers = screen.getAllByRole('tab').map((el) => el.closest('[draggable]') as HTMLElement)
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'public') }
  fireEvent.dragStart(wrappers[0], { dataTransfer })
  fireEvent.drop(wrappers[2], { dataTransfer })
  expect(onReorder).toHaveBeenCalledWith([demoTabs[1], demoTabs[2], demoTabs[0]])
})
```

Le test de glissement fournit son propre `dataTransfer` : jsdom n'implémente
pas l'objet natif, `fireEvent` accepte de le remplacer par un simple espion.

- [ ] **Étape 2 : lancer, constater l'échec puis le succès**

```bash
pnpm vitest run src/ui/TabStrip
```

Attendu : 6 tests passants au total (3 de la tâche 3, 3 ici).

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "feat(ui): TabStrip, sélection et réordonnancement"
```

---

## Tâche 5 : icône console dans `TitleBar`

**Fichiers :** modifier `src/shell/TitleBar/{TitleBar.tsx,TitleBar.test.tsx}`

Voir la correction de périmètre en tête de plan : prop `showConsole?: boolean`,
défaut `false`, aucun changement de comportement pour `A1`.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
test('affiche la console seulement si demandé', () => {
  render(<TitleBar showConsole />)
  expect(screen.getByRole('button', { name: /console/i })).toBeInTheDocument()
})
```

Le test existant « n'affiche pas la console sur cet écran » (`render(<TitleBar />)`
sans la prop) doit rester vert sans modification — c'est lui qui protège `A1`.

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/shell/TitleBar
```

- [ ] **Étape 3 : implémenter**

Ajouter, à côté du bouton préférences déjà présent, un bouton conditionnel :

```tsx
{showConsole ? (
  <button type="button" aria-label="Console" className={styles.iconButton}>
    <Icon name="term" size={15} strokeWidth={1.8} />
  </button>
) : null}
```

Réutiliser la classe existante du bouton préférences (`styles.iconButton` ou
équivalent déjà en place) plutôt que d'en écrire une seconde.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/shell/TitleBar
```

Attendu : le nouveau test passe, l'ancien (absence sur `A1`) passe toujours.

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(shell): icône console optionnelle dans TitleBar"
```

---

## Tâche 6 : galerie

**Fichiers :** modifier `src/design/gallery/Gallery.tsx`

- [ ] **Étape 1 : ajouter une section `SplitPane`**

Deux `SplitPane` imbriqués (`storageKey` distincts de ceux des tests, par
exemple `gallery-sidebar` et `gallery-detail`), avec des blocs de couleur en
guise de contenu, pour vérifier visuellement l'imbrication à trois zones que
`04`/`09`/`10` utiliseront.

- [ ] **Étape 2 : ajouter une section `TabStrip`**

Trois onglets de démonstration (schéma, table, console), état contrôlé par
`useState` local à la galerie pour que le clic change réellement l'onglet actif.

- [ ] **Étape 3 : vérifier l'absence en production**

```bash
pnpm build && rg -c "SplitPane\|TabStrip" dist/assets/*.js
```

Attendu : identique au comportement déjà vérifié en `02` pour le reste de la
galerie — aucune fuite en dehors du chemin `?gallery`.

- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(design): galerie — SplitPane et TabStrip"
```

---

## Acquis d'exécution — quatre défauts, aucun vu par la CI

À lire avant d'écrire d'autres primitives : les quatre étaient **invisibles** au moment
de leur introduction, tests unitaires verts.

| Défaut | Trouvé par |
| --- | --- |
| `localStorage` est `undefined` sous Vitest : Node 26 expose un global expérimental, inactif sans `--localstorage-file`, dont l'accesseur masque celui de jsdom | le premier test qui y touche, puis sondes de descripteurs — `sessionStorage` de jsdom marche, `localStorage` non, et jsdom seul le fournit correctement |
| L'écriture dans `localStorage` n'était **pas couverte** : les 3 tests de la tâche 1 restaient verts avec `setItem` supprimé | contrôle négatif systématique |
| La racine de `SplitPane` prenait la hauteur de son contenu — 15 px dans une boîte de 180 — au lieu de remplir sa boîte | mise en scène dans la galerie, puis mesure de la chaîne de parents |
| Onglet actif 5 px trop large, et fond `--paper-bright` au lieu de `--paper` | mesure du **mockup lui-même** dans un navigateur, comparée chiffre par chiffre au nôtre |

**Les leçons, transposables :**

1. **jsdom ne calcule aucune mise en page.** Toute exigence de hauteur, largeur ou
   position est structurellement hors de portée de Vitest — y mesurer un
   `getBoundingClientRect()` renvoie zéro. Ces exigences ont besoin d'un test
   Playwright : `e2e/layout-primitives.spec.ts` existe pour ça, et chacune de ses
   assertions a été vérifiée par sabotage.
2. **Le contrôle négatif se fait par sabotage, pas par relecture.** Trois tests qui
   « testent la persistance » peuvent ne tester que la lecture. Retirer la ligne
   soupçonnée et constater que la suite reste verte est la seule preuve.
3. **`--paper` et `--paper-bright` sont faciles à confondre**, et l'erreur est
   invisible à l'œil (#FBF7EF contre #FFFDF8). `--paper-bright` n'habille que le haut
   du dégradé de la barre de titre ; toute surface de contenu est `--paper`.
4. **Une croix rendue en bouton frère ne reproduit pas les espacements d'un conteneur
   unique.** Le mockup pose un `gap` que le corps doit porter en `padding-right`, sans
   répéter le padding du bord. Répéter les deux élargit l'onglet en silence.
5. **Biome refuse les gestionnaires d'événements sur un élément statique**, y compris
   sous `role="presentation"`. Le glisser-déposer d'un onglet vit donc sur le bouton
   `role="tab"`, ce qui est de toute façon plus juste — l'élément interactif porte
   l'interaction. Conséquence assumée : la zone de dépôt de l'onglet actif exclut la
   largeur de la croix.

## Tâche 7 : vérification de fin

Contrôlé contre `specs/03-coquille-panneaux-onglets.md` § Terminé quand.

- [x] **`SplitPane` redimensionne à la souris et au clavier, respecte ses bornes,
      retrouve sa taille après rechargement** — vérifié dans un navigateur réel :
      212 → 228 par deux `ArrowRight`, valeur retrouvée après `reload()`. Bornes
      couvertes par test unitaire. Glissement pointeur couvert par test unitaire et
      vérifié à la main.
- [x] **deux `SplitPane` imbriqués reproduisent la disposition à trois zones de `A4`** —
      mesuré : trois zones et deux poignées à 180 px dans un conteneur de 182,
      verrouillé par test e2e.
- [x] **`TabStrip` conforme à l'onglet actif du mockup** — largeur 98,3 px, fond
      `rgb(251, 247, 239)`, trait `rgb(242, 101, 58)`, écart libellé-croix 7 px :
      **identiques au mockup sur les cinq mesures**. Réordonnancement et fermeture
      couverts par tests unitaires, deux sabotages détectés.
- [x] **parcours clavier** — poignées atteintes dans l'ordre (212 puis 300), bande
      parcourue `public → orders → Fermer orders → console 1·psql`, anneau de focus
      `--shadow-focus` résolu en `oklab(…)` sur les trois types de cible. Curseur
      `col-resize` sur la poignée.
- [x] **icône console** visible et focalisable sous `showConsole`, absente sinon — le
      test qui protège `A1` reste vert sans modification, et l'ordre console-avant-
      préférences du mockup est couvert.
- [x] les deux primitives visibles dans la galerie, absentes du bundle de production.
- [x] `rg` ne remonte que le `.06` documenté du dégradé de poignée.
- [x] `pnpm test` (79), `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` (3) verts —
      dont la capture `A1` à tolérance zéro, qui confirme que ni `showConsole` ni
      l'`overflow: hidden` de `reset.css` n'ont altéré l'écran d'accueil.
