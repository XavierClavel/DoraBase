# Reprise de session

Ce document existe pour qu'une session neuve reprenne le travail sans avoir la conversation
précédente. Il complète les specs et les plans, qui disent *quoi* construire ; lui dit **où on
en est, ce qui a été décidé, et pourquoi**.

Dernière mise à jour : 20 août 2026 (support Cloud SQL). Le travail vit sur `quiver-leader` :
les six specs de `A5` (`10a`–`10f`), la création de projet (`08f`), la modification et le retrait de
connexions (`08g`–`08j`), l'édition inline de `A6` (`11a`–`11d`), la console SQL de `A7`
(`12a`–`12f`), la console MongoDB de `A8` (`13a`–`13c`), la vue Structure de `A9` (`14a`–`14c`), les
préférences de `A10` (`15a`–`15d`), **le second moteur du projet** (`18a`–`18g`, MongoDB), une
trentaine de correctifs venus du **premier usage réel** de l'application, et le **support Cloud
SQL** (`05d`, `06g`, `08k`).

**Les dix écrans du handoff sont assemblés et atteignables.**

---

## 0. À faire en premier — neuf vérifications à l'œil, dont quatre en attente

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
| 2 | ~~« Parcourir… » du panneau tunnel~~ | **Fait le 10 août** : le sélecteur natif s'ouvre et le chemin arrive dans le champ | `08c` |
| 2b | Basculer « Type » sur « Cloud SQL », cliquer « Parcourir… », puis annuler | Le sélecteur s'ouvre sur un filtre `.json` ; le chemin choisi arrive dans « Compte de service », et une annulation ne l'efface pas. Le visage SSH est vérifié depuis le 10 août (ligne 2), celui-ci ne l'est pas — c'est un **second** appel, avec son propre filtre | `08k` |
| 3 | ~~Enregistrer une base, quitter, relancer~~ | **Fait le 10 août** : le projet et sa base survivent au redémarrage | `09b` |
| 4 | Cliquer la pastille projet de la barre de titre | **Défaut trouvé le 10 août** : la fenêtre ne bougeait pas, mais le menu ne paraissait pas — un `overflow: hidden` de la barre le découpait (`DEFAUTS.md` n° 35). Corrigé ; **à reprendre** pour confirmer que le menu s'ouvre dans l'application | `09c` |
| 5 | ~~« Copier la ligne en INSERT », puis coller~~ | **Fait le 10 août** : le SQL arrive dans le presse-papiers | `10f` |
| 6 | ~~`⌘E`, modifier une cellule, `⌘Z`~~ | **Fait le 10 août** : la bascule et l'annulation répondent sous WKWebView, malgré les raccourcis système. Deux défauts d'affichage relevés au passage (`DEFAUTS.md` n° 36 et 37), corrigés | `11b` |

| 7 | Régler « Afficher les barres de défilement : toujours » (Réglages ▸ Apparence), puis regarder la sidebar et la bande d'onglets | La barre de la sidebar doit être **fine, sans piste**, et son curseur ne se voir qu'au survol ; la bande d'onglets ne doit en montrer aucune. **Non vérifiable ici** : Chromium sans tête rend des barres en survol, qui n'occupent aucune place — la mesure vaut 0 avec comme sans la correction (`DEFAUTS.md` n° 73) | — |
| 2c | Construire un bundle (`pnpm tauri build`), le lancer **depuis le Finder** sur une machine où `cloud-sql-proxy` n'est pas installé, et ouvrir une connexion Cloud SQL | Le proxy doit démarrer : c'est la seule preuve d'`06h`, et la seule observation du `PATH` minimal d'une app graphique — jamais constaté, seulement anticipé (`specs/README.md`). Si l'erreur dit « le binaire est introuvable », le sidecar n'a pas été embarqué ou n'est pas à côté de l'exécutable | `06h` |
| 8 | Cliquer une autre application pour défocaliser DoraBase | Les trois feux tricolores doivent rester visibles (grisés). Signalé le 18 août : ils **disparaissent**. Boutons dessinés par le système sous `titleBarStyle: "Overlay"` — donc **ni reproductible ni corrigeable depuis le web** ; l'expérience à tenter est de passer `hiddenTitle` à `false` le temps d'un lancement pour savoir si la disparition vient de la superposition ou du thème | `tauri.conf.json` |

**Quatre vérifications restent — et l'usage réel en a appris bien plus qu'elles** : dix-neuf défauts,
dont seize signalés par l'utilisateur (voir `DEFAUTS.md` § « Ce qu'a trouvé le premier
usage réel »). La leçon est au § 5, règle 9.

Tant que ce n'est pas fait, **ne présenter aucun de ces points comme vérifié**. Les
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

## 2 bis. Le chantier du 20 août 2026 — le pied de la sidebar, puis les consoles

Deux lots, dans cet ordre, tous deux terminés et verts (821 Vitest, 218 Playwright, 425 Rust).

**Le pied de la sidebar de l'explorateur.** Trois gestes de création portent désormais la même
facture — bordés, 28 px, `--radius-field` —, la hiérarchie passant par la largeur : « Nouvelle
console » sur toute la ligne, « Connexion » et « Projet » se partageant la suivante. Le pied passe de
28 px à 78 px, pris sur la hauteur de l'arbre, et c'est un arbitrage assumé. `ConsoleFooterButton` est
remplacé par `src/ui/SidebarFooter/` — et la dette « promouvoir 26 px dans `Button` » se solde **par
la négative**, `Button` étant en `content-box` (voir `DEFAUTS.md` n° 103). L'icône « Rafraîchir » a
quitté le pied pour le menu « … » d'une ligne projet, sous le nom long « Rafraîchir l'arborescence » ;
elle n'est pas supprimée, `useArbre` s'appuyant sur son existence.

**Les consoles sont devenues des objets persistés, sous la connexion.** Elles apparaissent dans
l'arbre sous leur connexion, avant ses schémas ; on en crée depuis le menu « … » d'une connexion, on
les renomme et on les retire depuis le leur ; leur texte s'écrit tout seul, amorti à 400 ms.

**Le pied ne porte plus « Nouvelle console ».** Quatrième passage : une console appartient à une
connexion, et le pied ne sait pas laquelle — il fallait deviner le contexte, et se tromper dès que
deux connexions étaient dépliées. Le menu « … » de la connexion est désormais le seul chemin, et
**créer ouvre** l'onglet, sans quoi il faudrait retrouver la console dans l'arbre pour la cliquer.
Le pied ne garde que les deux gestes de structure, sur une ligne.

Conséquence : huit specs e2e ouvraient une console par ce bouton. Elles passent par
`e2e/pourLesTests.ts` → `ouvrirUneConsole(page, connexion)`, qui **survole** la ligne avant de cliquer
son « … » — le menu est en `visibility: hidden` hors survol, et Playwright refuse de cliquer un
élément invisible : sans le survol, l'attente expire au bout de trente secondes sans rien dire
d'utile.

**Les brouillons existent toujours**, et c'est voulu : « Ouvrir dans la console » depuis le DDL
(`DdlPanel`) ouvre un onglet volatile, que « Enregistrer » fait exister sous « console N ».
`baptiserLeBrouillon` garde donc son objet.

**Et aucune modale ne nomme plus rien.** Un troisième passage a retiré les deux fenêtres de nommage :

- **La création prend « console N »**, le plus petit numéro libre sur la connexion — la même règle que
  les brouillons d'onglets. Nommer avant d'avoir écrit revient à demander un titre pour une page
  blanche : on tape n'importe quoi et on le regrette. Le bouton « Enregistrer » d'un brouillon suit la
  même règle, et `baptiserLeBrouillon` fait passer l'onglet de volatile à persisté.
- **Le renommage se fait sur la ligne**, au double-clic — et **aussi sur l'onglet**, même geste.
  `Entrée` valide, `Échap` abandonne, la perte de focus valide — cliquer ailleurs après avoir tapé
  veut dire « c'est bon ». Un nom vide ou inchangé n'envoie rien. Le champ est la primitive
  `src/ui/ChampDeRenommage/`, partagée par `TreeRow.edition` et `TabStrip` : le comportement d'un
  renommage sur place n'a pas de raison de différer selon le libellé qu'il remplace.
- **Le champ est discret** : un voile blanc translucide, sans bordure. Deux passes pour y arriver — un
  liseré d'accent d'abord, puis un fond `--field` blanc. Translucide et non un ton de la palette,
  parce qu'un fond opaque doit choisir son support : sur l'aplat d'accent d'une ligne sélectionnée —
  l'état exact d'une ligne qu'on vient de double-cliquer — le même ton redevenait une tache blanche.
- **L'onglet ne change pas de taille en édition**, et c'est ce qui a demandé le plus d'essais. Un
  `<input>` sans largeur déclarée porte celle de son attribut `size` implicite, ~177 px, et cette
  largeur *pousse* : l'onglet s'élargissait sous le curseur au double-clic. `flex: 1 1 0` avec
  `width: 0` neutralise cette largeur intrinsèque. Une tentative intermédiaire *fixait* au contraire
  une largeur d'édition, donc aggravait le défaut.
- **L'entrée « Renommer… » du menu « … » subsiste**, mais elle ouvre le même champ : un geste qui
  n'existe qu'au double-clic est invisible pour qui ne l'essaie pas, et inatteignable au clavier.
- `SaveQueryDialog` et `RenameQueryDialog` sont **supprimés** — plus aucun appelant.
- Seules les consoles se renomment ainsi : le nom d'une table ou d'un schéma vient du serveur, celui
  d'une connexion se change dans sa modale de configuration, qui porte bien d'autres champs.

**« Mes requêtes » (`12f`) n'existe plus** : le concept est absorbé. C'était une décision du
commanditaire, prise en connaissance du coût. Les requêtes déjà écrites sur le disque sont **reprises
sans perte** vers la première connexion déclarée du projet — le champ `queries` est conservé et vidé
après transfert, jamais supprimé du modèle, faute de quoi `serde` les effacerait en silence. La
reprise se rejoue à chaque chargement, un projet sans connexion n'ayant nulle part où verser. Tout
cela est détaillé dans `DEFAUTS.md` n° 104.

**Ce qui reste ouvert sur ce chantier** — aucune de ces trois choses ne bloque :

- `e2e/12f-requetes-enregistrees.spec.ts` est devenu `12f-consoles-persistees.spec.ts`. Le **nom de
  fichier garde le numéro `12f`**, alors que la spec `specs/12f-*.md` décrit encore les requêtes du
  projet : le texte de la spec n'a pas été réécrit, le commanditaire ayant demandé de coder sans
  passer par les specs. À trancher : réécrire `12f`, ou lui donner un successeur.
- **Renommer depuis l'onglet est à l'étroit sur un nom très court.** La largeur minimale d'un onglet
  vaut 98,3 px — la cote de l'onglet `orders` du handoff, la plus petite que le mockup connaisse — et
  un minimum plus généreux (120 px avait été essayé) poussait cet onglet-là au-delà de sa cote et
  cassait `e2e/layout-primitives.spec.ts`. Sur un nom d'un caractère, le champ n'offre donc qu'une
  trentaine de pixels utiles. Renommer depuis la ligne d'arbre reste le geste confortable. **Si un
  écart au handoff est acceptable ici, c'est l'arbitrage à rendre.**
- Un brouillon (« Ouvrir dans la console » depuis le DDL) et une console persistée s'appellent tous
  deux « console N » dans la bande d'onglets, sans qu'aucun libellé ne les distingue.
- Le renommage sur place n'est **pas branché sur les autres nœuds de l'arbre**, faute d'objet : à
  revoir si un jour une connexion doit pouvoir se renommer sans passer par sa modale.

## 3. Où en est le travail

**86 specs écrites, toutes implémentées sauf `19a`, `20` et `21`** — voir le tableau ci-dessous et le
§ 11 pour ce qui bloque ces trois. Les dix écrans du handoff sont assemblés **et
atteignables depuis l'application** : `A1` (accueil), `A2`/`A3` (nouvelle connexion et son échec),
`A4` (explorateur), `A5` (visualiseur), `A6` (édition inline), `A7` (console SQL), `A8` (console
MongoDB), `A9` (structure et DDL), `A10` (préférences).

**Le support Cloud SQL est livré** (`05d`, `06g`, `08k`) : une connexion PostgreSQL peut passer par
le Cloud SQL Auth Proxy, et `A2` sait le saisir. Deux réserves, plus bas.

**Et l'utilisateur n'a plus rien à installer** (`06h`, `06i`, 21 août 2026) : le binaire
`cloud-sql-proxy` est **embarqué dans le bundle**, à version épinglée et empreinte vérifiée, et
l'authentification réemploie ce que `gcloud auth application-default login` a déjà écrit. Reste une
seule dépendance externe, pour un unique login : le SDK `gcloud`.

**Quatre moteurs répondent** : PostgreSQL (`06`), MongoDB (`18`), SQLite (`17`) et MySQL (`16`).
Les trois specs de moteur restantes sont **écrites**, et aucune n'attend du code :

- **`19a` (Redis)** — **conclusion négative** : un espace de clés n'est pas un tableau, et l'y forcer
  donnerait des écrans qui affichent des colonnes inventées. Il lui faut son propre écran, qui n'est
  pas maquetté. C'est une décision produit, pas d'implémentation.
- **`20` (Snowflake) et `21` (BigQuery)** — bloquées par l'**absence de décor de test**, pas par une
  difficulté de conception. Le projet n'a aucun compte.

**Le contrat de `06a` porte donc tout ce qu'il pouvait porter** : quatre moteurs sur les six qu'il
couvre, et les deux manquants n'attendent qu'un compte.

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
| `08h`–`08j` | menu « … » de l'arbre, renommer un projet, retirer une connexion | **fait** |
| `11a`–`11d` | `A6` — cellule éditable, marques d'édition, panneau des modifications, écriture | **fait** |
| `12a`–`12f` | `A7` — coquille de console, éditeur, exécution, autocomplétion, onglets de résultat, requêtes enregistrées | **fait** |
| `13a`–`13c` | `A8` — console mongo, arbre JSON, schéma déduit | **fait** |
| `14a`–`14c` | `A9` — vue Structure, index et contraintes, DDL | **fait** |
| `15a`–`15d` | `A10` — préférences, apparence, grille et code, garde-fous | **fait** |
| `18a`–`18g` | **le moteur MongoDB** — contrat, connexion, introspection, schéma déduit, lecture, écriture, console | **fait** |
| `17a`–`17b` | **le moteur SQLite** — un fichier, pas un serveur | **fait** |
| `16a`–`16c` | **le moteur MySQL / MariaDB** — connexion, introspection, lecture et écriture | **fait** |
| `22` | l'inventaire des écarts au handoff | **fait** |
| `23a`, `23b`, `23d`, `23g` | **les environnements par projet** — déclaration, une connexion = un environnement, formulaire, arbre groupé | **fait** |
| `23c`, `23e`, `23f` | les cinq commandes d'environnement, l'édition d'un projet, le retrait d'un environnement | **fait** |
| `24a`–`24d` | **le parcours de création en deux étapes** — projet, bande de progression, enchaînement, deux gestes | **fait** |
| `05d`, `06g`, `08k` | **le support Cloud SQL** — le proxy en énumération à données et sa migration v2 → v3, le pilotage de `cloud-sql-proxy`, le panneau de `A2` à deux visages | **fait** (deux réserves plus bas) |
| `06h`, `06i` | **le proxy livré avec l'app** — binaire embarqué à empreinte vérifiée, et l'authentification par les identifiants du CLI `gcloud` | **fait** (bundle ouvert depuis le Finder et notarisation : à observer) |
| `19a` | Redis — **n'entre pas dans le contrat**, et pourquoi | écrite, conclusion négative |
| `20`, `21` | Snowflake, BigQuery — **aucun décor de test** | écrites, bloquées |

**Comptes de tests, mesurés le 18 août 2026 par `./scripts/verifier-tout.sh`** — 513 Rust (dont ceux
sur PostgreSQL 17.6 **en TLS**, un MongoDB 8 en jeu de réplicas, un MySQL 8.4 en TLS, un fichier
SQLite, et un vrai bastion SSH), 746 Vitest, 184 Playwright.

**Au 19 août 2026, `23` et `24` complètes** — **412 Rust** en `cargo test --lib` (sans les décors, qui
demandent `--features db-tests`), **820 Vitest**, **213 Playwright**.

**⚠️ `npx tsc --noEmit` ne vérifie rien** — le `tsconfig.json` de la racine porte `"files": []` et deux
`references` : c'est un fichier de solution. Le seul typecheck qui compile quelque chose est
`pnpm typecheck` (`tsc -b`), et c'est celui de la CI. Défaut n° 94, qui a laissé partir un commit rouge. Les cinq références de fidélité de
`e2e/a1.spec.ts` ont changé de décor ce jour-là : le bouton de `A1` ouvre désormais l'étape 1 du
parcours de création, donc `A2`, `A2`+tunnel et `A3` se capturent depuis `?demo` — seul décor où les
deux étapes s'enchaînent, `create_project` étant une commande Tauri. Voir l'en-tête du fichier, qui
dit d'où chaque capture est prise et pourquoi.

**Les tests SQLite tournent sans décor à monter** : le fichier est temporaire et créé par le test
lui-même, donc ils passent sur une machine sans Docker — le seul moteur du projet dans ce cas.

**Le support Cloud SQL a été posé sur cette base le 20 août 2026**, en trois specs déjà écrites et
implémentées ailleurs (`05d`, `06g`, `08k`), rebasées ici. Trois collisions ont dû être tranchées au
passage, et elles valent d'être connues :

- **Les numéros étaient pris.** `06f` désigne le TLS et `08f` la création de projet : les specs Cloud
  SQL sont devenues `06g` et `08k`.
- **La version du fichier de configuration était prise.** `23a`/`23b` avaient déjà porté
  `VERSION_COURANTE` à 2. La migration du proxy est donc un **cran v2 → v3**, appliqué *avant* les
  autres et sur le JSON brut : il réécrit un objet `tunnel` sans rien savoir de ce qui l'entoure, ce
  qui lui évite d'être écrit deux fois — une fois pour la forme v1, à variantes, une fois pour la v2,
  à connexions.
- **`TunnelKind` avait survécu ici** et disparaît, comme `05d` le prévoyait.

**Le `reuseExistingServer` de Playwright est retiré** : plusieurs worktrees de ce dépôt travaillent
en parallèle, et le premier `pnpm dev` démarré prend 5173. Les références de fidélité pouvaient donc
être capturées contre l'application d'une **autre branche** — c'est arrivé, défaut n° 107, plus
sévère que le n° 66 qui n'y voyait qu'un serveur résiduel. Un port par worktree
(`DORABASE_E2E_PORT`) et `--strictPort` remplacent la réutilisation.

**La boucle du produit est complète depuis `09b`** : saisir (`08e`), persister, relire, afficher.
`load_config` existait depuis `05b` et n'était appelée par personne.

**La bande d'onglets est vivante depuis `10b`** : ouvrir une table depuis l'arbre ou depuis
« Ouvrir les données » du panneau de détail, changer d'onglet, fermer, réordonner. Fermer le
dernier laisse l'écran debout, sur la liste des objets.

**Ce qui n'est pas fait dans `A5`** : l'export CSV (bouton présent, désactivé, infobulle qui
nomme sa spec), le bloc « Valeurs fréquentes » du popover d'opérateur, l'aperçu formaté
« 280,00 € », et la pastille colorée de `status`. Les quatre sont consignés au § 6 avec leur
raison — aucun n'est un oubli.

**`05d` (le proxy en énumération à données) est fait** : `Tunnel` porte `{ localPort, proxy:
Proxy }`, `Proxy` distingue SSH et Cloud SQL, et le cran de migration **v2 → v3** est en place. Le
garde-fou de projection (`pnpm domain:check`) a été **réexercé** sur un changement de forme réel —
l'union discriminée que `ts-rs` produit pour `Proxy` — et non plus seulement sur un champ ajouté, son
seul exercice depuis `05a`. **`06g` a suivi** : le moteur ouvre désormais le proxy Cloud SQL,
et `PostgresAdapter` ne porte qu'un champ et qu'un aiguillage pour les deux sortes de proxy —
vérifié en ajoutant un troisième membre à `Proxy`, qui ne fait échouer la compilation qu'à un
seul endroit. **La réserve du chemin heureux est au § 11.**

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

**Le binaire du proxy est embarqué, et l'embarqué gagne contre le `PATH`** (`06h`, 21 août 2026).
Renversement assumé d'un « hors périmètre » de `06g`, qui refusait de télécharger un exécutable :
la réserve est traitée, pas ignorée — version épinglée dans `src-tauri/cloud-sql-proxy.lock`,
empreinte SHA-256 vérifiée par `scripts/telecharger-proxy.sh`, binaire jamais commis. L'ordre de
recherche est la règle : si le `PATH` passait devant, le comportement de l'app dépendrait de ce que
l'utilisateur a installé, et un proxy d'une autre version pourrait écrire des journaux que
`sortie::est_pret` ne reconnaît pas — soit une attente qui expire alors que le proxy marche. Le
`PATH` reste en repli pour `cargo run`/`cargo test`, où il n'y a pas de sidecar.

**L'authentification passe par les identifiants par défaut de l'application, et `--gcloud-auth` est
écarté** (`06i`). Le proxy sait déléguer à `gcloud` (`-g`), ce qui dispenserait d'un second login,
mais il faut alors `gcloud` **dans le `PATH` du sous-processus** — celui d'une app lancée depuis le
Finder est minimal, et `gcloud` vit sous `~/google-cloud-sdk/bin` ou Homebrew. Autrement dit : `06h`
supprime une dépendance au `PATH`, et `--gcloud-auth` en réintroduirait une, plus fragile, pour
économiser un login unique. À reprendre si ce second login se révèle un obstacle réel.

Corollaire de rédaction, qui vaut pour tout message à venir : **jamais « authentifiez-vous avec
gcloud »**. `gcloud auth login` et `gcloud auth application-default login` se ressemblent, ouvrent
toutes deux un navigateur, et seule la seconde écrit le fichier que les bibliothèques clientes
lisent. Un message doit porter la ligne à copier, et dire que l'autre ne suffit pas.

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

**La jointure des panneaux est un trait, pas une zone — écart au handoff assumé.** Le mockup dessine
un dégradé de 5 px qui s'assombrit du côté du panneau, plus une pastille blanche de 3×26 en son
milieu. Rendu dans l'application, cet empilement se lit comme une **zone** entre deux colonnes, alors
qu'une jointure n'a rien à dire : elle sépare. Demandé le 19 août 2026 — « un simple trait avec une
barre au survol suffirait ». Le trait fait donc 1 px de `--divider` en permanence, et s'épaissit à
3 px assombris au survol et au focus. La zone de saisie garde ses 5 px : ce qu'on voit et ce qu'on
peut attraper sont deux mesures différentes. La propriété `handleShadow` a été **retirée de l'API**
plutôt que gardée sans effet — un trait n'a pas de côté, et un réglage qui ne fait rien est pire
qu'un réglage absent.

**Le déclencheur du découpage de `config/store.rs` a sonné, et n'a pas été suivi.** `05d` avait
écrit : « quand `VERSION_COURANTE` passera à 3, sortir `migrer` et les migrations dans un
`config/migrations.rs` ». La v3 est arrivée le 20 août 2026, le fichier fait 1673 lignes, et le
découpage **n'a pas été fait** — délibérément, et voici pourquoi : la règle avait été écrite en
prévoyant *une deuxième migration du même genre*, c'est-à-dire un second `mod vN` avec ses types et
sa conversion. Le cran v2 → v3 n'est pas de ce genre : c'est une réécriture de quarante lignes sur du
`serde_json::Value`, sans type d'ancienne forme à maintenir. Sortir avec lui `mod v1` et
`migration_v1_vers_v2`, qui ne bougent pas, déplacerait du code sans rien séparer.

**Le nouveau déclencheur** : à la **prochaine** migration qui demande un `mod vN` de types dédiés.
Ce jour-là, deux d'entre eux cohabiteront dans `store.rs`, et c'est cette cohabitation — pas le
compte de lignes — qui justifie le fichier séparé.

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

**Le serveur de développement que Playwright réutilisait pouvait appartenir à une autre branche
— et ne se réutilise plus.** Plusieurs worktrees de ce dépôt travaillent en parallèle sur cette
machine, chacun avec son `pnpm dev` ; le premier démarré prend 5173. `reuseExistingServer` faisait
donc mesurer, en silence, l'application du voisin : deux références de fidélité ont été capturées
ainsi, et vingt-quatre tests déclarés « rouges depuis toujours » pour cette seule raison
(`DEFAUTS.md` n° 107, plus sévère que le n° 66 qui n'y voyait qu'un serveur résiduel).

Le symptôme est trompeur, et c'est ce qui rend le piège cher : **tous** les tests expirent à 30 s,
ou les captures diffèrent de 10 % des pixels. Cela ressemble trait pour trait à une régression de
rendu. Le réflexe est de regarder qui écoute avant de chercher dans le code :

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN   # à qui appartient ce serveur ?
```

Depuis le 20 août 2026, `playwright.config.ts` ne réutilise **plus jamais** de serveur et démarre le
sien en `--strictPort`, sur le port que `DORABASE_E2E_PORT` désigne (5173 par défaut). Un port déjà
pris fait donc **échouer** l'exécution au lieu de la dérouter. En local, quand un worktree voisin
tient 5173 :

```bash
export DORABASE_E2E_PORT=5399   # un port à soi, par worktree
```

**`pnpm tsc --noEmit` ne vérifie rien.** Le projet compile par références (`tsc -b`) : la forme
`--noEmit` sort 0 sans regarder `src`. Un champ ajouté au domaine a laissé seize littéraux
incomplets pendant que la commande annonçait « aucune erreur ». **C'est `pnpm typecheck` qui mord.**

**Cinq décors, et chacun sert en local *et* en CI** — une variante CI qu'on ne peut pas essayer
localement finit par diverger de ce qu'on croit qu'elle fait :

| Décor | Script | Particularité |
| --- | --- | --- |
| PostgreSQL | `scripts/pg-test.sh` | **TLS activé**, certificat dont le nom ne correspond pas — sans quoi `06f` ne distinguerait pas `verify-ca` de `verify-full` |
| MongoDB | `scripts/mongo-test.sh` | jeu de réplicas à un nœud, **sans quoi `18f` ne testerait que son refus** |
| MySQL | `scripts/mysql-test.sh` | `--default-character-set=utf8mb4`, **sans quoi le décor entre en latin1** |
| SQLite | `scripts/schema-test-sqlite.sql` | un fichier temporaire que le test crée : **aucun conteneur** |
| Bastion SSH | `scripts/bastion-test.sh` | un vrai serveur SSH |

```bash
export DORABASE_TEST_PG=postgres://dorabase:dorabase-test@localhost:55432/dorabase_test
export DORABASE_TEST_MONGO=$(./scripts/mongo-test.sh demarrer)
export DORABASE_TEST_MYSQL=$(./scripts/mysql-test.sh demarrer)
./scripts/bastion-test.sh demarrer /tmp/bastion && . /tmp/bastion/bastion.env
./scripts/verifier-tout.sh
```

**Pas de capture d'écran de fenêtre native.** Playwright pilote Chromium, donc `pnpm dev` est
entièrement vérifiable (mesures, captures, comparaison au pixel contre le mockup). `pnpm tauri
dev` compile et s'exécute, mais **la fenêtre native elle-même ne peut pas être vue** — d'où le § 0.

## 10. Commandes

**Avant tout commit — la barrière, une seule commande :**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export DORABASE_TEST_PG="postgres://dorabase:dorabase-test@localhost:55432/dorabase_test"
export DORABASE_E2E_PORT=5399   # un port à soi ; voir § 9
. /tmp/bastion/bastion.env
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

## 10 bis. La capture du 18 août, et ce qu'elle a changé dans la manière de tester

Une capture de l'application **lancée** a fait apparaître neuf défauts de mise en page dans une
interface dont chaque écran avait pourtant sa spec verte (`DEFAUTS.md` n° 67 à 73). Ils partagent
tous une forme : chaque composant était juste **dans sa vitrine**, et faux dès qu'un voisin décidait
sa largeur, qu'un réglage du système changeait le rendu, ou qu'un pixel de fidélité tombait dans un
conteneur qui n'en voulait pas.

Ce qui manquait n'était pas de la rigueur, c'était un **niveau** de test. Les specs par écran
vérifient qu'un écran ressemble à son mockup ; aucune ne vérifiait ce qui n'appartient à aucun écran.
`e2e/geometrie-reelle.spec.ts` s'en charge, à la taille de fenêtre de la capture (1360 × 814) :

- rien ne franchit le bord droit de la fenêtre, et la racine ne défile pas horizontalement — les deux
  ensemble, parce qu'un enfant coupé par un ancêtre en `overflow: hidden` échappe à la première ;
- la grille défile bien **au geste**, molette comprise, et non « parce que `overflow-x: auto` est
  déclaré » ;
- la bande d'onglets ne déborde pas verticalement ;
- la barre de fil d'Ariane contient son contrôle segmenté **à 960 px**, la largeur minimale du
  produit ;
- la pastille du séparateur est invisible au repos ;
- les libellés des actions tiennent dans leurs boutons.

Chacune a été **sabotée** avant d'être acceptée. Deux ne mordaient pas : l'une mesurait un ensemble
vide (n° 72), l'autre une épaisseur de barre que Chromium sans tête ne rend pas (n° 73).

Ce qui **n'est pas** corrigé : la disparition des feux tricolores à la défocalisation. Ils sont
dessinés par macOS, pas par la page — il n'y a rien à corriger dans le web, et rien à mesurer depuis
Chromium. L'expérience à tenter est au § 0, ligne 8.

## 11. La suite

**Les 86 specs de l'index sont écrites, et toutes celles qui demandaient du code sont livrées** — les
trois exceptions étant `19a` (conclusion négative) et `20`/`21` (aucun décor de test).
`23` et `24` sont closes : les environnements se déclarent par projet, une connexion appartient à
l'un d'eux, et les deux gestes de création comme les cinq gestes d'environnement répondent.

**Le support Cloud SQL est livré** (demandé le 19 août 2026, terminé le 20) : `05d` le modèle et la
migration v2 → v3, `06g` le pilotage de `cloud-sql-proxy`, `08k` le panneau de `A2` à deux visages.
Deux réserves restent, toutes deux hors d'atteinte depuis ici :

- **Le chemin heureux contre une vraie instance n'a jamais été exercé.** Tout le pilotage du
  sous-processus est couvert par un faux binaire en shell, mais aucun test n'a parlé à Google.
  `une_instance_cloud_sql_est_joignable_par_le_proxy` s'ignore en le disant, et se déverrouille avec
  `DORABASE_TEST_CLOUDSQL_INSTANCE`, `_DATABASE`, `_USER`, plus `_PASSWORD` ou `_CREDENTIALS`. Ce
  qui reste inconnu est ce que seul le vrai binaire peut apprendre : la forme exacte de ses lignes
  de journal, et le comportement de ses codes de sortie.
- **Le sélecteur de fichier natif du champ « Compte de service »** — vérification 2b du § 0.

**`06h` et `06i` ont retiré la principale friction** (21 août 2026) : plus rien à installer sauf
`gcloud`, et trois échecs d'authentification qui portent leur réparation. Deux réserves, elles aussi
hors d'atteinte depuis ici :

- **Le bundle n'a pas été ouvert depuis le Finder sur une machine sans `cloud-sql-proxy`.** Ce qui
  **est** vérifié, sur un `.app` construit le 21 août 2026 : le sidecar est bien dans
  `Contents/MacOS/cloud-sql-proxy`, il porte la version du verrou (2.25.3), les trois fichiers de
  licence sont dans `Contents/Resources/licences/`, et le binaire répond sous un environnement
  réduit à `PATH=/usr/bin:/bin` — donc il ne dépend lui-même d'aucun `PATH`. La CI répète ces
  contrôles à chaque `pnpm tauri build`. Ce qui reste inconnu est l'aller-retour complet dans
  l'app graphique, sur une machine où le binaire n'est installé nulle part : § 0, ligne 2c.
- **La notarisation avec un binaire embarqué n'est pas vérifiée** — elle demande une identité de
  signature que ce poste n'a pas. Un exécutable embarqué non signé est refusé au lancement sur une
  machine tierce, et cela ne se voit **qu'après** distribution.

`08k` n'a **aucune maquette**, Cloud SQL étant absent du handoff : ses deux champs et ses deux
libellés sont inventés, et attendent un passage de design (`specs/README.md` § À trancher).

**Ce que `23e` a tranché, et qu'il faut savoir en y revenant** : l'identifiant d'un environnement est
figé à la **création** (`23a`), parce que la référence du Trousseau est
`dorabase/<projet>/<base>/<environnement>`. Renommer un environnement change donc son **libellé
seulement**, et installe une divergence assumée entre ce qui s'affiche et ce qui désigne. `rename_environment`
ne touche jamais à l'identifiant, et un test le vérifie en relisant le secret après renommage.

**Ce qui n'existe toujours pas, délibérément** : déplacer une connexion d'un environnement à un autre.
C'est la réponse raisonnable au cas que `23f` traite par la suppression, et elle demande de déplacer un
secret du Trousseau — donc son geste et sa spec. La confirmation ne la propose pas : offrir une action
absente est pire que son absence (défaut n° 36).

Le reste demande une **décision humaine**, pas du code :

1. **Redis** (`19a`) — un écran de parcours de clés à maquetter. Le forcer dans le contrat donnerait
   des colonnes inventées.
2. **Snowflake et BigQuery** (`20`, `21`) — un compte d'essai pour chacun. Sans décor, l'adaptateur
   serait le premier code du projet dont aucun test ne dirait s'il fonctionne.
3. **Le patch inverse persisté** (`15d`) — où l'écrire, sous quelle forme, et ce qu'il advient d'un
   patch dont la base a changé.
4. **Le thème « Nuit »** (`15b`) — les valeurs sombres des cent jetons de `tokens.json`.

**Le TLS est tranché et livré** (`06f`) : `rustls`, sur deux faits vérifiés dans les pilotes — celui de
MongoDB n'offre pas `native-tls`, et ni lui ni `mysql_async` n'accepte de `ClientConfig`. Le trousseau
du système n'étant atteignable nulle part uniformément, l'argument qui militait pour `native-tls`
tombait. Les cinq modes de `05a` produisent maintenant cinq comportements, et un champ « certificat
d'autorité » les alimente.

**Une limite à connaître** : `verify-ca` — vérifier la chaîne sans vérifier le nom — n'est disponible
que pour **PostgreSQL**. Les pilotes MySQL et MongoDB ne savent pas l'exprimer, et le premier a même un
drapeau silencieusement sans effet (défaut n° 63). Les deux **refusent avec leur raison** plutôt que de
remplacer le mode en silence.

**Le pari de `06a` a été vérifié trois fois** — « les écrans sont écrits en termes du contrat, pas de
PostgreSQL ». `A4`, `A5`, `A6`, `A7` et `A9` ont fonctionné pour MongoDB, SQLite **et** MySQL sans une
ligne de code propre au moteur. Trois exceptions seulement, toutes dans l'écran et non dans le
contrat : la console mongo (`13a`, dialecte de l'éditeur), la section « Schéma déduit » (`13c`), et
les cinq champs que `A2` masque pour un moteur de fichier (`17a`).

**Ce que `16`/`17` devront trancher, et que `18a` a défriché :**

**Ce que les quatre moteurs ont répondu à la même question**, et qui vaut d'être lu avant d'en
ajouter un :

| Question | PostgreSQL (`06`) | MongoDB (`18a`) | SQLite (`17a`) | MySQL (`16a`) |
| --- | --- | --- | --- | --- |
| Le niveau « schéma » | les schémas de la base | les **bases** du serveur | un seul, nommé `main` | les **bases** du serveur |
| Les colonnes | déclarées | **déduites** par échantillonnage | déclarées, type **suggéré** | déclarées |
| Le DDL | **reconstruit** — et il a perdu deux fois | les commandes qui recréent la collection | **presque** d'origine | rendu par le serveur |
| Le compte de lignes | estimé (`reltuples`) | estimé | **exact** | estimé (InnoDB) ou **exact** (MyISAM) |
| L'égalité sûre au nul | `is not distinct from` | `$in: [null]` | `is` | `<=>` |
| Les transactions | toujours | jeu de réplicas requis | toujours | InnoDB oui, MyISAM **non** |
| La citation | guillemet double | — | guillemet double | **backtick** |
| La connexion | hôte et port | hôte et port | **un fichier** | hôte et port |

**La ligne de l'égalité sûre au nul est celle qui a mordu quatre fois** : avec `=`, une modification
partant d'une cellule vide ne trouve aucune ligne, la transaction s'annule, et l'utilisateur lit « la
ligne a changé » sur une ligne que personne n'a touchée. Quatre moteurs, quatre syntaxes, un seul
piège.

**Trois réserves connues, aucune bloquante :**

- **`verify-ca` n'est disponible que pour PostgreSQL** (`06f`) : les pilotes MySQL et MongoDB ne
  savent pas vérifier une chaîne sans vérifier le nom d'hôte. Les deux refusent avec leur raison, et
  la nomment — jamais de remplacement silencieux.
- **Le patch inverse n'est pas persisté.** Le garde-fou de `15d` est livré **désactivé avec sa
  raison** plutôt qu'allumé sans effet. Le trancher demande de décider où l'écrire, sous quelle
  forme, et ce qu'il advient d'un patch dont la base a changé.
- **Le thème « Nuit » est incomplet.** `15b` livre le mécanisme (`data-theme` sur la racine, suivi de
  `prefers-color-scheme`), et l'écran **le dit**. Les valeurs sombres des cent jetons de
  `tokens.json` sont un travail de design que le handoff ne fournit pas.

**Et, avant tout : la vérification 4 du § 0** — cliquer la pastille projet dans l'application
réelle, pour confirmer que le menu s'ouvre depuis le correctif du découpage. `A10` en ajoute une
seconde : ouvrir les préférences, changer la densité, et voir la grille suivre sous WKWebView.
