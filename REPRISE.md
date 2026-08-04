# Reprise de session

Ce document existe pour qu'une session neuve reprenne le travail sans avoir la
conversation précédente. Il complète les specs et les plans, qui disent *quoi* construire ;
lui dit **où on en est, ce qui a été décidé, et pourquoi**.

Dernière mise à jour : 4 août 2026, branche `feat/tranche-1-socle-design-a1`.

---

## 1. En trois phrases

DoraBase est un explorateur de bases de données desktop macOS, à construire depuis un
handoff de design haute fidélité (dix écrans maquettés en HTML, versionnés dans
`design/handoff/`). La stack est **Tauri 2 + React / TypeScript / Vite**, choisie pour que
les deux composants les plus coûteux — grille dense et éditeur de code — soient déjà
résolus par l'écosystème web, et parce que le handoff étant du HTML, la fidélité au pixel se
transpose au lieu de se réinventer. Le travail est découpé en ~20 specs courtes, exécutées
plan par plan.

## 2. Où lire quoi

| Fichier | Contenu |
| --- | --- |
| `AGENTS.md` | conventions du projet — langue de travail, taille des specs |
| `specs/README.md` | index des ~20 specs, contrainte IPC transverse, **acquis techniques**, **décisions à trancher** |
| `specs/01`, `02`, `07` | les trois specs écrites et validées |
| `plans/2026-07-31-*` | les plans d'implémentation, tâche par tâche, avec les **pièges vérifiés** |
| `design/handoff/` | le handoff, **source de vérité du design** |

**Le mockup fait foi contre la prose du handoff**, et contre les specs. Les écarts constatés
sont consignés dans la spec de l'écran concerné.

## 3. État d'avancement

**Plan `01` — socle : terminé, 8/8, CI verte.**

Un `.app` macOS de 9,5 Mo qui se lance. CSP prouvée efficace en release *et* en
développement. IPC sur son chemin rapide. Six permissions au lieu des 92 par défaut.
Toolchain Rust épinglée. CI en 1 min 31 avec cache.

**Plan `02` — design system : 10/11.** Reste la **tâche 11, vérification de fin** — un
sous-agent l'avait entamée, son résultat n'est pas parvenu. À refaire : contrôler chaque
critère de `specs/02-design-system.md` § « Terminé quand », le plus important étant
l'absence de littéraux de couleur hors `tokens.json` sur l'ensemble de `src/`
(`rg -nE "#[0-9A-Fa-f]{3,6}|rgba\(" src/ --glob '!src/design/tokens.*'`, chaque ligne à
justifier).

Livré : **128 tokens** générés, **3 polices** auto-hébergées (300 Ko), **48 icônes**
extraites du mockup, **6 primitives** (`Button`, `Field`, `Toggle`, `Badge`, `Chip`, `Dot`)
plus `cx`, une **galerie** de développement. **44 tests.**

**Plan `07` — écran A1 : pas commencé.** Prêt, 9 tâches, à jour de tout ce qui a été appris.

## 4. Décisions prises, et pourquoi

Celles qu'il ne faut pas rejouer, avec leur raison — sans quoi elles seront défaites.

**Stack Tauri 2 plutôt que Kotlin.** La demande initiale était « Kotlin, multiplateforme,
sans runtime Java ». Cette combinaison n'existe pas sous forme viable : Compose for Desktop
n'existe que sur JVM, et il n'y a pas de toolkit UI Kotlin/Native mature. Tauri résout la
grille et l'éditeur par l'écosystème web, et transpose le handoff HTML sans perte.

**Plancher macOS 13 Ventura, soit Safari 16.4.** Fixé pour que `oklch()` et
`color-mix(in oklab, …)` soient couverts. Cohérent avec `build.target`, `build.cssTarget`
et `bundle.macOS.minimumSystemVersion`. Les trois doivent rester alignés.

**Stockage des identifiants abstrait derrière une interface** (spec `05`), avec Trousseau
en release signée et fichier chiffré en développement. Les ACL du Trousseau sont liées à la
signature de code, et une signature ad-hoc change à chaque build. L'abstraction est de toute
façon nécessaire, Windows et Linux n'ayant pas de Trousseau.

**Quatre primitives retirées de la spec `02`** — popover, tooltip, contrôle segmenté,
stepper. Aucun écran ne les utilise avant `08`, `09`, `10` : les construire figerait leur API
sans le cas d'usage qui la contraint.

**Convention Rust à 4 espaces**, pas de `rustfmt.toml` alignant Rust sur le JS du projet.

**Baloo 2 restreinte au latin, Nunito et JetBrains Mono complètes.** Le critère n'est pas
« ce sous-ensemble sert-il » mais « cette police rend-elle des données arbitraires ». Baloo 2
ne porte que du chrome applicatif. Documenté dans `fonts.css`.

## 5. Ce qui attend une décision humaine

Consigné dans `specs/README.md` § « À trancher avant certaines specs » :

- **Signature de code** avant d'écrire la spec `05` — un Developer ID est requis pour
  diffuser de toute façon.
- **Variante d'icône simplifiée** sous 32 px : la carte du sac à dos devient un amas de
  pixels. Travail de design, dette assumée.
- **`blob:` non autorisé par la CSP** — touchera l'export CSV de la spec `10`.

## 6. Les six défauts trouvés, et par quelle méthode

À lire avant d'écrire du code : chacun était **invisible** et aucun n'a été trouvé par la CI
ni par des tests verts.

| Défaut | Trouvé par |
| --- | --- |
| `cssTarget` héritait de `target`, lightningcss réécrivait `oklch()` en `lab()` au build | trois builds comparés |
| Types `vite/client` absents : CSS Modules, woff2, `?raw` échouaient tous au typecheck | sondes de compilation |
| `@types/node` global cassait `useRef<number\|null>` et acceptait `process.env` côté navigateur | sonde `setTimeout` |
| CSP bloquait l'IPC de Tauri, qui retombait sur `postMessage` | instrumentation de la page |
| `Sprite` absent du DOM sous `StrictMode` — cassé en dev, correct en prod | un test que le sous-agent n'avait pas écrit |
| Toutes les primitives bordées 2 px trop courtes | mesure du **mockup lui-même** dans un navigateur |

**Les méthodes qui ont payé**, à réutiliser :

1. **Mesurer le mockup dans un navigateur**, pas lire ses styles. Le mockup est en
   `content-box` : un champ à `height:30px` avec 1 px de bordure y rend **32 px**. Comparer
   notre rendu à une valeur *déclarée* est le piège qui a produit le sixième défaut.
2. **Contrôle positif systématique.** « Zéro requête réseau » ne vaut rien sans preuve que la
   page tournait. Toute vérification négative doit être accompagnée d'un cas qui, lui, passe.
3. **Vérifier dans l'application réelle**, pas seulement en test unitaire — les tests ne
   rendent pas `main.tsx`, donc ne voient pas `StrictMode`.
4. **Test négatif sur chaque garde-fou.** Une exclusion Biome, un `tokens:check` : introduire
   délibérément la faute et constater l'échec.
5. **Un test qui documente un défaut le rend permanent.** Un sous-agent avait écrit
   « `Sprite` ne rend qu'une fois même monté deux fois » — ce test protégeait le bug.

## 7. Ce qui a marché dans l'orchestration

Le travail a été mené par sous-agents : un implémenteur par tâche, puis relecture.

**Ce qu'il faut refaire :**

- **Un seul implémenteur à la fois.** Deux en parallèle se sont télescopés sur `App.tsx`,
  que presque toute tâche doit toucher — ne serait-ce que pour monter un composant ou poser
  une sonde. Les relecteurs, eux, tournent en parallèle sans risque : lecture seule.
- **Poser des questions plutôt que dicter.** Trois erreurs de mes specs ont été trouvées par
  des implémenteurs qui ont refusé de deviner : un rayon nommé `radius-pill` pour une
  « pastille » de 4 px, trois déclinaisons sémantiques que le handoff ne fournit pas, une
  variante de bouton « fantôme » qui n'existe nulle part.
- **Exiger la sortie réelle du test rouge.** Elle ne se reconstitue pas après coup.
- **Faire relire l'appariement valeur↔rôle des tokens.** Plusieurs tokens partagent une même
  valeur (`ink` et `dark` valent tous deux `#23201C`) : aucune comparaison ensembliste ne
  peut y détecter une permutation, seule une lecture par rôle le peut.
- **Réclamer les comptes rendus.** Les sous-agents finissent souvent sans transmettre.

## 8. Conventions à ne pas casser

- **Français** pour la conversation, les specs et les commits. Code et identifiants en anglais.
- **Specs sous 150 lignes** (`AGENTS.md`). Les acquis d'implémentation vont dans les plans,
  pas dans les specs — c'est ce qui a fait déborder la spec `02` une fois.
- **`tokens.css` et `tokens.ts` sont générés**, jamais édités. Idem `sprite.svg` et
  `names.ts`. Garde-fous `tokens:check` et `icons:check` en CI.
- **`box-sizing: content-box`** sur tout élément dont la hauteur vient d'un token, et pas de
  bordure transparente « pour préserver la hauteur ». Voir le plan `02`.
- **Assertions par `getByRole` avec nom accessible.** Biome n'a aucune règle de nom
  accessible : ces tests sont le seul garde-fou du projet sur ce point.
- **Aucune ressource réseau.** La CSP le fait respecter structurellement.
- **`export PATH="$HOME/.cargo/bin:$PATH"`** devant toute commande cargo ou tauri : le shell
  des outils ne relit pas `~/.zshenv`.

## 9. Commandes

```bash
pnpm dev            # serveur Vite
pnpm tauri dev      # l'app (bloquant, ouvre une fenêtre)
pnpm tauri build    # .app et .dmg
pnpm test           # 44 tests
pnpm lint           # Biome
pnpm typecheck      # tsc -b, les deux programmes
pnpm tokens:build   # régénère tokens.css et tokens.ts
pnpm tokens:check   # garde-fou : échoue si édités à la main
pnpm icons:check    # idem pour le sprite
```

`?gallery` dans l'URL en développement affiche la galerie des primitives.

## 10. La suite

1. **Finir la tâche 11 du plan `02`** — vérification de fin, critère 3 en priorité.
2. **Exécuter le plan `07`** — écran A1. Ce sera la première fois que la fidélité au pixel
   sera jugeable côte à côte avec la maquette, et la première capture Playwright de
   référence. Attention : `maxDiffPixelRatio` est à 0 délibérément, et les références doivent
   être **générées en CI**, pas en local — le rendu des polices varie d'une machine à l'autre.
3. **Décider l'ordre ensuite** : remonter les fondations (`03` coquille, `04` menu latéral)
   ou dérisquer tôt l'accès aux données (`05` modèle, `06` PostgreSQL).
