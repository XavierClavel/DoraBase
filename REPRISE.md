# Reprise de session

Ce document existe pour qu'une session neuve reprenne le travail sans avoir la conversation
précédente. Il complète les specs et les plans, qui disent *quoi* construire ; lui dit **où on
en est, ce qui a été décidé, et pourquoi**.

Dernière mise à jour : 10 août 2026. Le travail vit sur `quiver-leader`, en avance de treize
commits sur `main` : les six specs de `A5` (`10a`–`10f`), la création de projet (`08f`), et sept
correctifs venus du **premier usage réel** de l'application.

---

## 0. À faire en premier — quatre vérifications à l'œil

**Elles s'accumulent depuis `08c` et rien ne peut les automatiser** : Playwright ne pilote pas
WKWebView, et piloter le bureau par frappes synthétiques a été tenté puis abandonné — la fenêtre
ne passait pas au premier plan, donc les frappes risquaient d'atterrir dans les applications de
l'utilisateur. **Demander, ne pas forcer.**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
pnpm tauri dev
```

| # | Ce qu'il faut faire | Ce qu'il faut observer | Spec |
| --- | --- | --- | --- |
| 1 | ~~Tester la connexion~~ | **Fait le 10 août** : le pont répond, la connexion aboutit | `08d` |
| 2 | Déplier « Proxy / tunnel », cliquer « Parcourir… » | Le sélecteur de fichier natif de macOS s'ouvre, et le chemin choisi arrive dans le champ | `08c` |
| 3 | ~~Enregistrer une base, quitter, relancer~~ | **Fait le 10 août** : le projet et sa base survivent au redémarrage | `09b` |
| 4 | Cliquer la pastille projet de la barre de titre | Elle s'active et **ne déplace pas la fenêtre**. À revérifier : le glissement est passé en `deep`, donc tout le sous-arbre est glissable sauf les contrôles | `09c` |
| 5 | Ouvrir une table, sélectionner une ligne, cliquer « Copier la ligne en INSERT », coller ailleurs | Le SQL arrive dans le presse-papiers — `navigator.clipboard` n'est pas exercé par les tests | `10f` |

**Deux vérifications restent, et l'usage réel en a appris plus qu'elles** : neuf défauts en deux
jours, dont six signalés par l'utilisateur (voir `DEFAUTS.md` § « Ce qu'a trouvé le premier
usage réel »). La leçon est au § 5, règle 9.

Tant que ce n'est pas fait, **ne présenter aucun de ces quatre points comme vérifié**. Les
commandes sont enregistrées et compilées ; l'aller-retour ne l'est pas.

## 1. En trois phrases

DoraBase est un explorateur de bases de données desktop macOS, construit depuis un handoff de
design haute fidélité (dix écrans maquettés en HTML, versionnés dans `design/handoff/`). La
stack est **Tauri 2 + React / TypeScript / Vite**, choisie pour que les deux composants les plus
coûteux — grille dense et éditeur de code — soient déjà résolus par l'écosystème web, et parce
que le handoff étant du HTML, la fidélité au pixel se transpose au lieu de se réinventer. Le
travail est découpé en specs courtes, exécutées plan par plan.

## 2. Où lire quoi

| Fichier | Contenu |
| --- | --- |
| `AGENTS.md` | conventions du projet — langue de travail, taille des specs |
| `specs/README.md` | index des specs, contrainte IPC transverse, **acquis techniques**, **décisions à trancher** |
| `DEFAUTS.md` | les 58 défauts rencontrés, **avec ce qui les a attrapés** |
| `design/handoff/` | le handoff, **source de vérité du design** |

**Le mockup fait foi contre la prose du handoff**, et contre les specs. Les écarts constatés sont
consignés dans la spec de l'écran concerné.

**`specs/README.md` fait foi contre ce document.** Un résumé qui transforme « tranché » en
« à trancher » est pire que pas de résumé — c'est arrivé une fois, et cela a coûté une décision
d'ordonnancement prise sur la foi d'un blocage inexistant.

## 3. Où en est le travail

**Trente-deux specs écrites, toutes implémentées.** `A1` (accueil), `A2`/`A3` (nouvelle connexion et
son échec), `A4` (explorateur) et `A5` (visualiseur de table) sont assemblés **et atteignables
depuis l'application**. La couche moteur PostgreSQL est complète, du contrat au tunnel SSH.
Restent cinq specs d'écran à écrire (`11`–`15`) et six specs de moteur (`16`–`21`).

| Specs | Sujet | État |
| --- | --- | --- |
| `01`–`04` | socle Tauri, design system, coquille, menu latéral | **fait** |
| `05a`–`05c` | modèle de configuration, persistance, identifiants | **fait** (Trousseau : voir plus bas) |
| `06a`–`06e` | contrat moteur, connexion, introspection, lecture paginée, tunnel SSH | **fait** (TLS à brancher) |
| `07` | `A1` — accueil | **fait** |
| `08a`–`08e` | primitives de formulaire, `A2`, panneau tunnel, test de connexion + `A3`, enregistrement | **fait** |
| `09a`–`09f` | primitives de tableau, câblage des données, `A4` en quatre blocs | **fait** |
| `08f` | créer un projet — `create_project`, « + Nouveau projet… » | **fait** |
| `08g` | modifier une connexion — `update_variant`, menu de la pastille projet | **fait** |
| `10a`–`10f` | primitives de grille, coquille de travail, grille, filtres et tri, toolbar, panneau de ligne | **fait** |
| `11`–`15` | `A6` → `A10` | à écrire |
| `16`–`21` | moteurs additionnels (MySQL, SQLite, MongoDB, Redis, Snowflake, BigQuery) | à écrire |

**Comptes de tests** — 226 Rust (dont ceux sur PostgreSQL 17.6 réel et un vrai bastion SSH),
479 Vitest, 103 Playwright.

**La boucle du produit est complète depuis `09b`** : saisir (`08e`), persister, relire, afficher.
`load_config` existait depuis `05b` et n'était appelée par personne.

**La bande d'onglets est vivante depuis `10b`** : ouvrir une table depuis l'arbre ou depuis
« Ouvrir les données » du panneau de détail, changer d'onglet, fermer, réordonner. Fermer le
dernier laisse l'écran debout, sur la liste des objets.

**Ce qui n'est pas fait dans `A5`** : l'export CSV (bouton présent, désactivé, infobulle qui
nomme sa spec), le bloc « Valeurs fréquentes » du popover d'opérateur, l'aperçu formaté
« 280,00 € », et la pastille colorée de `status`. Les quatre sont consignés au § 6 avec leur
raison — aucun n'est un oubli.

**Deux réserves à ne pas oublier :**

- **Le TLS n'est pas branché** en `06b` : `NoTls`, donc `Require`, `VerifyCa` et `VerifyFull` ne
  vérifient rien. `08d` l'affiche — « · TLS non vérifié » — et cette mention laide doit rester
  jusqu'au branchement. Demande de trancher entre `rustls` et `native-tls` ; ce dernier reconnaît
  les autorités internes déjà installées, argument sérieux en entreprise.
- **Le Trousseau de `05c` fonctionne, mais sa persistance entre builds n'est pas vérifiée.**
  Correction du 8 août 2026 : ce document a longtemps dit « n'a jamais tourné », ce qui était
  faux. Les trois tests `#[ignore]` passent contre le vrai Trousseau de macOS, avec la signature
  ad-hoc (`flags=0x20002(adhoc,linker-signed)`) :

  ```bash
  cd src-tauri && cargo test --features db-tests keychain -- --ignored
  ```

  Ce qu'ils prouvent : l'API marche — aller-retour, référence inconnue, suppression. Ce qu'ils
  **ne prouvent pas**, et qui est la crainte réelle de `05c` : qu'une entrée écrite par un build
  soit relisible par le **suivant**. Les trois tests écrivent et relisent dans le même processus,
  donc sous la même signature. Une signature ad-hoc changeant à chaque reconstruction, c'est
  précisément là que le doute porte.

  **L'expérience qui trancherait** : écrire un secret, forcer une reconstruction (toucher un
  fichier source), relire avec le nouveau binaire. Elle demande de scinder l'aller-retour en deux
  tests — un qui écrit, un qui relit — ce qu'aucun n'est aujourd'hui.

## 4. Décisions prises, et pourquoi

Celles qu'il ne faut pas rejouer, avec leur raison — sans quoi elles seront défaites.

**Stack Tauri 2 plutôt que Kotlin.** La demande initiale était « Kotlin, multiplateforme, sans
runtime Java ». Cette combinaison n'existe pas sous forme viable : Compose for Desktop n'existe
que sur JVM, et il n'y a pas de toolkit UI Kotlin/Native mature.

**Plancher macOS 13 Ventura, soit Safari 16.4.** Pour que `oklch()` et
`color-mix(in oklab, …)` soient couverts. `build.target`, `build.cssTarget` et
`bundle.macOS.minimumSystemVersion` doivent rester alignés.

**Stockage des identifiants abstrait derrière une interface** (`05c`) : Trousseau en release
signée, fichier chiffré en développement. Les ACL du Trousseau sont liées à la signature de code,
et une signature ad-hoc change à chaque build. L'abstraction est de toute façon nécessaire,
Windows et Linux n'ayant pas de Trousseau. **Cette échéance ne bloque pas le développement.**

**La contrainte IPC transverse est portée par un type.** `RowLimit` est une énumération fermée
(100 / 500 / 1000 / 5000) : « demander tout » n'est pas exprimable. Et aucune commande ne rend
« tout le catalogue » — les schémas d'une base, les objets d'**un** schéma, le détail d'**une**
table.

**L'arbre se lit sans réseau** (`09b`, décidé le 7 août). La configuration ne demande aucune
connexion : l'arbre s'affiche immédiatement et chaque base porte son état. Une base injoignable
reste **visible et marquée**, pas masquée ni bloquante — attendre les connexions bloquerait
l'écran jusqu'à 30 secondes sur un seul hôte muet. Conséquence : les états sont **quatre**, pas
deux, et « jamais tentée » n'est pas « hors ligne ».

**Clé d'hôte SSH vérifiée contre `~/.ssh/known_hosts`**, hôte inconnu refusé avec un message qui
donne la manœuvre (`06e`). Quatre verdicts distincts là où `russh` n'en offre que deux. **L'écran
de confiance à la première connexion serait la vraie réponse**, et le design ne l'a pas maquetté.

**Une seule identité pour une connexion** : `projet/base/environnement`. C'est à la fois la clé
du registre (`09b`) et la référence du secret (`08e`). Deux conventions divergeraient.

**Le panneau droit de l'écran de travail est unique** (`10f`), et son contenu suit l'écran :
détail de l'objet en `A4`, ligne sélectionnée en `A5`. Le mockup n'en montre qu'un. La barre
d'état, elle, court **sous** les trois colonnes — elle vit au niveau de l'écran, pas du centre.

**La sidebar est à 212 px partout** (`10b`), y compris devant `A4` dont le handoff donne 252 :
une coquille unique ne peut pas être les deux, et la colonne sauterait de quarante pixels à
l'ouverture d'un onglet. Elle prend en outre la largeur de son `SplitPane`, sans quoi la poignée
de `03` ne déplacerait rien.

**Un filtre et un tri partent au serveur** (`10d`), ils ne trient pas la fenêtre reçue. Filtrer
cinq cents lignes déjà lues serait immédiat et faux : l'utilisateur croirait voir toutes les
commandes payées de la table. Les tests portent donc sur la **requête envoyée**.

**Un projet se crée depuis `A2`, en deux commandes et un geste** (`08f`). Le `Select` porte
« + Nouveau projet… », qui révèle un champ de nom ; l'écran enchaîne `create_project` puis
`save_database`. Si la seconde échoue, le projet reste — le défaire supprimerait un projet à la
suite d'un échec de connexion, et détruirait un homonyme en cas de course. Son environnement actif
vient de la variante déclarée, sinon l'arbre serait vide juste après l'enregistrement.

**`esc` dans un champ rend le focus, il ne ferme pas la modale.** Une frappe destinée à sortir d'un
champ jetait tout le formulaire. Un second `esc` ferme ; depuis un bouton, la fermeture est
immédiate — il n'y a pas de saisie à abandonner.

**Aucune correction automatique dans les champs.** macOS transformait `localhost` en `Localhost`, et
la connexion échouait pour une majuscule que personne n'avait tapée. Les quatre attributs vivent
dans `Field` et sont réemployés par les saisies qui n'y passent pas.

**Convention Rust à 4 espaces**, pas de `rustfmt.toml` alignant Rust sur le JS du projet.

**Baloo 2 restreinte au latin, Nunito et JetBrains Mono complètes.** Le critère n'est pas « ce
sous-ensemble sert-il » mais « cette police rend-elle des données arbitraires ». Baloo 2 ne porte
que du chrome applicatif.

## 5. Huit règles tirées des défauts rencontrés

Le détail de chacun est dans [`DEFAUTS.md`](DEFAUTS.md), avec ce qui l'a attrapé. Celles-là se
sont **répétées**, et c'est ce qui en fait des règles plutôt que des anecdotes.

1. **Le nom accessible se concatène sans espace, et `aria-label` sur un élément sans rôle est
   ignoré.** Quatre occurrences pour la première (« Tables8 », « orders1.9 M »), trois pour la
   seconde. Dès qu'un composant place deux contenus côte à côte, l'espace doit être **explicite**.
   Et quand un élément est la décoration d'un contrôle, l'information va dans le **nom du
   contrôle**, par du texte masqué en `clip-path` — jamais `display: none`, qui le retirerait de
   l'arbre d'accessibilité. Biome signale la seconde à chaque fois, et a raison à chaque fois.

2. **Un composant vérifié pièce par pièce n'est pas un écran livré.** `A4` était fidèle et testé,
   et n'avait jamais été vu **entier dans l'application** : rien ne réunissait ses quatre
   composants, et tous ses tests Playwright visaient `?gallery`. Invisible précisément parce que
   la galerie donne la même image. Même motif pour trois couches complètes que personne ne
   franchissait : `load_config` (attrapé en `09b`), `read_rows` (`10c`), `describe_table` (`10b`).
   Depuis `10b`, au moins un test part de `/`.

3. **jsdom ne calcule aucune mise en page.** Toute exigence de hauteur, largeur, position ou
   superposition est structurellement hors de portée de Vitest et va dans `e2e/`. Et il faut
   mesurer la valeur **calculée**, pas le rectangle : celui-ci inclut les bordures et masque un
   écart derrière un arrondi. Un `var()` vers un jeton inexistant ne casse d'ailleurs rien de
   visible — ni TypeScript, ni Vitest, ni l'œil.

4. **Un test vert ne prouve rien tant qu'un sabotage ne l'a pas fait tomber.** Et un test qui
   reste vert sous sabotage doit être **réécrit** : c'est arrivé quatre fois — un test qui
   comptait les entrées d'une table sans prouver le réemploi, un piège de focus que l'ordre de
   tabulation de jsdom n'atteignait pas, un message d'erreur qui passait pour la mauvaise raison,
   une fenêtre de 500 lignes rendue après en avoir ramené cent mille.

5. **Le mockup fait foi — sa feuille de style comprise.** Trois valeurs du tableau de `A4` se
   jouaient à l'inverse de sa prose, et seul son `<style>` les donnait. Lire les blocs `style=`
   en ligne ne suffit pas.

6. **Vérifier le chemin, pas seulement le résultat visible.** Saboter la pagination laissait vert
   le test « la fenêtre rend 500 lignes » ; l'image de test SSH livrait `AllowTcpForwarding no`
   pendant que le test « un tunnel s'ouvre » passait. Quand la contrainte porte sur le chemin, il
   faut mesurer le chemin — un coût, un aller-retour réel.

7. **Un décor de test trop régulier ne mesure que le décor.** C'est la leçon des neuf défauts du
   premier usage réel (`DEFAUTS.md` § du 10 août 2026) : aucun n'était une erreur de logique, tous
   tenaient à une régularité du décor — colonnes exotiques nulles **partout**, tables toutes
   analysées, numéros d'attribut qui coïncident par hasard entre deux tables, grille de
   démonstration plus étroite que son cadre. Sur un tel décor, une suite verte ne prouve rien de ce
   qu'elle prétend : `06d` a rendu `NULL` pour tout horodatage pendant quatre jours sans qu'un test
   bronche, et deux versions d'un test de chevauchement ont été vertes sans le correctif.

   Avant d'écrire un test, demander **ce que le décor rend indiscernable** : une colonne vide et un
   type mal lu, une table vide et une table jamais analysée, un chevauchement et une découpe par
   `overflow`. Puis rendre les deux distinguables dans le décor.

8. **Les outils qui vérifient doivent eux-mêmes pouvoir échouer.** `cmd | tail` fait porter le
   statut de sortie par `tail`, et « TOUT VERT » s'est affiché avec trois vérifications rouges.
   Un garde écrit contre une famille de fichiers ne couvre pas celle qu'elle engendre. Un
   `biome-ignore` doit être la **dernière** ligne de commentaire avant le nœud. Et
   `git checkout -- fichier` restaure depuis l'**index** : un sabotage qui y a été ajouté est
   réinstallé par la « restauration » censée l'enlever.

## 6. Ce qui attend une décision humaine

Consigné dans `specs/README.md` § « À trancher avant certaines specs ». En résumé :

- **Quinze trous du handoff** relevés en écrivant `08a`–`08e`, `09a`–`09f` et `10a`–`10f` : les
  onze premiers concernaient `A2` et `A4` ; les quatre de `A5` sont la **pastille de `status`**
  (le mockup se contredit — sa sidebar donne à cette colonne le glyphe `T` du texte), les
  **valeurs fréquentes** du popover (un `GROUP BY` sur 1,9 million de lignes déclenché par
  l'ouverture d'un menu), l'aperçu **« 280,00 € »** (qui suppose un lien entre `total_cents` et
  `currency` que rien ne déclare) et le panneau de l'opérateur **`in`**, annoncé par des points de
  suspension et maquetté nulle part. Chacun a reçu **le minimum défendable**, dit dans sa spec.
- **L'export CSV est un sujet, pas un bouton** : outre `blob:` refusé par la CSP, il reste à
  trancher la fenêtre ou le résultat complet, l'encodage, le séparateur, le traitement des `NULL`
  et des sauts de ligne. Sur 1,9 million de lignes l'écriture doit être en flux, donc côté Rust.
  `10e` livre le bouton désactivé avec l'infobulle qui nomme sa spec.
- **Les feux tricolores ne peuvent pas être grisés** derrière une modale : `titleBarStyle:
  "Overlay"` les fait dessiner par macOS, hors d'atteinte du CSS. Trois contournements envisagés,
  tous refusés. L'écart tient à trois pastilles de 11 px.
- **Une variante d'icône simplifiée** sous 32 px : la carte du sac à dos devient un amas de
  pixels. Travail de design.
- **`blob:` n'est pas autorisé par la CSP** — touchera l'export CSV.
- **Un Developer ID reste requis pour *diffuser*** (Gatekeeper, notarisation). Décision d'achat,
  à prendre avant la première distribution, **pas avant d'écrire du code**.
- **L'écran de confiance SSH à la première connexion**, que `06e` a contourné par défaut.

## 7. Conventions à ne pas casser

- **Français** pour la conversation, les specs et les commits. Code et identifiants en anglais.
- **Specs sous 150 lignes** (`AGENTS.md`). Une spec qui déborde est une spec à découper.
- **`tokens.css`, `tokens.ts`, `sprite.svg`, `names.ts` et `src/domain/*.ts` sont générés**,
  jamais édités. Un fichier généré n'a **qu'un seul producteur** — c'est la leçon de
  `export-types`, dont le couplage à `cargo test` corrompait `config.ts` en silence.
- **Aucune couleur littérale hors `tokens.json`.** Garde-fou `tokens:check`.
- **Assertions par `getByRole` avec nom accessible.** Biome n'a aucune règle de nom accessible :
  ces tests sont le seul garde-fou du projet sur ce point.
- **Aucune ressource réseau.** La CSP le fait respecter structurellement.
- **`export PATH="$HOME/.cargo/bin:$PATH"`** devant toute commande cargo ou tauri.
- **L'échelle d'espacement n'a pas de 8 px** (3, 5, 6, 7, 9, 11, 14, 16). Un littéral commenté
  vaut mieux qu'un jeton approximatif choisi « parce que ça se ressemble ».

## 8. Deux « manques » qui n'en sont pas

**Seul `Button` en variante secondaire a un style de survol**, et la galerie l'affiche
franchement. **Ne le « corrigez » pas** : le handoff ne définit un survol que pour les lignes
d'arbre et de tableau (`--hover-row`) et le bouton secondaire. En inventer un ailleurs serait
l'erreur que ce projet évite depuis le début — une valeur qui n'est ni dans les tables ni dans le
mockup.

**Les raccourcis affichés sont à opacité `.6`**, quand le mockup varie `.5`/`.6`/`.7` selon
l'instance. Décision documentée dans `Button.module.css` : une valeur représentative plutôt que
trois props.

*(La dette du `Chip` interactif est **close** depuis `08a` : le sélecteur de moteur de `A2` n'a
aucune croix de suppression, donc c'est un groupe radio et non un chip supprimable. `RadioGroup`
emploie de vraies radios natives. La dette reste ouverte pour l'écran qui voudra une croix.)*

## 9. Deux pièges d'environnement, propres à cette machine

**`cargo` n'est pas dans le `PATH`** des commandes shell de cet outillage — `~/.zshenv` source
`~/.cargo/env`, mais ce shell ne le relit pas. Préfixer *chaque* commande.

**Pas de capture d'écran de fenêtre native.** Playwright pilote Chromium, donc `pnpm dev` est
entièrement vérifiable (mesures, captures, comparaison au pixel contre le mockup). `pnpm tauri
dev` compile et s'exécute, mais **la fenêtre native elle-même ne peut pas être vue** — d'où le § 0.

## 10. Commandes

**Avant tout commit — la barrière, une seule commande :**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export DORABASE_TEST_PG="postgres://dorabase:dorabase-test@localhost:55432/dorabase_test"
./scripts/verifier-tout.sh
```

Elle lance ce que lance la CI et **échoue vraiment** (voir § 5, règle 6). Sans
`DORABASE_TEST_PG`, les tests sur base réelle sont sautés — et elle le dit à l'écran plutôt que
de les taire.

**Le décor de test**, à monter une fois par machine :

```bash
docker run -d --name dorabase-test-pg -e POSTGRES_PASSWORD=dorabase-test \
  -e POSTGRES_USER=dorabase -e POSTGRES_DB=dorabase_test -p 55432:5432 postgres:17
docker exec -i dorabase-test-pg psql -U dorabase -d dorabase_test < scripts/schema-test-pg.sql

./scripts/bastion-test.sh demarrer /tmp/bastion   # le bastion SSH de 06e
. /tmp/bastion/bastion.env
```

**Sans le bastion, `cargo test --features db-tests` échoue** sur les dix tests de tunnel — ils
*paniquent* au lieu de se sauter, contrairement à ceux de `postgres/mod.rs`. Incohérence connue,
sans conséquence tant que le décor est monté ; la CI le monte avec le même script.

**Le reste, au cas par cas :**

```bash
pnpm dev            # serveur Vite ; `?gallery` dans l'URL affiche la galerie des primitives
pnpm tauri dev      # l'app (bloquant, ouvre une fenêtre)
pnpm test           # 369 tests Vitest
pnpm test:e2e       # 73 tests Playwright, webServer auto
pnpm typecheck      # tsc -b
pnpm lint           # Biome
pnpm tokens:check   # garde-fou : échoue si tokens.css/ts édités à la main
pnpm icons:check    # idem pour le sprite
pnpm domain:check   # idem pour les projections ts-rs (exige un arbre git propre)
```

```bash
cd src-tauri && cargo test --features db-tests   # 209 tests, dont 48 sur base et bastion
cd src-tauri && cargo test                       # 161 tests, sans décor
```

## 11. La suite

**`11` — `A6`, l'édition inline.** C'est le prochain écran, et il porte le premier **écrit** du
projet dans une base de l'utilisateur — jusqu'ici tout est en lecture. Trois choses qu'aucune spec
n'a livrées : la cellule en saisie (boîte flottante débordant de la trame), les modifications en
attente avec leur diff, et la transaction qui les applique.

`A6` est trop large pour une seule spec. **Proposer le découpage avant d'écrire**, comme
`AGENTS.md` le demande et comme `05`, `06`, `08`, `09` et `10` l'ont fait. Une piste, à confirmer :

| Spec | Scope |
| --- | --- |
| `11a` | La cellule éditable : boîte flottante, caret, `↩` / `esc`, infobulle de raccourcis |
| `11b` | Les modifications en attente : modèle, bandeau 34 px, teintes de ligne et de cellule |
| `11c` | Le panneau droit « Modifications en attente » : une carte par changement, diff barré / vert |
| `11d` | L'écriture : `BEGIN` / `UPDATE` / `COMMIT`, SQL prévisualisé, garde-fous de production |

`11d` est celle qui mérite le plus d'attention : c'est la première écriture, et les garde-fous de
`A10` (« refuser DELETE/UPDATE sans WHERE », « patch inverse 24 h ») en dépendent.

Trois points à trancher au passage :

- **Le rappel `⌘E` de la barre d'état**, retiré par `10c` faute d'écran qui l'honore : `A6` le
  remet, et c'est le moment.
- **Supprimer une base ou un projet** reste impossible (`08g` a livré la modification). Destructif,
  et il faut décider du sort des secrets ; le handoff ne le maquette pas. Sa propre spec.
- **`SplitPane` horizontal** pour `12` (console SQL) : géométrie de poignée différente (pastille
  26×3 au lieu de 3×26). Son option `sized`, ajoutée par `10f`, y servira aussi.

Et, avant tout : **les vérifications 2, 4 et 5 du § 0**.
