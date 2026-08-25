# AGENTS.md

Conventions de travail sur DoraBase, pour les agents comme pour les humains.

**Ce fichier est le seul document *interne* du dépôt.** Le 25 août 2026, `REPRISE.md`, `DEFAUTS.md`,
les 89 specs de `specs/`, les plans de `plans/` et le bundle de handoff `design/handoff/`
ont été retirés. Ce qui restait de vrai y était soit déjà dans le code, soit repris ici.

**Ce qui fait foi désormais** : le code, les tests, et l'application telle qu'elle tourne.
Ce fichier ne garde que ce qu'aucun des trois ne peut dire — les intentions, les
décisions et leurs raisons, les prohibitions, et ce qui reste hors de portée de
l'outillage.

**`README.md` s'est ajouté le 25 août 2026**, et le partage est net : il s'adresse à qui
**télécharge ou publie**, ce fichier à qui **écrit du code**. Le README porte donc le lien
des versions, le geste d'installation et le flux de publication ; les raisons de ces choix
restent ici. Ce qui vaut pour les deux, c'est qu'aucun des deux ne redit ce que le code dit
déjà.

**Les numéros que portent les commentaires** — `06d`, `10b`, `25a`… — sont ceux des specs
retirées. Ils ont été laissés en place : ils nomment le chantier qui a produit une
décision, et se retrouvent dans l'historique Git. Aucun fichier ne leur correspond plus.
N'en écrivez pas de nouveaux.

---

## La langue de travail

Au début de chaque session, **demander la langue de travail** en une question courte,
avant toute autre chose, puis s'y tenir. Cela vaut pour la conversation, les
explications, les questions et les messages de commit. **Le code, les identifiants et
les noms de fichiers techniques restent en anglais** — sauf le Rust de `src-tauri/`, dont
les identifiants sont en français : le code en place fait foi, imitez-le.

Si la réponse a déjà été donnée dans la session, ne pas redemander.

---

## Le produit en trois phrases

DoraBase est un explorateur de bases de données desktop macOS : la densité de
l'explorateur d'IntelliJ, sans l'IDE, et plus soigné que phpMyAdmin ou pgAdmin. La stack
est **Tauri 2 + React / TypeScript / Vite**, choisie pour que les deux composants les plus
coûteux — grille dense et éditeur de code — soient déjà résolus par l'écosystème web.
Quatre moteurs répondent : PostgreSQL, MySQL / MariaDB, SQLite, MongoDB.

Dix écrans sont assemblés et atteignables : accueil, nouvelle connexion et son échec,
explorateur, visualiseur, édition inline, console SQL, console MongoDB, structure et DDL,
préférences.

---

## Le design : ce que le code ne dit pas

### L'intention

Le nom et l'identité s'inspirent de « Dora l'exploratrice » : registre écolier, papier
crème, sac à dos, carte. **Le ton reste celui d'un outil de travail dense — pas d'un
jouet.** Référence visuelle « shadcn-like » : composants classiques, bordures fines, coins
arrondis modérés, icônes **en trait** (stroke, jamais de fill).

L'application était construite à partir d'un handoff haute fidélité, respecté au pixel.
Ce handoff est retiré : **l'état actuel de l'application fait foi**. Ce qui suit est ce
qu'il portait et que le rendu ne dit pas.

### Les prohibitions — les respecter, ne pas les « corriger »

- **N'inventez aucun état de survol.** Seuls trois en ont un : les lignes d'arbre, les
  lignes de tableau (`--hover-row`) et le bouton secondaire. Un survol ailleurs serait une
  valeur qui n'est ni dans les jetons ni dans une maquette. La galerie l'affiche
  franchement ; ce n'est pas un oubli.
- **Aucune couleur littérale hors `src/design/tokens.json`.** Garde-fou : `pnpm tokens:check`.
- **L'échelle d'espacement n'a pas de 8 px** : 3, 5, 6, 7, 9, 11, 14, 16. Un littéral
  commenté vaut mieux qu'un jeton approximatif choisi « parce que ça se ressemble ».
- **Les raccourcis affichés sont à opacité `.6`**, une valeur représentative — la source
  variait `.5`/`.6`/`.7` selon l'instance, et trois props ne valaient pas ce gain.
- **Pas de composant natif** pour les listes déroulantes : la liste maison partout.
- **Un `var()` vers un jeton inexistant ne casse rien de visible** — ni TypeScript, ni
  Vitest, ni l'œil. Vérifiez qu'un jeton existe avant de l'employer.

### Les arbitrages, avec leur raison

- **Grisé plutôt que masqué, quand la valeur existe mais n'est pas saisie.** Le port et le
  mot de passe derrière un proxy Cloud SQL sont grisés avec un `title` qui dit pourquoi :
  les faire disparaître dirait que la connexion n'a ni port ni mot de passe, alors qu'elle
  a les deux. **Masqué** est le bon choix à l'inverse pour les cinq champs qu'un moteur de
  fichier (SQLite) n'a réellement pas.
- **Un bouton inerte mais actif fait croire à un bug — davantage qu'un bouton désactivé.**
  Quand un écran entier est inerte, désactiver avec une infobulle qui nomme ce qui manque.
  Quand un seul bouton l'est et que sa suite arrive, le laisser actif. Les deux arbitrages
  coexistent, et c'est délibéré.
- **La jointure de deux panneaux est un trait, pas une zone.** 1 px de `--divider` en
  permanence, 3 px assombris au survol et au focus. La zone de saisie garde 5 px : ce
  qu'on voit et ce qu'on peut attraper sont deux mesures différentes. Une jointure n'a
  rien à dire — elle sépare.
- **Une seule colonne de droite**, dont le contenu suit l'écran. La barre d'état court
  **sous** les trois colonnes : elle vit au niveau de l'écran, pas du centre.
- **La sidebar a la même largeur partout**, y compris devant l'explorateur : une coquille
  unique ne peut pas être deux largeurs, et la colonne sauterait à l'ouverture d'un
  onglet. Elle prend la largeur de son `SplitPane` au lieu de l'imposer — sinon la poignée
  ne déplacerait rien. Un mockup figé ne peut pas exprimer un panneau que l'utilisateur
  déplace ; c'est la raison de tous les écarts de cote restants.
- **Aucune modale ne nomme un objet à sa création.** Une console prend « console N », le
  plus petit numéro libre. Nommer avant d'avoir écrit revient à demander un titre pour une
  page blanche. Le renommage se fait **sur place**, au double-clic, sur la ligne d'arbre
  comme sur l'onglet : `Entrée` valide, `Échap` abandonne, la perte de focus valide.
  L'entrée « Renommer… » du menu « … » subsiste — un geste qui n'existe qu'au double-clic
  est invisible et inatteignable au clavier.
- **`esc` dans un champ rend le focus, il ne ferme pas la modale.** Un second `esc` ferme ;
  depuis un bouton, la fermeture est immédiate — il n'y a pas de saisie à abandonner.
- **Aucune correction automatique dans les champs.** macOS transformait `localhost` en
  `Localhost` et le nom qu'on tapait dans un champ de renommage. Les quatre attributs
  vivent dans `Field` et doivent être réemployés par toute saisie qui n'y passe pas.

### La règle « ligne liée »

Pour une clé étrangère, n'afficher l'aperçu de la ligne cible que si elle contient au
moins un champ lisible par un humain — liste blanche insensible à la casse : `email`,
`name`, `label`, `title`, `first_name`/`firstName`, `last_name`/`lastName`, `username`,
`slug`, `code`, `reference`. Sinon, ne rien afficher : pas de dump d'identifiants
techniques. Mentionner les champs détectés en légende.

### Accessibilité — quatre pièges qui se sont répétés

1. **Le nom accessible se concatène sans espace.** « Tables8 », « orders1.9 M » : quatre
   occurrences. Dès qu'un composant place deux contenus côte à côte, l'espace doit être
   **explicite**, et dans le composant — pas chez l'appelant.
2. **`aria-label` sur un élément sans rôle est ignoré** — trois occurrences, Biome le
   signale à chaque fois et a raison à chaque fois. Quand un élément est la décoration
   d'un contrôle, l'information va dans le **nom du contrôle**, par du texte masqué en
   `clip-path` — jamais `display: none`, qui le retirerait de l'arbre d'accessibilité.
   L'ordre de ce texte décide de l'ordre de lecture : le placer en dernier.
3. **`aria-disabled` plutôt que `disabled` quand un bouton porte une explication.** Un
   `<button disabled>` ne reçoit ni focus ni survol : son infobulle serait inatteignable,
   exactement là où elle est le plus utile.
4. **Une infobulle *décrit*, elle ne *nomme* pas** : `aria-describedby`, jamais
   `aria-label`, qui ferait s'annoncer le contrôle par sa limite plutôt que par sa
   fonction.

**Les assertions de test passent par `getByRole` avec nom accessible**, et le motif doit
être **ancré** : `/orders/` compte aussi `orders_by_day`. Biome n'a aucune règle de nom
accessible — ces tests sont le seul garde-fou du projet sur ce point.

---

## Décisions prises, et pourquoi

Celles qu'il ne faut pas rejouer — sans leur raison, elles seront défaites.

**Tauri 2 plutôt que Kotlin.** La demande initiale était « Kotlin, multiplateforme, sans
runtime Java » : cette combinaison n'existe pas sous forme viable — Compose for Desktop
n'existe que sur JVM, et il n'y a pas de toolkit UI Kotlin/Native mature.

**Plancher macOS 13 Ventura, soit Safari 16.4**, pour que `oklch()` et
`color-mix(in oklab, …)` soient couverts. `build.target`, `build.cssTarget` et
`bundle.macOS.minimumSystemVersion` doivent rester alignés.

**Aucun jeu de résultats complet ne traverse l'IPC.** Le cœur Rust détient les résultats ;
la webview ne reçoit que la fenêtre visible. La **récupération** est paginée, pas seulement
le rendu. C'est ce qui garde l'empreinte mémoire plate quelle que soit la table, et le
principal mode de défaillance à éviter dans un client de bases écrit en Tauri. La
contrainte est portée par un type : `RowLimit` est une énumération fermée (100 / 500 /
1000 / 5000) — « demander tout » n'est pas exprimable. Et aucune commande ne rend « tout
le catalogue ».

**Une seule identité pour une connexion** : `projet/base/environnement`. C'est à la fois
la clé du registre et la référence du secret dans le Trousseau. Deux conventions
divergeraient. Corollaire : **l'identifiant d'un environnement est figé à sa création** —
le renommer change son **libellé seulement**, et installe une divergence assumée entre ce
qui s'affiche et ce qui désigne.

**L'arbre se lit sans réseau.** La configuration ne demande aucune connexion : l'arbre
s'affiche immédiatement et chaque base porte son état. Une base injoignable reste
**visible et marquée**, jamais masquée ni bloquante — attendre les connexions bloquerait
l'écran jusqu'à 30 secondes sur un seul hôte muet. Conséquence : les états sont **quatre**,
pas deux, et « jamais tentée » n'est pas « hors ligne ».

**Un filtre et un tri partent au serveur**, ils ne trient pas la fenêtre reçue. Filtrer
cinq cents lignes déjà lues serait immédiat et faux : l'utilisateur croirait voir toutes
les lignes qui correspondent. Les tests portent donc sur la **requête envoyée**.

**Le stockage des identifiants est abstrait derrière une interface** : Trousseau en release
signée, fichier chiffré en développement. Les ACL du Trousseau sont liées à la signature
de code, et une signature ad-hoc change à chaque build. L'abstraction est de toute façon
nécessaire, Windows et Linux n'ayant pas de Trousseau.

**L'environnement est un palier de l'arbre**, pas un réglage global : projet →
environnement → connexion → console|schéma → objet. Un sélecteur global obligeait à
basculer un réglage pour regarder une connexion voisine, et refaisait de l'environnement
une propriété du **projet** là où c'est une propriété de la **connexion**. La barre de
titre n'est plus qu'un **indicateur passif**. Conséquence à ne pas perdre : **les
identités de nœud portent l'environnement** — six défauts sont nés de garanties adossées à
ce que l'écran *montrait*, dont deux qui lisaient franchement le mauvais serveur.

**Clé d'hôte SSH vérifiée contre `~/.ssh/known_hosts`**, hôte inconnu refusé avec un
message qui donne la manœuvre. Quatre verdicts distincts là où `russh` n'en offre que
deux. **L'écran de confiance à la première connexion serait la vraie réponse** — il reste
à faire.

**Le binaire `cloud-sql-proxy` est embarqué dans le bundle, et l'embarqué gagne contre le
`PATH`.** Version épinglée dans `src-tauri/cloud-sql-proxy.lock`, empreinte SHA-256
vérifiée par `scripts/telecharger-proxy.sh`, binaire jamais commis. Si le `PATH` passait
devant, le comportement dépendrait de ce que l'utilisateur a installé, et un proxy d'une
autre version pourrait écrire des journaux que la détection de disponibilité ne reconnaît
pas. Le `PATH` reste en repli pour `cargo run`/`cargo test`, sans sidecar.

**L'authentification passe par les identifiants par défaut de l'application (ADC), et
`--gcloud-auth` est écarté** : il exigerait `gcloud` dans le `PATH` du sous-processus —
celui d'une app lancée depuis le Finder est minimal. Embarquer le binaire supprimait une
dépendance au `PATH` ; `--gcloud-auth` en réintroduirait une, plus fragile, pour économiser
un login unique.

> **Jamais « authentifiez-vous avec gcloud ».** `gcloud auth login` et
> `gcloud auth application-default login` se ressemblent, ouvrent toutes deux un
> navigateur, et **seule la seconde** écrit le fichier que les bibliothèques clientes
> lisent. Un message doit porter la ligne à copier, et dire que l'autre ne suffit pas.

**Une seule voie d'authentification Cloud SQL** : le champ « Compte de service » a été
retiré. Deux voies obligeaient à choisir laquelle explique un échec, et la voie saisie
était la moins employée tout en étant la seule à devoir être persistée, migrée, projetée
et traduite entre `''` et `null`. `GOOGLE_APPLICATION_CREDENTIALS` reste lue par le proxy
sans qu'on la lui passe : **le champ est fermé, pas la voie.**

**L'authentification IAM n'a pas de bascule, elle est toujours active.** Un interrupteur
dont une position n'est jamais choisie coûte un champ persisté, une conversion, un état
d'écran et deux chemins à tester. Piège associé : `tokio-postgres` échoue **avant tout
échange** si le serveur réclame un mot de passe et qu'aucun n'a été configuré —
l'application configure donc une chaîne **vide**, comme `psql` où l'on valide l'invite
sans rien saisir ; un secret enregistré gagne toujours.

**Convention Rust à 4 espaces**, pas de `rustfmt.toml` alignant Rust sur le JS du projet.

### La publication : un tag, et rien d'autre

**Le tag est le déclencheur, le commit ne l'est pas.** `ci.yml` tourne sur chaque push et
chaque PR ; `publication.yml` ne tourne que sur un tag `vX.Y.Z`, motif **ancré** sur les
trois nombres. Une release est un geste, pas un effet de bord d'un push — et un motif large
(`v*`) accepterait `v1.2` ou `v0.1.0-essai`, dont le nom de bundle n'a été décidé par
personne. Le format de version est fermé pour la même raison : un suffixe de pré-version
traverserait `Info.plist`, le nom du `.dmg` et le nom du tag sans que quiconque ait tranché
ce qu'il y devient.

**Le numéro de version vit à trois endroits qui ne se parlent pas** : `package.json` — le
seul que `tauri.conf.json` lise, donc celui qui finit dans l'`Info.plist` et dans le nom du
`.dmg` —, `src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`. Rien dans l'outillage ne les
relie : relevés à la main dans deux fichiers sur trois, ils laissent la CI verte et publient
un `.dmg` dont le nom contredit son `Info.plist`. D'où `scripts/version.sh`, qui les écrit
d'un geste, et `scripts/verifier-version.py`, qui refuse la divergence — appelé par
`verifier-tout.sh`, par la CI, par le script de relèvement sur sa propre sortie, et par le
workflow de publication **avec le numéro du tag en argument**.

**Le bundle publié est universel.** `--target universal-apple-darwin`, donc les deux
architectures du proxy (`pnpm proxy:embarquer:tous`) et les deux cibles rustup. Deux fichiers
séparés obligeraient l'utilisateur à savoir quel Mac il a, question à laquelle un explorateur
de bases de données n'a pas à faire répondre. Conséquence à ne pas perdre : `lipo` **invalide
les signatures** des tranches qu'il fusionne, et une étape vérifie que les deux architectures
sont bien là — une cible mal nommée produirait un bundle mono-architecture au chemin attendu,
publié sous le nom « universal ».

**`"signingIdentity": "-"` dans `tauri.conf.json`** — signature ad hoc, posée par Tauri
**avant** la fabrication du `.dmg`, donc au bon moment. JSON n'accepte pas de commentaire :
la raison est ici. Sans elle, le bundle universel n'est pas signé du tout et macOS le refuse
sur toute machine autre que celle qui l'a construit — un exécutable **embarqué** non signé le
fait refuser à coup sûr. Ce n'est pas une notarisation : l'utilisateur garde un geste au
premier lancement, et le README le dit franchement plutôt que de laisser croire à une
application cassée.

**Les vérifications rapides sont rejouées dans le job de publication** — sabotage, typecheck,
lint, Vitest, `cargo test`. Le tag est censé être posé sur un `main` vert, et le script refuse
de le poser ailleurs ; mais « censé » n'est pas une vérification, et une release est publique.
Playwright et les tests sur base réelle restent dans `ci.yml` : ils demandent un serveur et
quatre décors, et ce job n'a pas à les remonter une seconde fois.

**Un artefact de CI n'est pas une version.** Chaque commit rend son `.dmg` en artefact, gardé
sept jours — sans quoi essayer un commit demandait de le compiler soi-même, alors que
« est-ce que ça se lance ? » ne se tranche qu'en lançant et que Playwright ne pilote pas
WKWebView. Il est **mono-architecture** et réservé aux comptes qui ont accès au dépôt. Et
c'est le `.dmg` seul qui est rendu, pas le `.app` : `upload-artifact` réempaquette dans un zip
qui perd les bits d'exécution et les liens symboliques du bundle, et un `.app` ainsi
transporté ne se lance pas. Le `.dmg` est une image opaque, il traverse intact.

**Baloo 2 restreinte au latin, Nunito et JetBrains Mono complètes.** Le critère n'est pas
« ce sous-ensemble sert-il » mais « cette police rend-elle des données arbitraires ».
Baloo 2 ne porte que du chrome applicatif. Les polices sont **embarquées**, jamais
chargées en ligne.

**Aucune ressource réseau.** La CSP le fait respecter structurellement. `blob:` n'est pas
autorisé — un export par `URL.createObjectURL` sera bloqué. Ne pas élargir la CSP par
anticipation : traiter l'écriture côté Rust.

### La migration du format de configuration

`VERSION_COURANTE` vaut **5**. Les crans successifs sont des passes sur du
`serde_json::Value`, sans type d'ancienne forme à maintenir — c'est pourquoi `migrer` et
les migrations vivent encore dans `config/store.rs` malgré sa taille. **Le déclencheur du
découpage** : la prochaine migration qui demande un `mod vN` de types dédiés. Ce jour-là,
deux d'entre eux cohabiteront, et c'est cette cohabitation — pas le compte de lignes — qui
justifiera le fichier séparé. Deux crans de suite l'ont manqué pour la même raison.

**Ne retirez pas `mod v1`** : la migration v1 → v2 s'en sert pour *déduire les
environnements déclarés*. Un projet dont la seule trace d'un environnement était d'y être
actif perdrait sa déclaration.

**Un champ ajouté avec `#[serde(default)]` ne demande aucun cran** ; un champ **retiré**
en demande un. Et un champ conservé puis vidé (plutôt que supprimé du modèle) est la seule
manière de reprendre des données sans que `serde` les efface en silence.

---

## Acquis techniques — établis par exécution

- **Les capacités Tauri ne gouvernent que les appels IPC venant de la webview.** Elles ne
  restreignent pas ce que fait le code Rust : un menu natif complet s'installe sans la
  permission `core:menu`, et une commande définie par l'app fonctionne sans entrée dans
  `capabilities/default.json`.
- **`core:window:default` n'accorde aucune permission d'écriture** — 0 des 42 disponibles.
  La lecture de géométrie passe, `set_size` est refusé.
- **`data-tauri-drag-region` nu ne rend glissable que l'élément lui-même**, pas son
  sous-arbre. La valeur **`deep`** étend le glissement, et les éléments cliquables le
  bloquent d'eux-mêmes. Nécessite `core:window:allow-start-dragging`.
- **Un WebSocket refusé par la CSP lève un `SecurityError` synchrone** sous WKWebView ; il
  n'échoue pas silencieusement. Du code qui ne l'attrape pas plante net.
- **Une app lancée depuis le Finder n'hérite pas du `PATH` du shell.** macOS lui en donne
  un minimal, sans `/opt/homebrew/bin` ni `/usr/local/bin`. Tout scope qui lance un
  programme tiers doit fouiller les emplacements usuels en plus du `PATH`.
- **Un sous-processus dont personne ne lit la sortie se bloque en écriture** : le tampon du
  système se remplit et l'enfant s'arrête au milieu d'un `write`. Une tâche de drain n'est
  pas un raffinement, c'est une condition de fonctionnement.
- **`JoinHandle::abort` n'est pas synchrone** : il *planifie* l'annulation, et au retour la
  tâche tient encore ses ressources — dont son port local.
- **Les feux tricolores de macOS sont hors d'atteinte du CSS** sous
  `titleBarStyle: "Overlay"` : ils sont dessinés par le système par-dessus la fenêtre.
  Ni grisables derrière une modale, ni capturables par Playwright.
- **`cloud-sql-proxy` v2 écrit son journal courant sur la sortie standard**, pas sur la
  sortie d'erreur — et il ne compose avec l'instance qu'à la **première connexion** : un
  nom d'instance faux le laisse annoncer « prêt », puis échouer en restant vivant.

---

## Ce que les quatre moteurs ont répondu à la même question

À lire avant d'en ajouter un cinquième.

| Question | PostgreSQL | MongoDB | SQLite | MySQL |
| --- | --- | --- | --- | --- |
| Le niveau « schéma » | les schémas de la base | les **bases** du serveur | un seul, `main` | les **bases** du serveur |
| Les colonnes | déclarées | **déduites** par échantillonnage | déclarées, type **suggéré** | déclarées |
| Le DDL | **reconstruit** | les commandes qui recréent la collection | **presque** d'origine | rendu par le serveur |
| Le compte de lignes | estimé (`reltuples`) | estimé | **exact** | estimé (InnoDB) ou **exact** (MyISAM) |
| L'égalité sûre au nul | `is not distinct from` | `$in: [null]` | `is` | `<=>` |
| Les transactions | toujours | jeu de réplicas requis | toujours | InnoDB oui, MyISAM **non** |
| La citation | guillemet double | — | guillemet double | **backtick** |
| La connexion | hôte et port | hôte et port | **un fichier** | hôte et port |

**La ligne de l'égalité sûre au nul a mordu quatre fois** : avec `=`, une modification
partant d'une cellule vide ne trouve aucune ligne, la transaction s'annule, et
l'utilisateur lit « la ligne a changé » sur une ligne que personne n'a touchée.

**Le pari du contrat de moteur a tenu** — les écrans sont écrits en termes du contrat, pas
de PostgreSQL. Cinq écrans ont fonctionné pour MongoDB, SQLite **et** MySQL sans une ligne
de code propre au moteur. Trois exceptions seulement, toutes dans l'écran et non dans le
contrat : la console mongo (dialecte de l'éditeur), la section « Schéma déduit », et les
cinq champs qu'un moteur de fichier masque.

**Redis n'entre pas dans ce contrat**, et c'est une conclusion, pas un retard : un espace
de clés n'est pas un tableau, et l'y forcer donnerait des écrans qui affichent des
colonnes inventées. Il lui faut son propre écran, qui n'est pas conçu.

---

## Vérifier : neuf règles tirées des défauts rencontrés

Celles-là se sont **répétées**, et c'est ce qui en fait des règles plutôt que des
anecdotes.

1. **Un test vert ne prouve rien tant qu'un sabotage ne l'a pas fait tomber.** Le contrôle
   négatif se fait par sabotage, pas par relecture : retirer la ligne soupçonnée du sujet
   et constater que la suite reste verte. Un test qui reste vert sous sabotage doit être
   **réécrit** — c'est arrivé quatre fois.

2. **Vérifier le chemin, pas seulement le résultat visible.** Saboter la pagination
   laissait vert le test « la fenêtre rend 500 lignes » — ramener cent mille lignes puis
   n'en garder que cinq cents satisfait la lettre de l'exigence. L'image de test SSH
   livrait `AllowTcpForwarding no` pendant que le test « un tunnel s'ouvre » passait.
   Quand la contrainte porte sur le chemin, mesurer le chemin : un coût, un aller-retour
   réel.

3. **Un décor de test trop régulier ne mesure que le décor.** Neuf défauts du premier
   usage réel tenaient tous à une régularité : colonnes exotiques nulles **partout**,
   tables toutes analysées, numéros d'attribut qui coïncident par hasard entre deux
   tables, grille de démonstration plus étroite que son cadre. Avant d'écrire un test,
   demander **ce que le décor rend indiscernable** — une colonne vide et un type mal lu,
   une table vide et une table jamais analysée, un chevauchement et une découpe par
   `overflow` — puis rendre les deux distinguables.

4. **Un composant vérifié pièce par pièce n'est pas un écran livré.** Un écran entier
   fidèle et testé n'avait jamais été vu **dans l'application** : tous ses tests visaient
   la galerie, qui donne la même image. Même motif pour trois couches complètes que
   personne ne franchissait. **Au moins un test doit partir de `/`.**

5. **jsdom ne calcule aucune mise en page.** Toute exigence de hauteur, largeur, position
   ou superposition est structurellement hors de portée de Vitest et va dans `e2e/`. Et
   il faut mesurer la valeur **calculée**, pas le rectangle : celui-ci inclut les bordures
   et masque un écart derrière un arrondi.

6. **Un niveau de test manque toujours : celui qui n'appartient à aucun écran.**
   `e2e/geometrie-reelle.spec.ts` existe pour ça, à la taille de fenêtre réelle : rien ne
   franchit le bord droit **et** la racine ne défile pas horizontalement (les deux
   ensemble, un enfant coupé par un ancêtre en `overflow: hidden` échappant à la
   première) ; la grille défile bien **au geste**, molette comprise ; les libellés tiennent
   dans leurs boutons. Chaque composant peut être juste dans sa vitrine et faux dès qu'un
   voisin décide sa largeur.

7. **Les outils qui vérifient doivent eux-mêmes pouvoir échouer.** `cmd | tail` fait
   porter le statut de sortie par `tail`, et « TOUT VERT » s'est affiché avec trois
   vérifications rouges — d'où `scripts/verifier-tout.sh`, qui ne tronque rien. Un garde
   écrit contre une famille de fichiers ne couvre pas celle qu'elle engendre. Un
   `biome-ignore` doit être la **dernière** ligne de commentaire avant le nœud. Et
   `git checkout -- fichier` restaure depuis l'**index** : un sabotage qui y a été ajouté
   est réinstallé par la « restauration » censée l'enlever.

8. **« ÉCHEC à l'étape X » ne dit pas que X a échoué pour la raison qu'on croit.** Lire
   `gh run view --log-failed`, pas seulement le nom de l'étape — la vraie cause est
   souvent en amont *dans* la même commande. Et tout échec de CI n'est pas un défaut du
   code : une panne de GitHub Actions se relance, elle ne se corrige pas.

9. **Quand un scope ajoute une dépendance à un fichier absent du dépôt, la question n'est
   pas « le script qui le fabrique est-il appelé ? » mais « que voit un clone neuf ? ».**
   Un `externalBin` déclaré fait exiger le fichier par **toute** compilation — `cargo
   build`, `cargo test`, `clippy` —, pas seulement par le bundle. Rien ne l'avait vu parce
   que le binaire était présent sur la machine de développement depuis l'écriture du scope.

10. **Ce qu'un double de test émet doit venir d'une observation de l'original** — et une
    observation faite avec `2>&1` ne dit rien de la séparation des flux. Un faux binaire
    en shell peut couvrir tout le pilotage d'un sous-processus et se tromper sur le seul
    point qui compte.

**Et la méthode qui a le plus payé** : mesurer le rendu dans un navigateur plutôt que lire
des valeurs déclarées, et comparer deux captures **côte à côte**. Une mesure vérifie une
hypothèse ; un inventaire visuel en révèle l'absence.

---

## Ce que l'outillage ne peut pas voir

**Playwright ne pilote pas WKWebView.** `pnpm dev` est entièrement vérifiable — mesures,
captures, comparaison au pixel. `pnpm tauri dev` compile et s'exécute, mais **la fenêtre
native elle-même ne peut pas être vue**. Piloter le bureau par frappes synthétiques a été
tenté puis abandonné : la fenêtre ne passait pas au premier plan, donc les frappes
risquaient d'atterrir dans les applications de l'utilisateur. **Demander, ne pas forcer.**

Restent quelques observations qu'aucun test ne peut faire, et qu'il ne faut jamais
présenter comme vérifiées tant qu'un humain ne les a pas faites :

- **Renommer une connexion, quitter l'application, la relancer.** Elle doit reparaître sous
  son nouveau nom et s'ouvrir **sans redemander son mot de passe** — c'est ce qui prouve
  que le secret a changé de référence dans le Trousseau réel, et non dans le magasin
  chiffré de développement.
- **Construire un bundle, le lancer depuis le Finder** sur une machine où `cloud-sql-proxy`
  n'est pas installé, et ouvrir une connexion Cloud SQL. Seule preuve du sidecar embarqué
  et du `PATH` minimal d'une app graphique.
- **Télécharger le `.dmg` d'une release depuis un *autre* Mac**, le glisser dans
  *Applications* et le lancer. C'est la seule preuve du chemin réel : quarantaine posée par le
  navigateur, signature ad hoc acceptée ou non, et le geste du README exact — le libellé du
  bouton de *Réglages Système* change d'une version de macOS à l'autre. La CI vérifie que le
  bundle est signé et universel ; elle ne peut pas vérifier ce que Gatekeeper en fait chez
  quelqu'un d'autre, la machine qui construit étant celle qui signe.
- **Régler « Afficher les barres de défilement : toujours »**, puis regarder la sidebar et
  la bande d'onglets. Chromium sans tête rend des barres en survol, qui n'occupent aucune
  place : la mesure vaut 0 avec comme sans la correction.
- **Défocaliser l'application.** Les trois feux doivent rester visibles (grisés) ; ils
  disparaissent. Dessinés par le système, donc ni reproductible ni corrigeable depuis le
  web. L'expérience à tenter est de passer `hiddenTitle` à `false` le temps d'un lancement.
- **Le Trousseau entre deux builds.** Les tests `#[ignore]` passent contre le vrai
  Trousseau, mais ils écrivent et relisent dans le **même processus**, donc sous la même
  signature ad-hoc. La crainte réelle est qu'une entrée écrite par un build soit illisible
  par le suivant. L'expérience qui trancherait demande de scinder l'aller-retour en deux
  tests — un qui écrit, un qui relit.

---

## Deux pièges propres à cette machine

**`cargo` n'est pas dans le `PATH`** des commandes shell de cet outillage : `~/.zshenv`
source `~/.cargo/env`, mais ce shell ne le relit pas.

```bash
export PATH="$HOME/.cargo/bin:$PATH"   # devant toute commande cargo ou tauri
```

**Plusieurs worktrees de ce dépôt travaillent en parallèle, et le premier `pnpm dev`
démarré prend 5173.** Playwright ne réutilise donc **plus jamais** de serveur et démarre le
sien en `--strictPort`. Le symptôme d'un conflit est trompeur — tous les tests expirent à
30 s, ou les captures diffèrent de 10 % des pixels, ce qui ressemble trait pour trait à
une régression de rendu. Le réflexe est de regarder qui écoute avant de chercher dans le
code :

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN   # à qui appartient ce serveur ?
export DORABASE_E2E_PORT=5399      # un port à soi, par worktree
```

**`tsc --noEmit` ne vérifie rien.** Le `tsconfig.json` de la racine porte `"files": []` et
deux `references` : c'est un fichier de solution, et la forme `--noEmit` sort 0 sans
regarder `src`. **C'est `pnpm typecheck` (`tsc -b`) qui mord**, et c'est celui de la CI.

---

## Décors de test : rien de réel

Les tests, les décors de démo (`?demo`) et la galerie ne doivent **jamais** porter la
structure d'une base réelle du commanditaire — ni noms de tables, ni noms de colonnes, ni
noms de bases, ni identifiants, ni ports.

**Pourquoi :** un dépôt, une capture d'écran, un rapport de test ou un artefact de CI
publie ce qu'il contient. Un décor de test n'a jamais besoin d'être vrai, seulement
**cohérent** — et les propriétés qu'on mesure (une bande d'onglets qui déborde, une colonne
trop longue) dépendent des longueurs et des quantités, pas des noms.

**En pratique :** tous les noms sont **inventés** — projets, bases, tables, colonnes,
hôtes. Les identifiants de connexion sont fictifs, et `localhost:5432`.

Le 19 août 2026, le dépôt a été relu entièrement pour retirer le nom du commanditaire et
celui de son projet, présents dans 506 endroits : décors de test, démo, galerie, captures
de fidélité, identifiant de bundle, service du Trousseau. L'historique Git a été réécrit
dans le même mouvement. Un nom réel dans un décor ne se remarque plus une fois écrit :
c'est à l'écriture qu'il faut le refuser.

**Cinq décors, et chacun sert en local *et* en CI** — une variante CI qu'on ne peut pas
essayer localement finit par diverger de ce qu'on croit qu'elle fait.

| Décor | Script | Particularité, et pourquoi |
| --- | --- | --- |
| PostgreSQL | `scripts/pg-test.sh` | **TLS activé**, certificat dont le nom ne correspond pas — sans quoi `verify-ca` et `verify-full` seraient indistinguables |
| MongoDB | `scripts/mongo-test.sh` | jeu de réplicas à un nœud — sans quoi l'écriture ne testerait que son refus |
| MySQL | `scripts/mysql-test.sh` | `--default-character-set=utf8mb4` — sans quoi le décor entre en latin1 |
| SQLite | `scripts/schema-test-sqlite.sql` | un fichier temporaire que le test crée : **aucun conteneur**, donc il passe sur une machine sans Docker |
| Bastion SSH | `scripts/bastion-test.sh` | un vrai serveur SSH |

**Sans le bastion, `cargo test --features db-tests` échoue** sur les tests de tunnel — ils
*paniquent* au lieu de se sauter, contrairement à ceux de PostgreSQL. Incohérence connue,
sans conséquence tant que le décor est monté.

---

## Commandes

**Avant tout commit — la barrière, une seule commande.** Elle lance ce que lance la CI, ne
tronque rien, et **échoue vraiment**. Sans `DORABASE_TEST_PG`, les tests sur base réelle
sont sautés — et elle le dit à l'écran plutôt que de les taire.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export DORABASE_TEST_PG="postgres://dorabase:dorabase-test@localhost:55432/dorabase_test"
export DORABASE_TEST_MONGO=$(./scripts/mongo-test.sh demarrer)
export DORABASE_TEST_MYSQL=$(./scripts/mysql-test.sh demarrer)
export DORABASE_E2E_PORT=5399
./scripts/bastion-test.sh demarrer /tmp/bastion && . /tmp/bastion/bastion.env
./scripts/verifier-tout.sh
```

```bash
pnpm dev            # serveur Vite ; `?gallery` affiche la galerie, `?demo` le décor de démo
pnpm tauri dev      # l'app (bloquant, ouvre une fenêtre)
pnpm test           # Vitest
pnpm test:e2e       # Playwright, webServer auto
pnpm typecheck      # tsc -b — le seul qui compile quelque chose
pnpm lint           # Biome
pnpm tokens:check   # garde-fou : échoue si tokens.css/ts ont été édités à la main
./scripts/version.sh correctif|fonction|majeur|X.Y.Z   # relève les 3 fichiers, committe, tag
                                                       # ne pousse rien ; le README décrit le flux
pnpm domain:check   # idem pour les projections ts-rs (exige un arbre git propre)

cd src-tauri && cargo test --features db-tests   # avec les décors
cd src-tauri && cargo test                       # sans décor
```

**Fichiers générés, jamais édités à la main** : `src/design/tokens.css`,
`src/design/tokens.ts` (depuis `tokens.json`) et `src/domain/*.ts` (depuis Rust, par
`export-types`). **Un fichier généré n'a qu'un seul producteur** — c'est la leçon
d'`export-types`, dont le couplage à `cargo test` corrompait `config.ts` en silence.

`src/design/icons/sprite.svg` et `src/design/icons/names.ts` étaient extraits du mockup de
handoff ; celui-ci ayant été retiré, **ce sont désormais des sources**, éditées à la main.
Les icônes sont des SVG en trait, `viewBox 0 0 24 24`, `fill: none`, `stroke-width` 1.8–2.2
(2.4–2.6 pour les chevrons), extrémités et jointures arrondies.

---

## Ce qui attend une décision humaine

Aucun de ces points ne bloque le code en place.

- **Redis** — un écran de parcours de clés à concevoir. Le forcer dans le contrat de moteur
  donnerait des colonnes inventées.
- **Snowflake et BigQuery** — un compte d'essai pour chacun. Sans décor, l'adaptateur
  serait le premier code du projet dont aucun test ne dirait s'il fonctionne.
- **L'export CSV est un sujet, pas un bouton.** Outre `blob:` refusé par la CSP, il reste à
  trancher la fenêtre ou le résultat complet, l'encodage, le séparateur, le traitement des
  `NULL` et des sauts de ligne. Sur 1,9 million de lignes l'écriture doit être en flux,
  donc côté Rust. Le bouton est livré désactivé, avec l'infobulle qui le dit.
- **Le patch inverse persisté** — où l'écrire, sous quelle forme, et ce qu'il advient d'un
  patch dont la base a changé. Le garde-fou est livré **désactivé avec sa raison** plutôt
  qu'allumé sans effet.
- **Le thème « Nuit »** — le mécanisme existe (`data-theme` sur la racine, suivi de
  `prefers-color-scheme`) et l'écran le dit ; les valeurs sombres des cent jetons de
  `tokens.json` sont un travail de design.
- **L'écran de confiance SSH à la première connexion**, aujourd'hui contourné par un refus.
- **Une variante d'icône simplifiée sous 32 px** : la carte du sac à dos devient un amas de
  pixels. Visible au Dock réduit, en vignette Finder, en barre des menus.
- **Un Developer ID pour *diffuser*** (Gatekeeper, notarisation). Décision d'achat. La
  diffusion existe désormais sans lui — `publication.yml` publie un `.dmg` universel signé en
  **ad hoc**, et le README porte le geste de contournement au premier lancement. Ce que le
  Developer ID achèterait, c'est la disparition de ce geste : une installation sans mise en
  garde. **La notarisation avec un binaire embarqué n'est toujours pas vérifiée**, et cela ne
  se voit qu'**après** distribution.
- **Le visage Cloud SQL n'a jamais été conçu** : ses champs et ses libellés sont inventés.
  Un nom d'instance est long et prend trois colonnes de la grille, ce qui n'a pas été
  composé.
- **Déplacer une connexion d'un environnement à un autre** n'existe pas, délibérément : cela
  demande de déplacer un secret du Trousseau, donc son geste et sa conception. La
  confirmation de suppression ne le propose pas — offrir une action absente est pire que
  son absence.

---

## Réserves connues

- **`verify-ca` — vérifier la chaîne sans vérifier le nom — n'est disponible que pour
  PostgreSQL.** Les pilotes MySQL et MongoDB ne savent pas l'exprimer, et le premier a même
  un drapeau silencieusement sans effet. Les deux **refusent avec leur raison** plutôt que
  de remplacer le mode en silence.
- **Le chemin heureux Cloud SQL contre une vraie instance n'a jamais été exercé.** Tout le
  pilotage du sous-processus est couvert par un faux binaire en shell, mais aucun test n'a
  parlé à Google. Le test se déverrouille avec `DORABASE_TEST_CLOUDSQL_INSTANCE`,
  `_DATABASE`, `_USER`, plus `_PASSWORD` ou `_CREDENTIALS`.
- **Une instance IAM réelle n'a pas été observée** depuis ce poste.
