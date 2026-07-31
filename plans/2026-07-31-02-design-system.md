# Plan d'implémentation — 02 Design system

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** tokens, polices, icônes et primitives, pour que les écrans n'aient plus
qu'à composer.

**Architecture :** `tokens.json` est la transcription revue du handoff ; `tokens.css` et
`tokens.ts` en sont **générés**, jamais édités. Les icônes sont **extraites** du mockup,
jamais redessinées. Les primitives ne lisent que des tokens.

**Stack :** Vitest · CSS Modules · Fontsource · scripts Node

**Spec :** `specs/02-design-system.md` — **Prérequis :** plan `01` terminé

---

## Amendement proposé au périmètre

La spec liste onze primitives. Quatre d'entre elles — popover, tooltip, contrôle
segmenté, stepper — **ne sont utilisées par aucun écran avant les specs `08` et `10`**.
Les construire maintenant, c'est décider de leur API sans le cas d'usage qui la
contraint, donc la refaire ensuite.

Ce plan les met donc en tâches **différées** (11 à 13), à déplacer dans les specs
d'écran qui les réclament. Les tâches 1 à 10 couvrent ce dont A1 et A2 ont besoin.
C'est une modification du périmètre validé : **à confirmer avant d'exécuter la tâche 11**.

---

## À savoir avant de commencer

Trois comportements de la chaîne de build établis au plan `01`, vérifiés par exécution,
qui touchent directement ce plan.

**Les classes de CSS Modules sont typées `string | undefined`.** C'est la conséquence de
`noUncheckedIndexedAccess: true` combiné au type que `vite/client` donne aux CSS Modules.
En pratique `className={styles.card}` passe très bien, puisque `className` accepte
`undefined` — mais toute affectation vers un `string` strict échouera. Ne désactive pas
`noUncheckedIndexedAccess` pour contourner ça.

**Le CSS est minifié par lightningcss, ciblé Safari 16.4.** `oklch()` et `lch()`
traversent intacts, le nesting `&:hover` est aplati en sélecteur explicite — sans
conséquence sémantique. En revanche `color-mix()` **entièrement littéral** est replié en
`oklab(…)` au build, inconditionnellement. Le handoff mélangeant toujours depuis
`var(--accent)`, le cas ne devrait pas se présenter ; si tu écris un mélange littéral,
sache qu'il ne sera pas relisible tel quel en devtools.

**Les imports `?raw`, woff2 et CSS à effet de bord fonctionnent**, au typecheck comme au
build — vérifié. Une woff2 sous 4 Ko serait inlinée en data URI ; les vraies polices
dépasseront la limite et sortiront en fichiers.

Et trois acquis de la configuration Biome, tous vérifiés par exécution.

**Prévoir un helper `cx()` dès le premier composant.** `noUncheckedIndexedAccess` type les
classes de CSS Modules en `string | undefined`, et la règle `noNonNullAssertion` de Biome
interdit le `!` qui serait le réflexe. Les deux outils poussent en sens inverse sur le
geste le plus fréquent du design system. En JSX direct `className={styles.root}` passe
sans rien ; c'est dans les littéraux de gabarit que ça coince. Un
`cx(...parts) => parts.filter(Boolean).join(' ')` satisfait les deux et règle la question
une fois pour toutes. Ne désactive ni l'une ni l'autre.

**`:global()` dans un CSS Module est un piège d'ordre.** Les imports CSS à effet de bord
sont des ancres que Biome ne déplace jamais, mais les imports de CSS Modules ont une
liaison par défaut et **sont** réordonnés par `organizeImports`. Sans conséquence tant que
les classes sont hashées — sauf si un module utilise `:global()`, dont les règles sortent
du scope et redeviennent sensibles à l'ordre de cascade. Mets ces règles dans une feuille
globale importée en effet de bord, pas dans un module.

**Biome n'a aucune règle de nom accessible.** Ses 38 règles a11y couvrent beaucoup — un
`role="switch"` sans `aria-checked`, une coquille dans un attribut ARIA, un `<div onClick>`
sans rôle — mais rien n'attrape un `<button type="button" />` sans nom accessible. Ce
n'est pas un réglage manquant, c'est une limite de l'outil. La couverture doit donc venir
des tests : les assertions de ce plan sont volontairement écrites en
`getByRole('switch', { name: … })` plutôt que par sélecteur ou `data-testid`. C'est ce qui
tient lieu de garde-fou, ne les affaiblis pas.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `design/handoff/` | le bundle de handoff, versionné |
| `src/design/tokens.json` | source unique des valeurs |
| `scripts/tokens.mjs` | fonctions pures d'aplatissement et d'émission |
| `scripts/build-tokens.mjs` | entrées-sorties du générateur |
| `src/design/tokens.css` · `tokens.ts` | **générés** |
| `scripts/extract-icons.mjs` | extraction des symboles du mockup |
| `src/design/icons/sprite.svg` · `names.ts` | **générés** |
| `src/design/icons/Icon.tsx` · `Sprite.tsx` | composants d'icône |
| `src/design/fonts.css` | déclarations de polices |
| `src/ui/<Primitive>/` | une primitive par dossier : `.tsx`, `.module.css`, `.test.tsx` |
| `src/design/gallery/` | galerie de développement |

---

## Tâche 1 : versionner le handoff

**Fichiers :** créer `design/handoff/`

- [ ] **Étape 1 : copier le bundle**

```bash
mkdir -p design/handoff
cp ~/Downloads/design_handoff_dorabase/{README.md,DoraBase.dc.html,icon-dorabase.svg,icon-preview.html} design/handoff/
```

`support.js` est délibérément exclu : le handoff précise qu'il n'a « aucune valeur pour
l'implémentation ». `icon-preview.html` ne s'ouvrira plus tel quel, ce qui est sans
conséquence.

- [ ] **Étape 2 : vérifier les références de ligne des specs**

```bash
sed -n '116p;153p' design/handoff/DoraBase.dc.html
```

Attendu : la ligne 116 ouvre la fenêtre A1 (`width:1360px`), la 153 est la barre
d'état (`0 projet`). Si les numéros ont bougé, corriger `specs/07-a1-accueil.md`.

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "docs(design): versionner le bundle de handoff"
```

---

## Tâche 2 : générateur de tokens

**Fichiers :** créer `scripts/tokens.mjs`, `scripts/tokens.test.mjs`

Règles d'aplatissement : les clés imbriquées sont jointes par `-`, et la clé `base`
disparaît — donc `ink.base` donne `--ink` et `ink.2` donne `--ink-2`.

- [ ] **Étape 1 : écrire le test qui échoue**

```js
// scripts/tokens.test.mjs
import { flatten, emitCss, emitTs } from './tokens.mjs'

const tree = {
  surface: { canvas: '#EFEAE0', paper: '#FBF7EF' },
  ink: { base: '#23201C', 2: 'rgba(35,32,28,.55)' },
}

test('aplatit en joignant par tiret et absorbe la clé base', () => {
  expect(flatten(tree)).toEqual({
    'surface-canvas': '#EFEAE0',
    'surface-paper': '#FBF7EF',
    ink: '#23201C',
    'ink-2': 'rgba(35,32,28,.55)',
  })
})

test('émet un bloc :root trié', () => {
  expect(emitCss(flatten(tree))).toContain('  --surface-canvas: #EFEAE0;')
  expect(emitCss(flatten(tree))).toMatch(/^:root \{/m)
})

test('émet un type TokenName et des références var()', () => {
  const ts = emitTs(flatten(tree))
  expect(ts).toContain("'surface-canvas': 'var(--surface-canvas)'")
  expect(ts).toContain('export type TokenName')
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run scripts/tokens.test.mjs
```

Attendu : ÉCHEC, `Failed to resolve import './tokens.mjs'`.

- [ ] **Étape 3 : écrire l'implémentation minimale**

`flatten` parcourt récursivement, `emitCss` et `emitTs` émettent des chaînes triées.
Les deux fonctions restent pures — aucune lecture de fichier ici, c'est ce qui les
rend testables.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run scripts/tokens.test.mjs
```

Attendu : 3 tests passants.

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(design): générateur de tokens, fonctions pures"
```

---

## Tâche 3 : transcrire les tokens

**Fichiers :** créer `src/design/tokens.json`, `scripts/build-tokens.mjs` ;
modifier `package.json`

C'est **la** tâche à faire lentement, avec `design/handoff/README.md` § Design tokens
ouvert à côté. Tout ce qui suit dans le projet en dépend.

- [ ] **Étape 1 : écrire `tokens.json`**

Groupes et nommage imposés par `specs/02-design-system.md` § Tokens. Reprendre chaque
table du handoff dans l'ordre : surfaces et encre, accent et sémantique, couleurs par
moteur, coloration syntaxique, typographie, espacement, rayons, ombres, hauteurs.

- [ ] **Étape 2 : écrire `scripts/build-tokens.mjs` et les scripts pnpm**

```json
"tokens:build": "node scripts/build-tokens.mjs",
"tokens:check": "node scripts/build-tokens.mjs && git diff --exit-code src/design/tokens.css src/design/tokens.ts"
```

Les deux fichiers générés portent un en-tête `/* Généré par pnpm tokens:build — ne pas éditer */`.

- [ ] **Étape 3 : générer et vérifier l'idempotence**

```bash
pnpm tokens:build && pnpm tokens:build && pnpm tokens:check
```

Attendu : `tokens:check` sort en 0. Puis relecture croisée : chaque valeur des tables
du handoff a bien un token.

- [ ] **Étape 4 : brancher la CI**

Ajouter `- run: pnpm tokens:check` dans `.github/workflows/ci.yml`, après `pnpm lint`.

- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(design): transcription des tokens du handoff"
```

---

## Tâche 4 : polices

**Fichiers :** créer `src/design/fonts.css` ; modifier `src/main.tsx`

Fontsource publie les polices Google en paquets npm auto-hébergés, avec leur licence.
C'est ce qui remplace un téléchargement manuel : reproductible, et versionné par le
lockfile.

- [ ] **Étape 1 : vérifier la disponibilité en variable, puis installer**

```bash
pnpm view @fontsource-variable/nunito version
pnpm view @fontsource-variable/baloo-2 version
pnpm view @fontsource-variable/jetbrains-mono version
```

Pour chaque paquet publié en variable, l'installer ; sinon prendre `@fontsource/<nom>`
et déclarer explicitement les graisses dont le handoff a besoin — Nunito 400/500/600/700/800,
Baloo 2 700, JetBrains Mono 400/500/600/700.

- [ ] **Étape 2 : écrire `fonts.css` et l'importer dans `main.tsx`**

Importer les paquets Fontsource, puis `font-display: block` — un rendu court en police
de substitution décalerait toute la grille dense.

- [ ] **Étape 3 : vérifier hors ligne**

```bash
pnpm tauri dev
```

Attendu : les trois polices s'affichent, aucun clignotement de substitution. Vérifier
dans l'onglet réseau de l'inspecteur qu'aucune requête ne sort.

- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(design): polices auto-hébergées"
```

---

## Tâche 5 : extraction des icônes

**Fichiers :** créer `scripts/extract-icons.mjs`, `scripts/extract-icons.test.mjs`

- [ ] **Étape 1 : écrire le test qui échoue**

```js
import { extractSymbols } from './extract-icons.mjs'

const html = `<svg><symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14"/></symbol>
<symbol id="logo" viewBox="0 0 512 512"><path d="M0 0h1v1H0z"/></symbol>
<symbol id="autre" viewBox="0 0 24 24"><path d="M0 0"/></symbol></svg>`

test('retient les symboles i-* et le logo, ignore le reste', () => {
  const names = extractSymbols(html).map((s) => s.id)
  expect(names).toEqual(['i-plus', 'logo'])
})

test('conserve le contenu du symbole tel quel', () => {
  expect(extractSymbols(html)[0].inner).toBe('<path d="M12 5v14"/>')
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run scripts/extract-icons.test.mjs
```

- [ ] **Étape 3 : implémenter, puis générer**

`extractSymbols` reste pure ; le script écrit `src/design/icons/sprite.svg` et
`names.ts` (union de type des 47 noms sans le préfixe `i-`).

```bash
node scripts/extract-icons.mjs && pnpm vitest run scripts/extract-icons.test.mjs
```

Attendu : 2 tests passants, et `grep -c '<symbol' src/design/icons/sprite.svg` renvoie 48.

- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(design): sprite d'icônes extrait du mockup"
```

---

## Tâche 6 : composants Sprite et Icon

**Fichiers :** créer `src/design/icons/Sprite.tsx`, `Icon.tsx`, `Icon.test.tsx` ;
modifier `src/app/App.tsx`

Le sprite est **injecté dans le document** plutôt que référencé comme fichier externe :
`<use href="fichier.svg#id">` ne fait pas hériter `currentColor` et se heurte à la CSP.
`Sprite` importe le SVG en brut via `?raw` de Vite et le rend une fois, caché.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { render } from '@testing-library/react'
import { Icon } from './Icon'

test('rend un use vers le symbole préfixé', () => {
  const { container } = render(<Icon name="plus" size={14} />)
  const use = container.querySelector('use')
  expect(use?.getAttribute('href')).toBe('#i-plus')
})

test('applique les attributs de trait du handoff', () => {
  const { container } = render(<Icon name="plus" strokeWidth={2.2} />)
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('fill', 'none')
  expect(svg).toHaveAttribute('stroke', 'currentColor')
  expect(svg).toHaveAttribute('stroke-width', '2.2')
  expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
})
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/design/icons/Icon.test.tsx
```

- [ ] **Étape 3 : implémenter `Icon` et `Sprite`, monter `Sprite` dans `App`**

`name` est typé par l'union générée : une icône inexistante ne compile pas.
Taille par défaut 14, `strokeWidth` par défaut 2, `aria-hidden` par défaut.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/design/icons/Icon.test.tsx && pnpm typecheck
```

- [ ] **Étape 5 : vérifier qu'un nom invalide échoue**

Ajouter temporairement `<Icon name="inexistante" />` dans `App.tsx`, lancer
`pnpm typecheck`, constater l'erreur, retirer la ligne.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "feat(design): composants Sprite et Icon typés"
```

---

## Tâche 7 : primitive Button

**Fichiers :** créer `src/ui/Button/{Button.tsx,Button.module.css,Button.test.tsx}`

Variantes observées dans les maquettes : `accent`, `ink` (fond `#23201C`),
`secondary` (bordé sur papier), `ghost`. Tailles `sm` (23–25 px) et `md` (28–31 px).
Un emplacement optionnel pour le raccourci, rendu en mono à opacité .5.

- [ ] **Étape 1 : écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

test('est un vrai bouton, focalisable et cliquable', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Nouveau projet</Button>)
  const btn = screen.getByRole('button', { name: /nouveau projet/i })
  await userEvent.tab()
  expect(btn).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

test('rend le raccourci sans polluer le nom accessible', () => {
  render(<Button shortcut="⌘N">Nouveau projet</Button>)
  expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument()
  expect(screen.getByText('⌘N')).toBeInTheDocument()
})

test('désactivé, n’appelle pas onClick', async () => {
  const onClick = vi.fn()
  render(<Button disabled onClick={onClick}>X</Button>)
  await userEvent.click(screen.getByRole('button'))
  expect(onClick).not.toHaveBeenCalled()
})
```

Le deuxième test encode une vraie exigence : `⌘N` est un indice visuel, il ne doit pas
entrer dans le nom accessible du bouton — d'où `aria-hidden` sur l'emplacement.

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
pnpm vitest run src/ui/Button
```

- [ ] **Étape 3 : implémenter**

`Button.module.css` ne référence que des tokens. Hover, focus et désactivé suivent les
règles de `specs/02-design-system.md` § Primitives et états.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
pnpm vitest run src/ui/Button && pnpm lint
```

- [ ] **Étape 5 : vérifier l'absence de valeurs littérales**

```bash
rg -n "#[0-9A-Fa-f]{6}|rgba\(" src/ui/Button/Button.module.css
```

Attendu : aucun résultat.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "feat(ui): primitive Button"
```

---

## Tâche 8 : primitives Field et Toggle

**Fichiers :** créer `src/ui/Field/`, `src/ui/Toggle/`

Même cycle qu'en tâche 7 : test rouge, implémentation, test vert, contrôle d'absence de
littéraux, commit. Exigences propres :

- `Field` — hauteur 30 px (28 px en variante dense), étiquette liée par `htmlFor`,
  variante mono pour toute valeur technique. Test : l'étiquette donne bien son nom
  accessible au champ.
- `Toggle` — `role="switch"` et `aria-checked`, pilotable au clavier par Espace.
  Test : l'état annoncé suit la valeur.

- [ ] Field : rouge → vert → commit
- [ ] Toggle : rouge → vert → commit

---

## Tâche 9 : primitives Badge, Chip et Dot

**Fichiers :** créer `src/ui/Badge/`, `src/ui/Chip/`, `src/ui/Dot/`

- `Badge` — paires sémantiques : environnement (PROD, STAGING), lecture seule, édition.
  Test : la variante `prod` porte bien les tokens `danger`.
- `Chip` — filtre actif, avec croix de suppression. Test : la croix appelle `onRemove`
  et porte un nom accessible.
- `Dot` — pastille de couleur d'état ou d'environnement, purement décorative,
  `aria-hidden`.

- [ ] Badge : rouge → vert → commit
- [ ] Chip : rouge → vert → commit
- [ ] Dot : rouge → vert → commit

---

## Tâche 10 : galerie

**Fichiers :** créer `src/design/gallery/Gallery.tsx` ; modifier `src/app/App.tsx`

- [ ] **Étape 1 : rendre toutes les primitives dans tous leurs états**

Une section par primitive, chaque variante déclinée en normal, survolé, focus et
désactivé, plus une planche des 47 icônes avec leur nom.

- [ ] **Étape 2 : n'exposer la galerie qu'en développement**

Monter derrière `import.meta.env.DEV`, sur `?gallery` dans l'URL. Vérifier qu'un
`pnpm build` ne l'embarque pas :

```bash
pnpm build && rg -c "Gallery" dist/assets/*.js
```

Attendu : aucun résultat.

- [ ] **Étape 3 : commit**

```bash
git add -A && git commit -m "feat(design): galerie des primitives"
```

---

## Tâches différées — à confirmer

Voir § Amendement proposé au périmètre. Ces primitives sont à déplacer vers les specs
qui les réclament, plutôt que construites ici sans cas d'usage.

- [ ] **Tâche 11 :** Popover et Tooltip → spec `10` (popover d'opérateur, tooltip de
      raccourcis d'édition)
- [ ] **Tâche 12 :** contrôle segmenté → spec `09` (Tables / Vues / Fonctions / Index)
- [ ] **Tâche 13 :** stepper → spec `10` (LIMIT)

---

## Tâche 14 : vérification de fin

Contrôler chaque critère de `specs/02-design-system.md` § Terminé quand.

- [ ] `pnpm tokens:build` est idempotent et `pnpm tokens:check` sort en 0
- [ ] relecture croisée : chaque valeur des tables du handoff a son token
- [ ] `rg -n "#[0-9A-Fa-f]{3,6}|rgba\(" src/ui src/design --glob '!tokens.*' --glob '!sprite.svg'`
      ne remonte que des cas justifiés
- [ ] les 48 symboles sont dans le sprite ; un nom d'icône invalide ne compile pas
- [ ] la galerie montre chaque primitive en normal, survolé, focus et désactivé
- [ ] les polices s'affichent hors ligne, sans clignotement
- [ ] la CI est verte
