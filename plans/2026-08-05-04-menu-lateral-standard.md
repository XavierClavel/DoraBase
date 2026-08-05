# Plan d'implémentation — 04 Menu latéral standard

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** les briques présentationnelles de la sidebar 212px partagée par
`A5`→`A9` — barre de filtre, ligne d'arbre, ligne de colonne, pied console.

**Architecture :** cinq composants purs, sans état ni récursion, assemblés par
`Sidebar`. Trois nouvelles teintes d'encre rejoignent `tokens.json` avant
d'écrire le premier composant qui les consomme.

**Stack :** React · CSS Modules · Vitest · Testing Library

**Spec :** `specs/04-menu-lateral-standard.md` — **Prérequis :** plans `01`, `02`, `03`

---

## À savoir avant de commencer

**L'indentation n'est pas arithmétique.** La prose du `README.md` parle de
« paliers de 14 px », mais les quatre valeurs mesurées dans le mockup sont
`8, 22, 36, 52` — écarts de `14, 14, 16`. Une formule `8 + depth * 14`
donnerait `50` au dernier palier, pas `52`. Retenir le tableau littéral, pas la
formule : encore un cas où la prose du handoff est moins précise que le mockup.

**Trois teintes d'encre à ajouter, comptées avant d'écrire le composant.** La
règle posée en `02` — un token quand la valeur revient des dizaines de fois —
s'applique ici à trois valeurs comptées dans `design/handoff/DoraBase.dc.html` :
`rgba(35,32,28,.75)` (47 occurrences, texte de ligne d'arbre au repos),
`rgba(35,32,28,.7)` (50 occurrences, texte de ligne de colonne), `rgba(35,32,28,.5)`
(61 occurrences, ligne de résumé muette). Nommées `--ink-6`, `--ink-7`, `--ink-8`
dans la continuité de `--ink-2`…`--ink-5` déjà en place — la suite numérique
existante ne suit pas l'ordre des valeurs, inutile de la retrier.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src/design/tokens.json` | modifié : trois teintes d'encre |
| `src/ui/SidebarFilterBar/{…}` | barre de filtre |
| `src/ui/TreeRow/{…}` | ligne d'arbre |
| `src/ui/ColumnRow/{…}` | ligne de colonne + titre de section |
| `src/ui/ConsoleFooterButton/{…}` | pied de console |
| `src/ui/Sidebar/{…}` | assemblage en colonne 212 px |
| `src/design/gallery/Gallery.tsx` | modifié |

---

## Tâche 1 : trois teintes d'encre

**Fichiers :** modifier `src/design/tokens.json`

- [ ] **Étape 1 : ajouter les entrées**

Dans `src/design/tokens.json`, repérer l'objet `"ink"` existant (il contient déjà
les clés `base`, `2`, `3`, `4`, `5`, `meta`, `on-accent`, `on-dark`) et y **ajouter**
trois clés, sans toucher aux autres :

```json
"6": "rgba(35,32,28,.75)",
"7": "rgba(35,32,28,.7)",
"8": "rgba(35,32,28,.5)"
```

**Ne pas copier un objet `"ink"` complet depuis ce plan** — seules ces trois
lignes sont nouvelles, le reste de l'objet doit rester tel quel dans le fichier
réel.

- [ ] **Étape 2 : régénérer et vérifier**

```bash
pnpm tokens:build && pnpm tokens:check
```

Attendu : sort en 0. `rg -- '--ink-6|--ink-7|--ink-8' src/design/tokens.css`
montre les trois nouvelles déclarations.

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "feat(design): trois teintes d'encre pour la sidebar standard"
```

---

## Tâche 2 : `SidebarFilterBar`

**Fichiers :** créer `src/ui/SidebarFilterBar/{SidebarFilterBar.tsx,SidebarFilterBar.module.css,SidebarFilterBar.test.tsx}`

Valeurs — hauteur 34 (`--h-bar`), filet bas `--divider-2`, loupe 12px
`--ink-4`, texte et compteur `rgba(35,32,28,.35)` (`--ink-3`).

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarFilterBar } from './SidebarFilterBar'

test('affiche le compteur de correspondances', () => {
  render(<SidebarFilterBar value="order" onChange={vi.fn()} matchCount={2} totalCount={8} />)
  expect(screen.getByText('2/8')).toBeInTheDocument()
})

test('remonte la saisie', async () => {
  const onChange = vi.fn()
  render(<SidebarFilterBar value="" onChange={onChange} placeholder="Filtrer l'arborescence…" />)
  await userEvent.type(screen.getByRole('textbox'), 'x')
  expect(onChange).toHaveBeenCalledWith('x')
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/SidebarFilterBar
```

- [ ] **Étape 3 : implémenter, puis lancer**

Champ texte contrôlé, sans bordure ni fond propres (`background: none; border:
none`), le compteur ne s'affiche que si `matchCount`/`totalCount` sont fournis.

```bash
pnpm vitest run src/ui/SidebarFilterBar
```

- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(ui): SidebarFilterBar"
```

---

## Tâche 3 : `TreeRow`

**Fichiers :** créer `src/ui/TreeRow/{TreeRow.tsx,TreeRow.module.css,TreeRow.test.tsx}`

Valeurs — hauteur 22 (`--h-tree-row`), paliers `[8, 22, 36, 52]` (voir note en
tête de plan). Chevron `--ink-meta`, tourné 90° si ouvert. Sélectionné : fond
`color-mix(in oklab, var(--accent) 22%, transparent)`, `box-shadow: inset 2px 0
0 var(--accent)`, texte `--ink` `700`. Non sélectionné : `--ink-6`. Repliée
(`muted`) : icônes ramenées à `--ink-meta`.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
// src/ui/TreeRow/TreeRow.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TreeRow } from './TreeRow'

test('indente selon le palier fourni, pas selon une formule', () => {
  render(<TreeRow depth={3} label="orders" />)
  const row = screen.getByText('orders').closest('[data-depth]') as HTMLElement
  expect(row.style.paddingLeft).toBe('52px')
})

test('la ligne sélectionnée porte le style dédié', () => {
  render(<TreeRow depth={3} label="orders" selected />)
  const row = screen.getByText('orders').closest('[data-depth]') as HTMLElement
  expect(row).toHaveClass('selected')
})

test('un clic déclenche onClick', async () => {
  const onClick = vi.fn()
  render(<TreeRow depth={0} label="Atelier Nord" onClick={onClick} />)
  await userEvent.click(screen.getByText('Atelier Nord'))
  expect(onClick).toHaveBeenCalledOnce()
})

test('affiche la métadonnée de fin de ligne', () => {
  render(<TreeRow depth={2} label="analytics" trailing="4.2 GB" />)
  expect(screen.getByText('4.2 GB')).toBeInTheDocument()
})
```

Le premier test protège exactement la divergence notée en tête de plan : une
implémentation qui recalculerait l'indentation par `8 + depth * 14` le ferait
échouer (`50px` au lieu de `52px`).

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/TreeRow
```

- [ ] **Étape 3 : implémenter**

```tsx
// src/ui/TreeRow/TreeRow.tsx
import type { ReactNode } from 'react'
import type { IconName } from '../../design/icons/names'
import { Icon } from '../../design/icons/Icon'
import { cx } from '../cx'
import styles from './TreeRow.module.css'

const INDENT = [8, 22, 36, 52] as const

type TreeRowProps = {
  depth: 0 | 1 | 2 | 3
  label: string
  icon?: IconName
  iconColor?: string
  chevron?: 'open' | 'closed'
  trailing?: ReactNode
  selected?: boolean
  muted?: boolean
  onClick?: () => void
}

export function TreeRow({ depth, label, icon, iconColor, chevron, trailing, selected, muted, onClick }: TreeRowProps) {
  return (
    <div
      className={cx(styles.root, selected && styles.selected)}
      style={{ paddingLeft: INDENT[depth] }}
      data-depth={depth}
      onClick={onClick}
    >
      {chevron ? (
        <Icon name="chevr" size={11} className={cx(styles.chevron, chevron === 'open' && styles.chevronOpen)} />
      ) : null}
      {icon ? <Icon name={icon} size={13} style={{ color: muted ? 'var(--ink-meta)' : iconColor }} /> : null}
      <span className={styles.label}>{label}</span>
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  )
}
```

```css
/* src/ui/TreeRow/TreeRow.module.css */
.root {
  display: flex;
  align-items: center;
  gap: 5px;
  height: var(--h-tree-row);
  padding-right: 8px;
  color: var(--ink-6);
  cursor: pointer;
}

.selected {
  background: color-mix(in oklab, var(--accent) 22%, transparent);
  box-shadow: inset 2px 0 0 var(--accent);
  color: var(--ink);
  font-weight: var(--weight-bold);
}

.chevron {
  color: var(--ink-meta);
  flex: none;
}

.chevronOpen {
  transform: rotate(90deg);
}

.label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trailing {
  font: 500 10px var(--font-mono);
  color: var(--ink-3);
  flex: none;
}
```

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/ui/TreeRow
```

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(ui): TreeRow"
```

---

## Tâche 4 : `ColumnRow` et titre de section

**Fichiers :** créer `src/ui/ColumnRow/{ColumnRow.tsx,ColumnRow.module.css,ColumnRow.test.tsx}`,
`src/ui/SidebarSectionTitle/{SidebarSectionTitle.tsx,SidebarSectionTitle.module.css,SidebarSectionTitle.test.tsx}`

Valeurs — titre 18px, `700 9.5px` uppercase `letter-spacing .6px` `--ink-3`.
Colonne 20px, `padding: 0 8px 0 14px`, `500 11px` mono, texte `--ink-7`.
Glyphe de type : icône (clé `--gold`, FK `--info-base`) ou lettre `--ink-5`.
Métadonnée : `--ink-3` au repos, `--accent-deep` filtrée/triée. Ligne de résumé
(« + n autres ») : `--ink-8`, sans glyphe.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
// src/ui/ColumnRow/ColumnRow.test.tsx
import { render, screen } from '@testing-library/react'
import { ColumnRow } from './ColumnRow'

test('affiche le glyphe lettre et la métadonnée', () => {
  render(<ColumnRow label="status" typeGlyph="T" meta="filtré" metaActive />)
  expect(screen.getByText('T')).toBeInTheDocument()
  expect(screen.getByText('filtré')).toBeInTheDocument()
})

test('affiche une icône de type à la place de la lettre', () => {
  render(<ColumnRow label="id" typeIcon="key" typeIconColor="var(--gold)" meta="int8" />)
  expect(screen.queryByText('T')).not.toBeInTheDocument()
})

test('la ligne de résumé n’a pas de glyphe', () => {
  render(<ColumnRow label="+ 11 autres" summary />)
  expect(screen.getByText('+ 11 autres')).toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/ColumnRow
```

- [ ] **Étape 3 : implémenter `ColumnRow`**

`typeGlyph` (lettre, `T`/`#`/`⏱`/`{}`/`ID`) et `typeIcon` (clé/FK) sont
mutuellement exclusifs ; `summary` masque tout glyphe et applique `--ink-8`.
`metaActive` bascule la couleur de la métadonnée sur `--accent-deep`.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/ui/ColumnRow
```

- [ ] **Étape 5 : `SidebarSectionTitle`, même cycle**

```tsx
test('rend le titre de section en capitales', () => {
  render(<SidebarSectionTitle>Colonnes de orders</SidebarSectionTitle>)
  expect(screen.getByText('Colonnes de orders')).toBeInTheDocument()
})
```

Rouge → implémentation (`height: 18px`, `text-transform: uppercase`) → vert.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "feat(ui): ColumnRow et titre de section"
```

---

## Tâche 5 : `ConsoleFooterButton`

**Fichiers :** créer `src/ui/ConsoleFooterButton/{ConsoleFooterButton.tsx,ConsoleFooterButton.module.css,ConsoleFooterButton.test.tsx}`

Valeurs — 26px, `700 11px` Nunito, icône `i-plus` 13px, texte
« + Nouvelle console », `--ink-2`.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsoleFooterButton } from './ConsoleFooterButton'

test('est un vrai bouton qui déclenche onClick', async () => {
  const onClick = vi.fn()
  render(<ConsoleFooterButton onClick={onClick} />)
  await userEvent.click(screen.getByRole('button', { name: /nouvelle console/i }))
  expect(onClick).toHaveBeenCalledOnce()
})
```

- [ ] **Étape 2 : lancer, constater l'échec, implémenter, constater le succès**

```bash
pnpm vitest run src/ui/ConsoleFooterButton
```

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "feat(ui): ConsoleFooterButton"
```

---

## Tâche 6 : assemblage `Sidebar`

**Fichiers :** créer `src/ui/Sidebar/{Sidebar.tsx,Sidebar.module.css,Sidebar.test.tsx}`

Colonne 212px, fond `--paper-alt`, filet droit `--divider`. Empile
`SidebarFilterBar`, une zone défilante (`children`), puis `footer` optionnel.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'
import { SidebarFilterBar } from '../SidebarFilterBar/SidebarFilterBar'
import { ConsoleFooterButton } from '../ConsoleFooterButton/ConsoleFooterButton'

test('assemble filtre, contenu et pied', () => {
  render(
    <Sidebar
      filter={<SidebarFilterBar value="" onChange={vi.fn()} />}
      footer={<ConsoleFooterButton onClick={vi.fn()} />}
    >
      <div>contenu de l'arbre</div>
    </Sidebar>,
  )
  expect(screen.getByRole('textbox')).toBeInTheDocument()
  expect(screen.getByText("contenu de l'arbre")).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /nouvelle console/i })).toBeInTheDocument()
})

test('le pied est optionnel', () => {
  render(<Sidebar filter={<SidebarFilterBar value="" onChange={vi.fn()} />}>{null}</Sidebar>)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
```

- [ ] **Étape 2 : lancer, constater l'échec, implémenter, constater le succès**

```bash
pnpm vitest run src/ui/Sidebar
```

- [ ] **Étape 3 : vérifier la largeur dans la galerie (tâche 7) avant de committer**
- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(ui): assemblage Sidebar"
```

---

## Tâche 7 : galerie

**Fichiers :** modifier `src/design/gallery/Gallery.tsx`

- [ ] **Étape 1 : composer une sidebar de démonstration**

Reproduire la hiérarchie de `A5` (projet → base → schéma → deux tables, l'une
sélectionnée → section « Colonnes de orders » avec ses lignes, y compris la
ligne de résumé) avec des données fictives, dans un `Sidebar` mesurable à
212px dans la galerie.

- [ ] **Étape 2 : vérifier l'absence en production**

```bash
pnpm build && rg -c "TreeRow\|ColumnRow" dist/assets/*.js
```

Attendu : aucun résultat hors chemin `?gallery`.

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "feat(design): galerie — sidebar standard"
```

---

## Tâche 8 : vérification de fin

Contrôler chaque critère de `specs/04-menu-lateral-standard.md` § Terminé quand.

- [ ] les cinq briques rendent, pixel pour pixel, les valeurs mesurées (ligne
      normale `.75`, sélectionnée, repliée ; colonne normale `.7`, filtrée,
      triée, résumé `.5`)
- [ ] `Sidebar` composé de dix lignes de démonstration atteint 212px, comparé au
      mockup `A5`
- [ ] le survol de ligne utilise `--hover-row`
- [ ] parcours clavier : chaque `TreeRow`/`ColumnRow` interactive atteinte, anneau
      de focus visible
- [ ] les cinq briques visibles dans la galerie
- [ ] `rg -n "#[0-9A-Fa-f]{3,6}|rgba\(" src/ui/TreeRow src/ui/ColumnRow
      src/ui/SidebarFilterBar src/ui/ConsoleFooterButton src/ui/Sidebar` ne
      remonte aucun résultat — les trois teintes sont maintenant dans
      `tokens.json`
- [ ] `pnpm test && pnpm lint && pnpm typecheck` verts
