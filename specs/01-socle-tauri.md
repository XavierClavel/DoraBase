# 01 — Socle Tauri 2

## Objectif

Disposer d'une chaîne de build qui produit un `.app` macOS lançable, avec une CI
verte, pour que toutes les specs suivantes n'aient plus qu'à ajouter du code.

## Périmètre

- Initialisation du projet Tauri 2 avec React, TypeScript et Vite, géré par pnpm.
- Arborescence des dossiers, figée ici une fois pour toutes.
- `tauri.conf.json` : identité de l'app, fenêtre par défaut, barre de titre superposée.
- Icônes de l'application, générées depuis `icon-dorabase.svg`.
- Outillage : TypeScript strict, Biome (lint + format), Vitest, Playwright.
- Scripts pnpm : `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`.
- CI GitHub Actions sur macOS.

## Hors périmètre

- Tokens, polices, icônes de l'UI et primitives → `02`.
- Tout écran, y compris A1 → `07`.
- Accès aux bases de données → `06`.
- Signature et notarisation macOS, distribution, mise à jour automatique.
- Cibles Windows et Linux : le choix de stack les garde possibles, aucune n'est
  construite ni testée à ce stade.

## Approche

### Arborescence

```
src-tauri/
  Cargo.toml · tauri.conf.json · build.rs
  icons/                  généré par `tauri icon`
  src/main.rs · src/lib.rs
src/
  main.tsx · app/App.tsx
  design/                 tokens, polices, icônes        → spec 02
  ui/                     primitives                     → spec 02
  shell/                  TitleBar, StatusBar             → specs 03, 07
  screens/                un dossier par écran            → specs 07+
index.html
```

Le code Rust reste dans `src-tauri/`, le frontend dans `src/`. Un module Rust par
domaine plus tard (`db/`, `keychain/`, `ssh/`) ; à ce stade `lib.rs` n'expose rien.

### Décisions et justifications

**pnpm** — installations rapides, `node_modules` non dupliqué, lockfile strict.

**Biome plutôt qu'ESLint + Prettier** — un seul outil pour le lint et le format,
une seule configuration, exécution nettement plus rapide, et pas de conflit de
règles entre linter et formateur à arbitrer.

**TypeScript en mode strict** dès le premier fichier, `noUncheckedIndexedAccess`
inclus. Une base stricte coûte peu maintenant et beaucoup plus tard.

**Barre de titre superposée** (`titleBarStyle: "Overlay"`) — le chrome de fenêtre
du mockup (feux tricolores, ombre, coins arrondis) est la mise en scène du handoff,
pas l'app. On dessine notre barre de 40 px, macOS fournit ses vrais feux, et la
barre réserve la place à gauche pour ne pas les recouvrir.

**Fenêtre redimensionnable**, 1360 × 814 par défaut, minimum 960 × 600. Les
hauteurs de corps du handoff ne sont pas des contraintes : seules les hauteurs de
barres le sont (40 px en haut, 26 px en bas), le corps flexe. 1360 × 814 est
retenu comme taille par défaut parce que c'est la largeur à laquelle les maquettes
sont composées, donc la seule où la fidélité est directement comparable.

**Versions** — dernière stable de chaque dépendance au moment de l'initialisation,
figée par le lockfile. Aucune version n'est écrite en dur dans cette spec, qui
serait périmée dès le premier `pnpm update`.

### Contrainte inscrite dès le socle

Aucune commande Tauri exposée par le cœur Rust ne renvoie de collection non bornée.
Toute API qui transporte des lignes prend une fenêtre (`offset`, `limit`) et
renvoie le total séparément. La règle est posée ici pour qu'aucune spec ultérieure
n'ait à la découvrir ; elle est détaillée dans `06` et `10`.

### CI

Un seul job, sur `macos-latest` :

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck` et `pnpm lint`
3. `pnpm test` (Vitest)
4. `cargo fmt --check` et `cargo clippy -- -D warnings`
5. `pnpm tauri build`

Playwright n'est pas branché sur la CI dans cette spec : il n'y a encore aucun
écran à photographier. Il est installé et configuré, et entre en service en `07`,
qui produit les premières captures de référence.

## Terminé quand

- `pnpm tauri dev` ouvre une fenêtre native macOS, titrée « DoraBase »,
  redimensionnable, avec les feux tricolores du système visibles et non recouverts.
- `pnpm tauri build` produit un `.app` qui se lance depuis le Finder.
- L'icône de l'app dans le Dock et le Finder est celle du handoff, lisible à 32 px.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `cargo clippy` passent en local.
- La CI est verte sur une branche poussée.
- Aucune police, feuille de style ou script n'est chargé depuis le réseau.
