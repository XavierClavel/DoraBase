# Reprise de session

Ce document existe pour qu'une session neuve reprenne le travail sans avoir la
conversation précédente. Il complète les specs et les plans, qui disent *quoi* construire ;
lui dit **où on en est, ce qui a été décidé, et pourquoi**.

Dernière mise à jour : 7 août 2026, branche `main`.

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
| `specs/01`–`04`, `05a`–`05c`, `06a`–`06e`, `07` | les treize specs écrites ; toutes implémentées sauf `06e` |
| `plans/2026-07-31-*`, `plans/2026-08-05-*` | les plans d'implémentation, tâche par tâche, avec les **pièges vérifiés** |
| `design/handoff/` | le handoff, **source de vérité du design** |

**Le mockup fait foi contre la prose du handoff**, et contre les specs. Les écarts constatés
sont consignés dans la spec de l'écran concerné.

## 3. État d'avancement

**Plan `01` — socle : terminé, 8/8, CI verte.**

Un `.app` macOS de 9,5 Mo qui se lance. CSP prouvée efficace en release *et* en
développement. IPC sur son chemin rapide. Six permissions au lieu des 92 par défaut.
Toolchain Rust épinglée. CI en 1 min 31 avec cache.

**Plan `02` — design system : terminé, 11/11.** Les six critères de
`specs/02-design-system.md` § « Terminé quand » sont vérifiés sur pièces.

Le critère central — aucun littéral de couleur hors `tokens.json` — est rempli : les seules
occurrences dans `src/` sont le symbole `logo` de `sprite.svg`, extrait *verbatim* du mockup
et volontairement hors du type `IconName` parce que c'est une illustration de marque à
couleurs fixes et non une icône thématisée par `currentColor`, et des commentaires de
traçabilité dans les CSS des primitives.

Livré : **128 tokens** (133 après le plan `07`), **3 polices** auto-hébergées (300 Ko),
**48 icônes** extraites du mockup, **6 primitives** (`Button`, `Field`, `Toggle`, `Badge`,
`Chip`, `Dot`) plus `cx`, une **galerie** de développement.

**Plan `07` — écran A1 : terminé, 9/9, CI verte.** L'écran d'accueil est fidèle au mockup —
comparaison pixel par pixel (fonds, bouton accent) identique octet pour octet, comparaison
visuelle complète sans écart. `⌘N` et les deux boutons partagent un callback, couvert par
Vitest. Redimensionnement propre à 960×600 (minimum) et 1600×900. Parcours clavier complet,
anneau de focus visible. Capture de référence Playwright commitée, générée en CI comme
prévu — voir § 6 pour comment.

**62 tests au total.** `src/design/reset.css` ajouté (remise à zéro minimale, `html`/`body`/
`#root` en hauteur 100 %) — absent avant le plan `07`, découvert manquant en générant la
première capture. `src/shell/{TitleBar,StatusBar}/` et `src/screens/Welcome/` livrés.

**Feux tricolores : vérifiés à l'œil par l'utilisateur le 6 août 2026.** Ils sont visibles
et non recouverts — le `padding-left: 78px` de la barre de titre fait bien son office. Ce
point est resté ouvert plusieurs sessions faute d'outil de capture pour une fenêtre native
dans cet environnement ; il est clos.

**Les boutons de `A1` sont inertes, et c'est voulu** — question posée le 6 août, réponse
dans `specs/07` § Hors périmètre : « le callback est vide : les boutons sont vrais,
focalisables, cliquables, et ne déclenchent rien ». `08` le remplira. Idem pour l'icône de
préférences (`15`), le rappel `⌘K` de la barre d'état (texte statique), et le compteur
« 0 projet », figé en dur tant que rien n'appelle `load_config`.

**Plans `03` et `04` — terminés, 15/15** (2026-08-05). La voie choisie était fondations
d'abord (`03`, `04`) plutôt que données d'abord. Le motif invoqué sur le moment — « `05` est
bloquée par la signature de code » — était **faux**, voir la correction du § 5. Le choix
restait défendable (les briques de `04` servent à cinq écrans), mais il n'était pas contraint.

Livré : **`SplitPane`** (panneaux redimensionnables, taille persistée et recadrée à la
lecture), **`TabStrip`** (onglets réordonnables et fermables), **cinq briques de sidebar**
(`SidebarFilterBar`, `TreeRow`, `ColumnRow`, `SidebarSectionTitle`, `ConsoleFooterButton`)
plus leur **`Sidebar`** d'assemblage, l'icône console optionnelle de la barre de titre, et
trois teintes d'encre (`--ink-6/7/8`). **112 tests unitaires**, **4 tests e2e**, 136 tokens.

Hors périmètre, délibérément : la pastille projet/environnement de la barre de titre
(dépend de `05`), la persistance de l'état des onglets entre sessions, la sidebar 252 px
propre à `A4` (composant différent, pas une variante), l'état de l'arbre et les données
réelles (attendent `10` et `05`), un `SplitPane` à orientation horizontale (attend `12`).

**Le fait marquant de ces deux plans : quatre défauts de mise en page, tous invisibles en
test unitaire.** `jsdom` ne calcule aucune mise en page — y mesurer un
`getBoundingClientRect()` renvoie zéro. Toute exigence de hauteur, largeur ou position est
donc structurellement hors de portée de Vitest, et a besoin de Playwright :
`e2e/layout-primitives.spec.ts` existe pour ça. Détail dans les deux plans.

**Points en suspens, à trancher avant les prochains plans** :
- **Ordre des primitives différées.** `08` (modale, popover/tooltip), `09` (menu latéral,
  contrôle segmenté), `10` (visualiseur, stepper) attendent encore leurs primitives.
- **`Chip` interactif reste une dette** — `div[role=button]` avec gestion clavier manuelle
  plutôt que deux boutons frères natifs. Voir § 9.

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

- **Variante d'icône simplifiée** sous 32 px : la carte du sac à dos devient un amas de
  pixels. Travail de design, dette assumée.
- **`blob:` non autorisé par la CSP** — touchera l'export CSV de la spec `10`.
- **Un Developer ID reste requis pour *diffuser*** (Gatekeeper, notarisation). C'est une
  décision d'achat, à prendre avant la première distribution — **pas avant d'écrire du
  code**.

**Correction, 5 août 2026.** Ce paragraphe listait auparavant « signature de code avant
d'écrire la spec `05` » comme décision bloquante. C'était **faux**, et contredisait
`specs/README.md`, qui porte la décision réelle : le stockage des identifiants est
**abstrait derrière une interface**, précisément pour découpler `05` de l'achat d'un
Developer ID — « cette échéance n'a pas à bloquer le développement ». L'erreur a coûté une
décision d'ordonnancement : `03`/`04` ont été préférés à `05`/`06` sur la foi d'un blocage
inexistant. Le choix restait défendable pour d'autres raisons, mais il n'était pas
contraint. Leçon : **deux documents qui se recouvrent divergent** — quand `REPRISE.md`
résume `specs/README.md`, c'est le second qui fait foi, et un résumé qui transforme
« tranché » en « à trancher » est pire que pas de résumé.

## 6. Les défauts trouvés, et par quelle méthode

À lire avant d'écrire du code : chacun était **invisible**, aucun trouvé par la CI ni par
des tests verts au moment où il a été introduit.

| Défaut | Trouvé par |
| --- | --- |
| `cssTarget` héritait de `target`, lightningcss réécrivait `oklch()` en `lab()` au build | trois builds comparés |
| Types `vite/client` absents : CSS Modules, woff2, `?raw` échouaient tous au typecheck | sondes de compilation |
| `@types/node` global cassait `useRef<number\|null>` et acceptait `process.env` côté navigateur | sonde `setTimeout` |
| CSP bloquait l'IPC de Tauri, qui retombait sur `postMessage` | instrumentation de la page |
| `Sprite` absent du DOM sous `StrictMode` — cassé en dev, correct en prod | un test que le sous-agent n'avait pas écrit |
| Toutes les primitives bordées 2 px trop courtes | mesure du **mockup lui-même** dans un navigateur |
| `html`/`body` sans hauteur : la fenêtre entière ne faisait que 372 px sur 814 | histogramme de couleurs de la première capture — 57 % de blanc pur, alors qu'aucun token de surface n'est blanc |
| Vitest ramassait `e2e/*.spec.ts` par son glob par défaut, `pnpm test` sortait en 1 **en silence** | lecture attentive du résumé : « Tests 62 passed » ne compte pas une suite qui échoue au chargement |
| `playwright-report/` vide après un échec en CI : le rapporteur `list` seul n'écrit rien sur disque | l'artefact de CI remonté vide aurait fait perdre la capture de référence |
| `localStorage` **undefined** sous Vitest : Node 26 expose un global expérimental, inactif sans `--localstorage-file`, dont l'accesseur masque celui de jsdom | le premier test qui y touche, puis sondes de descripteurs — `sessionStorage` de jsdom marche, `localStorage` non |
| L'écriture dans `localStorage` n'était couverte par aucun test, alors que trois d'entre eux « testaient la persistance » | contrôle négatif : `setItem` supprimé, suite toujours verte |
| La racine de `SplitPane` prenait la hauteur de son contenu — 15 px dans une boîte de 180 — cassant la disposition même de `A4` | mise en scène dans la galerie, puis mesure de la chaîne de parents |
| Onglet actif 5 px trop large, et fond `--paper-bright` au lieu de `--paper` | mesure du mockup **et** de notre rendu, comparés chiffre par chiffre |
| `width: 100%` en `content-box` s'ajoute au padding : les lignes de sidebar sortaient à 234 px dans un corps de 212, leur métadonnée rognée (« int8 » rendu « in ») | mesure de la ligne contre son conteneur |
| Les données de démonstration de la galerie mélangeaient `A4` dans une disposition `A5` | captures du mockup et de notre rendu **côte à côte** |

**Les méthodes qui ont payé**, à réutiliser :

1. **Mesurer le mockup dans un navigateur**, pas lire ses styles. Le mockup est en
   `content-box` : un champ à `height:30px` avec 1 px de bordure y rend **32 px**. Comparer
   notre rendu à une valeur *déclarée* plutôt que *rendue* a produit deux défauts distincts.
2. **Contrôle positif systématique.** « Zéro requête réseau » ne vaut rien sans preuve que la
   page tournait. Toute vérification négative doit être accompagnée d'un cas qui, lui, passe.
3. **Vérifier dans l'application réelle**, pas seulement en test unitaire — les tests ne
   rendent pas `main.tsx`, donc ne voient pas `StrictMode`.
4. **Test négatif sur chaque garde-fou.** Une exclusion Biome, un `tokens:check` : introduire
   délibérément la faute et constater l'échec.
5. **Un test qui documente un défaut le rend permanent.** Un sous-agent avait écrit
   « `Sprite` ne rend qu'une fois même monté deux fois » — ce test protégeait le bug.
6. **Un histogramme de couleurs vaut un coup d'œil, quand on n'a pas d'écran.** Sans capture
   visuelle possible dans cet environnement, comparer la distribution des couleurs d'un
   rendu à celle attendue (aucune couleur de la palette n'est blanc pur) a suffi à détecter
   un écran qui ne remplissait pas sa fenêtre.
7. **`toHaveTextContent` normalise l'espace insécable du DOM réel, pas la chaîne attendue.**
   Un test conçu pour détecter la perte d'un ` ` doit comparer `.textContent` par
   `.toBe()` — le matcher normalisé masquerait justement la régression qu'il devait révéler.
8quinquies. **Un script de vérification qu'on ne peut pas lancer soi-même n'est pas un
   garde-fou.** Le premier garde-fou de `default-run` était du Python embarqué dans le YAML
   du workflow : son échappement de guillemets produisait un `SyntaxError` impossible à
   reproduire en local, donc la CI a échoué sur le garde-fou lui-même. Sorti dans
   `scripts/verifier-default-run.py`, il se lance à la main — et son contrôle négatif aussi.

8quater. **« Ça compile » et « ça démarre » sont deux choses, et la CI ne couvrait que la
   première.** L'ajout d'un second binaire a rendu `cargo run` ambigu, donc cassé
   `tauri dev` — l'app ne démarrait plus du tout, alors que `cargo build`, `cargo test`,
   `clippy` et `pnpm tauri build` étaient tous verts. `tauri build` ne passe pas par
   `cargo run`. Signalé par l'utilisateur, pas par nous. Depuis, un garde-fou vérifie la
   propriété par `cargo metadata` — pas en lançant `cargo run`, l'app ouvrant une fenêtre
   qui bloquerait le runner.

8bis. **« ÉCHEC à l'étape X » ne dit pas que X a échoué pour la raison qu'on croit.** Le job
   Linux a signalé un échec sur `cargo test --features db-tests` : en réalité la crate ne
   **compilait pas**, `tauri` exigeant la pile GTK/WebKit absente du runner. La commande
   citée était la bonne, la cause était deux étapes en amont *dans* cette commande. Lire
   `gh run view --log-failed`, pas seulement le nom de l'étape.
8ter. **Tout échec de CI n'est pas un défaut du code.** `Set up job` rendant
   « Service Unavailable / Failed to resolve action download info » est une panne de
   GitHub Actions : la réponse est de relancer, pas de corriger. Vérifier *quelle* étape
   échoue avant de chercher un coupable dans le dépôt — la même journée a vu huit échecs
   de sous-agents en erreur 529, tous côté service.

8. **La CI n'a pas fini de mentir tant que le job entier n'est pas vert.** Un `X` sur une
   étape peut avoir sa vraie cause sur une étape *antérieure* dont le résumé masque
   l'échec (voir Vitest/e2e ci-dessus) — toujours vérifier l'étape qui échoue en premier,
   pas la dernière affichée.
9. **jsdom ne calcule aucune mise en page.** Hauteur, largeur, position : `getBoundingClientRect()`
   y renvoie zéro. Ces exigences sont **structurellement hors de portée de Vitest** et ont
   besoin de Playwright — `e2e/layout-primitives.spec.ts` existe pour ça, et chacune de ses
   assertions a été validée par sabotage. Quatre défauts de mise en page sont passés sous
   une suite unitaire verte avant qu'on s'en dote.
10. **Le contrôle négatif se fait par sabotage, pas par relecture.** Trois tests qui
   « testent la persistance » peuvent ne tester que la lecture : c'est en retirant la ligne
   soupçonnée du composant, et en constatant que la suite reste verte, qu'on l'apprend.
   Généralisation de la méthode 4, appliquée systématiquement dans les plans `03` et `04`.
11. **Comparer deux captures côte à côte attrape ce qu'aucune mesure ne cherche.** Couleurs,
   graisses et paliers pouvaient tous être justes tandis que les *données* de démonstration
   venaient du mauvais écran. Une mesure vérifie une hypothèse ; un inventaire visuel en
   révèle l'absence.
12. **`box-sizing: border-box` n'est pas une entorse à la convention `content-box`.** Celle-ci
   vaut pour les **hauteurs** issues d'un token. Un élément dont la **largeur** est à 100 %
   avec du padding a besoin de `border-box`, sinon les deux s'additionnent.
13. **Un test qui vérifie le résultat visible ne prouve pas que le chemin est bon.** En
   `06d`, saboter la pagination — `limit 1000000000` côté SQL, découpe en Rust — laissait
   *vert* le test « la fenêtre rend exactement 500 lignes ». Ramener cent mille lignes puis
   n'en garder que cinq cents satisfait la lettre de l'exigence. Seul le test qui compare le
   **coût** entre une table de mille lignes et une de cent mille a mordu. Quand la contrainte
   porte sur le chemin et non sur la sortie, il faut mesurer le chemin.
14. **Un garde-fou écrit contre une famille de fichiers ne couvre pas celle qu'elle
   engendre.** `verifier-aucun-sabotage.sh`, écrit précisément pour attraper le champ
   `sabotage` committé par accident, exigeait un préfixe Rust (`pub `, `let `…) et a donc
   laissé passer `{ sabotage: boolean, … }` dans `src/domain/engine.ts` — le même champ,
   projeté en TypeScript par `export-types`. C'est `domain:check` qui l'a fini par le voir,
   un cran plus tard. Le motif accepte désormais les deux formes.
15. **Un message d'erreur peut faire passer un test pour la mauvaise raison.** Le test
   « une colonne inconnue est refusée » assertait que le message contient le nom fautif.
   PostgreSQL renvoie `column "colonne_inventee" does not exist` — donc laisser passer le
   nom échappé jusqu'au serveur satisfaisait le test, alors que le but était de refuser
   **avant l'envoi**. Corrigé en assertant aussi `code == None` : une erreur locale n'a pas
   de `SQLSTATE`, un refus serveur porte `42703`. Trouvé par sabotage.
16. **Un enchaînement de vérifications à la main peut mentir.** `set -e` puis
   `cargo clippy … | tail -3` : le statut de sortie d'un pipeline est celui de sa **dernière**
   commande, donc `tail` réussit toujours. « TOUT VERT » s'est affiché avec trois
   vérifications rouges. D'où `scripts/verifier-tout.sh`, qui ne tronque rien, enregistre
   chaque échec et les rappelle à la fin. À utiliser au lieu de rechaîner.
17. **« Ça s'ouvre » ne prouve pas « ça sert ».** Même leçon que le point 13, retrouvée en
   `06e` sur un autre terrain : l'image `linuxserver/openssh-server` livre
   `AllowTcpForwarding no`. La session SSH s'ouvrait, s'authentifiait, annonçait son port
   local — et chaque connexion acheminée était coupée. Le test « un tunnel s'ouvre » était
   vert pendant que la redirection était morte. Ce qui l'a trouvé : un test qui envoie une
   vraie requête SSL PostgreSQL dans le tunnel et attend la réponse du serveur.
18. **`JoinHandle::abort` n'est pas synchrone.** Il *planifie* l'annulation ; au retour, la
   tâche tient encore ses ressources. Un `Drop` qui se contentait d'`abort` laissait donc le
   port local pris, et le test qui le redemandait aussitôt échouait sur « Address already in
   use ». D'où `SshTunnel::fermer`, qui attend le handle après l'avoir abandonné — `Drop`
   n'étant plus qu'un filet, ce que sa documentation dit explicitement.
19. **Un test qui recopie la logique du sujet ne le teste pas.** Écrit puis corrigé dans la
   même heure en `06e` : la lecture d'`etat()` était reconstituée dans une fonction d'appoint
   du module de test, faute de pouvoir construire un `SshTunnel` sans bastion. C'est le même
   défaut que sur l'atomicité de `05b` (point 5). Corrigé en extrayant `Surveillance`, un
   type que le tunnel **et** le test appellent.
20. **Un test qui se saute tout seul rend un succès.** Les tests de tunnel s'abstiennent
   quand le décor SSH manque — nécessaire pour le job macOS, mais un bastion qui échoue à
   démarrer les rendrait invisibles sans casser la CI. Une étape dédiée du job Linux relit la
   sortie et refuse la présence de « décor SSH absent ». Le saut est aussi **annoncé** sur
   `stderr` plutôt que muet.

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

## 9. Deux « manques » qui n'en sont pas, et une vraie dette

**Seul `Button` en variante secondaire a un style de survol.** `Button` accent et encre,
`Field`, `Toggle` et `Chip` n'en ont aucun, et la galerie l'affiche franchement — « aucun
style de survol défini ».

**Ne le « corrigez » pas.** Le handoff ne définit un survol que pour deux choses : les lignes
d'arbre et de tableau (`rgba(35,32,28,.05)`, déjà tokenisé en `--hover-row` pour les specs
`04` et `10`) et le bouton secondaire. Inventer un survol pour les autres serait exactement
l'erreur que ce projet évite depuis le début : une valeur qui n'est ni dans les tables ni
dans le mockup.

**`⌘N` a un raccourci affiché à opacité `.6`, le mockup en montre `.5`/`.6`/`.7` selon
l'instance.** Décision déjà prise et documentée dans `Button.module.css` : une valeur
représentative plutôt que trois props. Pareil pour l'encre du texte secondaire de `Button`
(`--ink-2`, alors que le mockup varie `.55`–`.7`).

**`Chip` interactif reste une vraie dette**, consignée dans le plan `02` § « Réserve sur le
Chip interactif ». Racine `div[role=button] tabIndex={0}` avec gestion clavier manuelle,
parce que sa croix de suppression est un vrai `<button>` et qu'un bouton dans un bouton est
interdit en HTML. Deux boutons frères seraient plus fidèles au handoff (qui semble rendre
l'opérateur cliquable, pas tout le chip) *et* natifs au clavier. À trancher contre un écran
réel avant de construire `08` ou `09`, pas par spéculation.

## 10. Deux pièges d'environnement, propres à cette machine

**`cargo` n'est pas dans le `PATH`** des commandes shell de cet outillage — `~/.zshenv`
source `~/.cargo/env`, mais ce shell ne le relit pas. Préfixer *chaque* commande cargo ou
`pnpm tauri` par `export PATH="$HOME/.cargo/bin:$PATH"`.

**Pas de capture d'écran de fenêtre native.** Playwright pilote Chromium, donc `pnpm dev`
est entièrement vérifiable (mesures, captures, pixels). `pnpm tauri dev` compile et
s'exécute, vérifiable par ses logs et par requête HTTP/DOM via Playwright pointé sur
`localhost:5173`, mais **la fenêtre native elle-même ne peut pas être vue**. Un histogramme
de couleurs sur une capture Chromium (§ 6, méthode 6) est le substitut qui a fonctionné.

## 11. Commandes

**Avant tout commit — la barrière, une seule commande :**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export DORABASE_TEST_PG="postgres://dorabase:dorabase-test@localhost:55432/dorabase_test"
./scripts/verifier-tout.sh
```

Elle lance ce que lance la CI et **échoue vraiment** (voir § 6, point 16). Sans
`DORABASE_TEST_PG`, les tests sur base réelle sont sautés — et le dit à l'écran plutôt que
de les taire. Le conteneur local se démarre par :

```bash
docker run -d --name dorabase-test-pg -e POSTGRES_PASSWORD=dorabase-test \
  -e POSTGRES_USER=dorabase -e POSTGRES_DB=dorabase_test -p 55432:5432 postgres:17
docker exec -i dorabase-test-pg psql -U dorabase -d dorabase_test < scripts/schema-test-pg.sql
```

**Le reste, au cas par cas :**

```bash
pnpm dev            # serveur Vite
pnpm tauri dev      # l'app (bloquant, ouvre une fenêtre) — export PATH d'abord
pnpm tauri build    # .app et .dmg — export PATH d'abord
pnpm test           # 112 tests Vitest
pnpm test:e2e       # Playwright — 4 tests, webServer auto
pnpm lint           # Biome
pnpm typecheck      # tsc -b, les deux programmes
pnpm tokens:check   # garde-fou : échoue si tokens.css/ts édités à la main
pnpm icons:check    # idem pour le sprite
pnpm domain:check   # idem pour les projections ts-rs (exige un arbre git propre)
```

Pour les tests de tunnel (`06e`), un bastion en plus :

```bash
./scripts/bastion-test.sh demarrer /tmp/bastion
. /tmp/bastion/bastion.env
./scripts/bastion-test.sh arreter   # quand c'est fini
```

Sans lui, les tests SSH se **sautent** en l'annonçant sur `stderr` ; la CI a une étape dédiée
qui refuse ce silence.

```bash
cd src-tauri && cargo test --features db-tests   # 183 tests, dont 41 sur base et bastion
```

`?gallery` dans l'URL en développement affiche la galerie des primitives.

## 12. La suite

**Fait au 7 août 2026 : `05a`, `05b`, `05c`, `06a`, `06b`, `06c`, `06d`, `06e`.** La série
`06` est complète : plus aucune spec écrite n'attend son implémentation.

Ce que ça représente concrètement : le modèle de configuration existe en Rust et est projeté
en TypeScript par `ts-rs`, sa persistance sur disque est atomique et non destructive (fichier
corrompu mis en quarantaine, écriture bloquée), les identifiants ont leur magasin, et la
couche moteur sait **ouvrir une connexion PostgreSQL, introspecter un schéma, lire une
fenêtre de lignes, et faire passer tout cela par un tunnel SSH**.

**183 tests Rust** dont **41 contre un vrai PostgreSQL 17.6 et un vrai bastion SSH**,
112 Vitest, 4 Playwright.

Le test qui donne sa valeur à `06e` : la base visée est le **nom du conteneur PostgreSQL sur
un réseau Docker**, que la machine hôte ne résout pas. Un contrôle positif vérifie d'abord
qu'elle est bien injoignable en direct — sans quoi le test passerait sans rien prouver du
tunnel. Décor monté par `scripts/bastion-test.sh`, le même en local et en CI.

**La politique de clé d'hôte est tranchée et implémentée** : vérification contre
`~/.ssh/known_hosts`, hôte inconnu refusé, avec un message qui donne la manœuvre. Quatre
verdicts distincts là où `russh` n'en offre que deux — « hôte inconnu », « clé changée »,
« algorithme absent » et « clé refusée par le bastion » ne se confondent pas. Reste que
**l'écran de confiance à la première connexion serait la vraie réponse**, et que le design ne
l'a pas maquetté : à remonter avant distribution.

La contrainte IPC transverse est désormais portée par un **type** : `RowLimit` est une
énumération fermée (100/500/1000/5000), donc « demander tout » n'est pas exprimable.

**Deux réserves à ne pas oublier :**
- **Le TLS n'est pas branché** en `06b` : `NoTls`, donc `Require`, `VerifyCa` et
  `VerifyFull` ne vérifient rien. Dit dans le module. Demande de trancher entre `rustls` et
  `native-tls` — ce dernier reconnaît les autorités internes déjà installées, argument
  sérieux en entreprise.
- **Le backend Trousseau de `05c` reste non vérifié** (pas de Developer ID).

**Infrastructure de test acquise** : un second job de CI sur `ubuntu-latest` avec un service
`postgres:17`, parce que les *service containers* n'existent pas sur les runners macOS. Les
tests concernés sont derrière la feature `db-tests` et non `#[ignore]` — sans la feature ils
n'existent pas, ce qui garde le compte d'ignorés réservé au Trousseau. En local, conteneur
dédié `dorabase-test-pg` sur le port **55432**, choisi pour ne croiser aucun autre projet de
la machine.

**Le pont JavaScript → Rust n'est pas encore exercé** : Playwright ne pilote pas WKWebView
et aucun plugin de log JS n'est installé, donc `invoke()` depuis le front n'a jamais été
appelé. L'enregistrement des commandes est garanti par la compilation ; le pont le sera par
`08`. Ne pas le présenter comme vérifié d'ici là.

**La suite : `08` (modale de connexion).** Premier écran qui crée vraiment une entité, et
premier qui exercera le pont IPC de bout en bout. C'est aussi lui qui devra afficher le port
local du tunnel (`A2` : « auto (63342) »), que `PostgresAdapter::port_local_tunnel` rend déjà.

À trancher au passage, le moment venu :

- **Ordre des primitives différées** (§ 3), au moment d'écrire la spec qui les réclame en
  premier — popover/tooltip pour `08` ou `10`, contrôle segmenté pour `09`, stepper pour `10`.
- **26 px dans l'échelle de `Button`** au moment d'écrire `15` : la hauteur revient onze
  fois dans le mockup, `ConsoleFooterButton` la porte aujourd'hui en dur.
- **`SplitPane` horizontal** pour `12` (console SQL) : géométrie de poignée différente
  (pastille 26×3 au lieu de 3×26).
- **Dette du `Chip` interactif** (§ 9) et **sidebar 252 px de `A4`**, contre l'écran réel
  qui les réclame (`08` ou `09`), pas par spéculation.
