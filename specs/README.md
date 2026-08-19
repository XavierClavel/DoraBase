# Specs DoraBase

Index des specs. Une spec = un scope minimal, relisable en quelques minutes.
Voir `../AGENTS.md` pour les règles de rédaction.

## Stack retenue

**Tauri 2** (coquille native + cœur Rust) + **React / TypeScript / Vite** (UI),
**CSS Modules** sur variables CSS. macOS d'abord, Windows et Linux gardés ouverts
par construction.

Décisions structurantes et leur justification : voir `01-socle-tauri.md` § Approche.

## Contrainte d'architecture transverse

**Aucun jeu de résultats complet ne traverse l'IPC.** Le cœur Rust détient les
résultats ; la webview ne reçoit jamais que la fenêtre visible de lignes. La
récupération est paginée, pas seulement le rendu. C'est ce qui garde l'empreinte
mémoire plate quelle que soit la taille de la table — et le principal mode de
défaillance à éviter dans un client de bases écrit en Tauri.

S'applique à `06` (couche moteur) et `10` (visualiseur), et à toute spec qui
transporte des lignes.

## Acquis techniques à connaître

Établis par exécution pendant l'implémentation du socle. Ils évitent des impasses.

**Les capacités Tauri ne gouvernent que les appels IPC venant de la webview.** Elles ne
restreignent pas ce que fait le code Rust. Prouvé : un menu natif complet, accélérateurs
compris, s'installe sans la permission `core:menu` ; et une commande définie par l'app
fonctionne sans aucune entrée dans `capabilities/default.json`. Conséquence pour les specs
à venir : persistance de la géométrie des panneaux, onglets, préférences, export — tout ce
qui sera écrit comme commande Rust du projet passe hors ACL.

**`core:window:default` n'accorde aucune permission d'écriture** — 0 des 42 disponibles.
La lecture de géométrie passe, `set_size` est refusé. Ça concerne la taille de la
**fenêtre**, pas la géométrie des panneaux, qui est de la mise en page DOM persistée en
données. Si `03` veut restaurer la taille de fenêtre : ajouter
`core:window:allow-set-size`, ou le faire côté Rust au démarrage.

**Un WebSocket refusé par la CSP lève un `SecurityError` synchrone** sous WKWebView, il
n'échoue pas silencieusement. Du code qui ne l'attrape pas plantera net.

## À trancher avant certaines specs

Points établis par les relectures d'implémentation, qui ne peuvent pas être décidés au
moment où ils se posent sans coûter un retour en arrière.

**L'éditeur de la console SQL — tranché le 12 août 2026 : CodeMirror 6.**

`01` justifiait le choix de Tauri par « les deux composants les plus coûteux — grille dense et
éditeur de code — déjà résolus par l'écosystème web ». La grille, elle, a été écrite à la main
(`10a`) parce que la virtualisation d'un tableau dense est plus simple que ses dépendances. L'éditeur
non : le placement du curseur, la sélection au clavier, l'annulation et la composition des caractères
accentués sont quatre sujets où un éditeur maison se casse discrètement.

Monaco a été écarté : ~2 Mo pour une console de requêtes, et une surface conçue pour un IDE. Voir
`12b`.

**Le SQL arbitraire de la console — tranché le 12 août 2026 : exécution libre, confirmation si
destructif.**

`DELETE`, `TRUNCATE`, `DROP`, `ALTER` et `UPDATE` sans `WHERE` demandent une confirmation qui
récapitule, sur le modèle de `11d`. La détection est syntaxique donc approximative, et volontairement
**large** : demander une confirmation de trop est un inconfort, manquer un `DROP` ne l'est pas. Ce
n'est pas un garde-fou de sécurité — qui veut écrire écrira — mais contre la faute de frappe, qui est
le vrai risque d'une console. Voir `12c`.

**Signature de code et Trousseau — tranché : le stockage des identifiants sera abstrait.**

Le problème : les ACL du Trousseau macOS sont liées à la **signature de code**. Le bundle
est signé en ad-hoc (`flags=0x20002(adhoc,linker-signed)`, aucune `signingIdentity`), et
une signature ad-hoc change à chaque reconstruction — donc un outil qui range des
identifiants dans le Trousseau redemanderait l'autorisation à chaque build, et les entrées
d'un build seraient illisibles par le suivant.

La décision : `05` définit une **interface de stockage des identifiants** avec deux
implémentations — Trousseau pour les builds signés, fichier chiffré local en
développement. Le choix se fait au démarrage selon la signature effective.

Pourquoi cette forme plutôt qu'obtenir un Developer ID d'abord : l'abstraction est de
toute façon nécessaire, puisque Windows et Linux n'ont pas de Trousseau et sont des cibles
gardées ouvertes. Elle découple donc `05` d'une décision d'achat, sans rien coûter en
complexité inutile. Un Developer ID reste **requis pour toute diffusion** — Gatekeeper et
notarisation — mais cette échéance n'a pas à bloquer le développement.

Le badge vert « Trousseau » du handoff (écran A2) reste donc exact en release, et devra
refléter honnêtement le mécanisme réellement utilisé en développement.

**L'icône n'est pas lisible à 32 px — dette assumée, à reprendre avant diffusion.** Le handoff prévient que le tracé
doit être simplifié sous cette taille, et la génération l'a confirmé : le sac à dos reste
identifiable, mais la carte de la poche latérale se réduit à un amas de pixels colorés
sans forme reconnaissable. C'est visible là où macOS utilise les petites tailles — Dock
réduit, vignette Finder, barre des menus. Il faut une **variante simplifiée du tracé**
pour les petites tailles : silhouette plus grossière du repli de carte, sans les tracés
fins. Travail de design, à fournir avant de considérer l'identité de l'app terminée.

**Clé d'hôte SSH : le design ne tranche pas, `06e` tranche par défaut.** Un tunnel sans
vérification de la clé d'hôte est vulnérable à un intermédiaire — ce contre quoi un
bastion est justement censé protéger. Mais le handoff ne maquette ni fichier
`known_hosts`, ni invite « faire confiance à cet hôte ». `06e` retient donc la
vérification contre le `~/.ssh/known_hosts` de l'utilisateur, un hôte inconnu faisant
échouer la connexion avec une erreur qui dit quoi faire.

C'est le compromis le plus honnête sans écran, **mais ce n'est pas la bonne réponse** :
une invite de confiance à la première connexion le serait. À trancher avec le design
avant diffusion — un utilisateur dont le bastion n'est pas déjà dans son `known_hosts`
devra passer par un `ssh` manuel, ce qui est une friction réelle.

**Cinq trous du handoff sur `A2`/`A3`, relevés en écrivant `08a`–`08e`** (7 août 2026).
Aucun n'est bloquant : chaque spec prend le minimum défendable et le dit. Mais ce sont
cinq endroits où le mockup ne répond pas, et où la vraie réponse appartient au design.

1. **À quoi ressemble un `dev` actif ?** Le mockup ne montre les trois boutons
   d'environnement que dans un seul état : `dev` et `staging` inactifs, `prod` actif *et*
   rouge. Le rouge est une propriété de « prod », pas de « actif » — la prose le confirme.
   Reste que l'état actif de `dev` et `staging` n'est maquetté nulle part. `08b` applique
   l'accent, comme le sélecteur de moteur.
2. **Rien ne maquette l'attente d'un test de connexion.** Un hôte injoignable prend
   jusqu'à 30 secondes. `08d` désactive le bouton et écrit « Test en cours… », sans
   inventer d'animation ni d'indicateur de progression — qui serait la vraie réponse.
3. **Rien ne maquette un refus de saisie.** `A2` n'a aucun message d'erreur de champ.
   `08e` réemploie le message inline du pied, là où `08d` affiche déjà les échecs. Un
   affichage par champ serait plus juste.
4. **Que voit un utilisateur sans aucun projet ? — tranché le 10 août 2026, par `08f`.** `A2`
   avait un `Select` de projets existants, sans « Nouveau projet… », alors que `⌘N` y mène
   directement : `08e` désactivait l'enregistrement, et **rien ne permettait de créer un projet**.
   L'application neuve était une impasse, constatée à l'usage. `08f` ajoute une entrée
   « + Nouveau projet… » au `Select`, qui révèle un champ de nom, et enchaîne `create_project`
   puis `save_database` — personne ne crée un projet vide.
5. **Le panneau proxy replié, et sans tunnel, n'est pas maquetté.** `08c` rend l'en-tête
   seul et fait disparaître le badge « SSH activé » — la seule lecture cohérente.

**Six trous du handoff sur `A4`, relevés en écrivant `09a`–`09f`** (7 août 2026). Comme pour
`A2`, chaque spec prend le minimum défendable et le dit.

1. **Que signifie le point d'état de la pastille projet ?** Un projet n'a pas d'état de
   connexion — ses bases en ont. `09c` le fait donc refléter la base **ouverte**, et un projet
   sans base ouverte n'a pas de point plutôt qu'un point gris inventé.
2. **Le champ de recherche du centre promettait une recherche globale — tranché le 8 août 2026.**
   Le mockup écrit « Chercher un objet… ⌘P », ce qui annonce deux choses qui n'existent pas : une
   recherche traversant tous les schémas et tous les projets, et un raccourci pour l'ouvrir.
   `09e` a retenu le minimum honnête — le champ filtre la liste affichée et le **dit**
   (« Filtrer les objets de public… »), et le rappel `⌘P` est **retiré** : un raccourci affiché
   qui ne répond pas est pire qu'un raccourci absent. La recherche globale reste à faire, et sa
   spec dira ce que devient ce champ.
   *(La barre de filtre de la **sidebar**, elle, écrit « Filtrer l'arborescence… » depuis `04` et
   n'a jamais rien promis de trop — erreur de la première rédaction, corrigée.)*
3. **Trois des quatre états de connexion ne sont pas maquettés.** Seule la base ouverte l'est.
   `09d` compose les trois autres avec `Badge` et `Dot`, et impose qu'ils se distinguent
   **autrement que par la couleur**.
4. **Le segment « Index » n'est jamais montré actif**, et un index n'a ni « Lignes », ni
   « Clé primaire », ni « Dernier ANALYZE » — trois des sept colonnes. `09e` y met un tiret
   cadratin ; un jeu de colonnes par type d'objet serait la vraie réponse.
5. **La tuile « Lignes » affiche une estimation comme un fait exact.** `reltuples` est une
   estimation du catalogue, `pg_total_relation_size` est exact : les présenter pareil est un
   mensonge de précision. `09f` ajoute un `title`, faute de mieux.
6. **Quelles cinq colonnes, parmi les dix-huit ?** Le mockup en montre cinq puis « + 13
   autres… » sans dire lesquelles. `09f` prend les cinq premières du catalogue — l'ordre que
   l'utilisateur connaît de sa table.

**Quatre trous du handoff sur `A5`, relevés en écrivant `10a`–`10f`** (9 août 2026). Comme
pour `A2` et `A4`, chaque spec prend le minimum défendable et le dit.

1. **La pastille de `status` n'a ni sémantique ni signal, et le mockup se contredit.** Il
   colore `paid` en vert, `pending` en ambre, `refunded` en rouge — le vocabulaire d'une table
   fictive, pas une règle ; une base réelle aura `active`, `draft`, `archived`. Restait la
   *forme* : quelles colonnes deviennent des pastilles ? `TypeCategory` (`06a`) n'a pas de
   catégorie « énumération », et **la sidebar du même écran donne à `status` le glyphe `T` du
   texte**. `10c` ne rend donc aucune pastille. La vraie réponse est une annotation de colonne,
   donc `A10` — l'ajouter maintenant demanderait d'inventer à la fois le signal et la palette.
2. **« Valeurs fréquentes » coûte un parcours complet.** Le popover d'opérateur annonce
   `paid 72% · pending 14% · …`, soit un `GROUP BY` sur 1,9 million de lignes déclenché par
   l'ouverture d'un menu. Trois réponses possibles — échantillonner et le dire, lire
   `pg_stats.most_common_vals` (gratuit, mais limité aux colonnes analysées et propre à
   PostgreSQL), ou l'assumer coûteux et explicite. `10d` ne rend pas le bloc. La piste
   `pg_stats` est la plus prometteuse : c'est déjà là que `06c` prend ses estimations.
3. **`280,00 €` suppose un lien entre deux colonnes que rien ne déclare.** Le panneau de ligne
   affiche `28000` puis le montant formaté, ce qui exige de savoir que `total_cents` est en
   centimes et que la devise se lit dans `currency`. Le déduire d'un suffixe marcherait ici et
   afficherait un montant faux ailleurs, en silence. `10f` ne rend pas le bloc ; la vraie
   réponse est une annotation de colonne, donc `A10`.
4. **L'opérateur `in` annonce un panneau qui n'est pas maquetté.** « dans la liste… » et ses
   points de suspension. `10d` saisit les valeurs dans le même champ, séparées par des
   virgules, avec un texte d'aide qui le dit.

**L'export de `A5` est un sujet, pas un bouton.** Outre la CSP (`blob:`, voir plus bas), il
faut trancher : la fenêtre affichée ou le résultat complet ? Quel encodage, quel séparateur,
quel traitement des `NULL` et des sauts de ligne ? Sur 1,9 million de lignes, l'écriture doit
être en flux, donc entièrement côté Rust. `10e` livre le bouton **désactivé**, avec l'infobulle
qui nomme sa spec — la règle de `09f`.

**Décision inverse de `A1` sur les boutons inertes, assumée.** `A1` et `08b` ont livré des
boutons présents et **actifs** mais sans effet, au motif qu'un bouton désactivé sans
explication fait croire à un bug. `09f` fait l'inverse pour ses quatre actions : elles sont
désactivées, avec une infobulle nommant l'écran attendu. La raison de l'écart : à `A1` un
seul bouton était inerte et son écran venait dans la spec suivante ; ici quatre boutons sur
quatre le sont, et leurs écrans sont à trois specs de distance. Un panneau dont tout est
cliquable et rien ne répond est pire qu'un panneau qui dit ce qui n'est pas encore là.

**Les feux tricolores ne peuvent pas être grisés derrière une modale** (relevé le 7 août
2026, en implémentant `08a`). Le mockup les met en `#DCD6CB` pour signaler que la fenêtre
est bloquée. Or `tauri.conf.json` déclare `titleBarStyle: "Overlay"` avec `hiddenTitle` :
ce sont les vrais boutons de macOS, dessinés par le système par-dessus notre fenêtre, hors
d'atteinte du CSS. macOS ne les ternit que si la fenêtre perd le focus, ce qu'une modale
**interne** ne provoque pas.

Trois moyens envisagés, tous refusés : dessiner nos propres feux (il faudrait réimplémenter
leur comportement, leur survol et leurs trois icônes, pour un gain purement esthétique) ;
passer en `decorations: false` (même travail, en pire) ; désactiver la fenêtre le temps de
la modale (elle cesserait d'être déplaçable et fermable — hostile).

`08b` implémente donc les deux autres effets du mockup, qui portent la même intention :
`opacity .55` sur le wordmark et `filter: saturate(.6)` sur la barre entière. L'écart tient
à trois pastilles de 11 px. À confirmer avec le design, ou à assumer.

**« Connecté » ne dira pas toute la vérité tant que le TLS n'est pas branché.** `06b`
emploie `NoTls` : un test en `require` ou `verify-full` réussit sans que rien n'ait été
vérifié. `08d` ajoute donc « · TLS non vérifié » au résultat inline quand le mode demandé
exigeait une vérification. Mention volontairement laide, à retirer quand `06b` aura son
TLS — et à ne pas retirer avant.

**`blob:` n'est pas autorisé par la CSP.** `img-src 'self' data:` ne le couvre pas. Un
export CSV par `URL.createObjectURL`, un aperçu d'image, un téléchargement de résultats —
tous plausibles pour `10` et `14` — seront bloqués. Deux réponses possibles le jour où ça
se pose : ajouter `blob:` à la directive concernée, ou gérer l'écriture côté Rust. Ne pas
élargir la CSP par anticipation.

## Fondations

| Spec | Scope | État |
| --- | --- | --- |
| [`01`](01-socle-tauri.md) | Socle : Tauri 2 + React/TS/Vite, structure du repo, packaging `.app`, CI | **fait** |
| [`02`](02-design-system.md) | Design system : tokens, polices, icônes, primitives | **fait** |
| [`03`](03-coquille-panneaux-onglets.md) | Coquille : panneaux redimensionnables + persistance, bande d'onglets | **fait** |
| [`04`](04-menu-lateral-standard.md) | Menu latéral standard — le composant partagé A5 → A9 | **fait** |

## Modèle et accès aux données

| Spec | Scope | État |
| --- | --- | --- |
| [`05a`](05a-modele-configuration.md) | Modèle de configuration : Projet / Base / Environnement, types et invariants | **fait** |
| [`05b`](05b-persistance-disque.md) | Persistance sur disque : emplacement, écriture atomique, version et migration | **fait** |
| [`05c`](05c-stockage-identifiants.md) | Stockage des identifiants : interface, Trousseau, fichier chiffré | **fait** (Trousseau : API vérifiée, persistance entre builds non) |
| [`06a`](06a-contrat-couche-moteur.md) | Contrat de la couche moteur : trait, modèle d'introspection, fenêtre de lignes | **fait** |
| [`06b`](06b-connexion-postgresql.md) | Connexion PostgreSQL, modes SSL, test de connexion, infra de test | **fait** (TLS à brancher) |
| [`06c`](06c-introspection-postgresql.md) | Introspection PostgreSQL : catalogue → modèle, DDL | **fait** |
| [`06d`](06d-lecture-paginee.md) | Lecture paginée des lignes : filtres, tri, contrainte IPC | **fait** |
| [`06e`](06e-tunnel-ssh.md) | Tunnel SSH vers un bastion | **fait** (écran de confiance à trancher) |
| [`06f`](06f-tls-verifie.md) | Le TLS branché, et **vérifié** — `rustls`, cinq modes distincts | **fait** |

**Pourquoi `05` a été découpé en trois** (5 août 2026) : le périmètre indexé —
« modèle de domaine, persistance, Trousseau » — mêlait trois préoccupations
séparables, dont une sensible en sécurité, et dépassait largement la limite de
~150 lignes d'`AGENTS.md`. Les sous-lettres évitent de renuméroter `06`→`15`, dont
`07` déjà implémenté et cité partout.

**L'introspection reste avec le moteur.** Schéma, table, vue, fonction, index,
comptages et tailles ne viennent pas de l'utilisateur mais du catalogue de la base,
et leur forme est dictée par chaque moteur. Ils appartiennent donc à `06a`, pas au
modèle de configuration — c'est la ligne de faille qui a guidé le découpage.

**`SplitPane` ne dimensionnait que son panneau de gauche** (trouvé le 10 août 2026, en mesurant
`A5`). Ce qui convient à une sidebar, et pas à l'écran de travail, dont le panneau **droit** est
de largeur fixe : le centre recevait 296 px et la grille tombait à zéro pixel de large, depuis
`10b`. Aucun test ne l'avait vu — chacun mesurait la colonne qui l'intéressait, jamais le partage
des trois. `SplitPane` reçoit une option `sized`, et un test e2e verrouille le partage.

**Le panneau droit de l'écran de travail est unique, son contenu suit l'écran** : détail de
l'objet en `A4`, ligne sélectionnée en `A5`. Le mockup n'en montre qu'un, et la barre d'état court
**sous** les trois colonnes — elle vit donc au niveau de l'écran, pas du centre.

**Les colonnes d'une clé étrangère entrante étaient cherchées dans la mauvaise table** (trouvé le
10 août 2026, sur une base réelle). `REQUETE_RELATIONS` joignait `pg_attribute` sur `con.conrelid`
dans les deux sens : pour une relation **entrante**, elle prenait donc les numéros d'attribut de
*notre* table et les cherchait dans la table *étrangère*. Deux conséquences, dont la seconde
bloquait le produit :

- quand les numéros existaient de part et d'autre, elle rendait des noms **faux** — et le test
  restait vert, parce qu'il ne vérifiait que la direction et la table cible ;
- quand ils n'existaient pas, `array_agg` rendait `NULL`, `try_get::<Vec<String>>` échouait, et
  **toute la table devenait impossible à ouvrir**. Le cas réel : une contrainte pointant la
  colonne 18 d'une table qui en compte 16.

Corrigé, et `relation_depuis` rend désormais `Option` : une relation illisible est **omise avec un
journal** plutôt que de faire échouer `table_detail`. Le pire qu'elle puisse coûter est une ligne
manquante dans le bloc « Relations » ; empêcher d'ouvrir la table était hors de proportion.

**`Popover` clone son déclencheur, donc celui-ci doit transmettre ce qu'il reçoit** (trouvé le
10 août 2026, en écrivant `08g`). `ProjectPill` ne transmettait pas ses props inconnues à son
`<button>` : le clone posant `aria-haspopup`, `aria-expanded` et `onClick` était **silencieusement
perdu**, et le menu ne s'ouvrait pas. Rien ne le signalait — ni TypeScript, ni un test unitaire, la
pastille restant parfaitement rendue. À savoir pour tout futur déclencheur : un composant enveloppé
par `Popover` ou `Tooltip` doit étaler le reste de ses props sur son élément interactif.

**Une relation jamais analysée n'a pas zéro ligne** (trouvé à l'usage le 10 août 2026). PostgreSQL
rend `reltuples = -1` pour une table fraîchement créée, une vue, ou une base restaurée sans
`ANALYZE`. `06c` le traduisait en `0` — ce qui évitait bien le « −1 lignes » dans l'arbre, mais
remplaçait un mensonge par un autre : sur une base réelle dont aucune table n'avait été analysée,
`A4` les affichait **toutes vides**, et l'utilisateur en a conclu que ses tables l'étaient.
`RowCount` porte désormais une troisième variante, `Unknown`, et l'écran rend un tiret cadratin
avec une infobulle qui dit qu'un `ANALYZE` renseignerait le catalogue. Le test qui aurait dû
l'attraper vérifiait `value() >= 0`, ce que zéro satisfaisait.

**`data-tauri-drag-region` nu ne rend glissable que l'élément lui-même**, pas son sous-arbre : le
script de Tauri teste `el === composedPath[0]`. La barre de titre étant couverte par ses enfants,
seule la bande de fond autour des feux répondait. La valeur **`deep`** étend le glissement au
sous-arbre, et les éléments cliquables le bloquent d'eux-mêmes — cliquer la pastille projet active
donc le contrôle sans déplacer la fenêtre, sans qu'il ait fallu l'écrire. À savoir aussi : la
permission `core:window:allow-start-dragging` est nécessaire, `core:window:default` n'accordant
aucune permission d'écriture.

**Pourquoi `11` a été découpé en quatre** (10 août 2026) : `A6` porte la **première écriture du
projet** dans une base de l'utilisateur, et trois choses distinctes autour d'elle — la saisie et son
modèle, les marques qui rendent l'attente visible, le panneau qui montre le diff. `11d` mérite ses
propres critères : une transaction partielle, un conflit non détecté ou un `UPDATE` sans `WHERE` ne
se rattrapent pas, à la différence de tout ce que les dix specs précédentes pouvaient produire.

L'ordre place le **modèle avec ce qui le produit** (`11a`) plutôt qu'avec ce qui l'affiche : une
cellule qui n'enregistre rien n'édite pas, un modèle que rien ne produit est mort.

**Pourquoi `10` a été découpé en six** (9 août 2026) : `A5` porte trois choses qu'aucune spec
n'a livrées — la grille **virtualisée**, que `09a` a explicitement séparée de `DataTable` ; le
branchement de la lecture paginée de `06d`, écrite et testée mais appelée par personne ; et la
bande d'onglets, reportée de `09e`. S'y ajoutent les filtres par en-tête, le tri multiple, la
toolbar et le panneau de ligne, chacun avec ses propres critères de vérification. L'ordre suit
la dépendance : primitives → coquille → données → interactions.

**`A4` n'était assemblé que dans la galerie** (constaté le 9 août 2026, en préparant `10`).
Ses quatre composants existent, sont testés et sont fidèles, mais rien ne les réunit et `App`
ne les monte pas : les tests Playwright de `A4` visent tous `/?gallery`. Trou d'assemblage,
pas trou de fidélité — invisible précisément parce que la galerie donne la même image que
l'écran. `10b` construit la coquille une fois et la monte depuis `/`. Troisième occurrence du
même motif après `load_config` (`09b`) et `read_rows` (`10c`) : une couche complète et testée
qu'aucun appelant ne franchit.

**La sidebar de l'écran de travail est à 212 px, y compris devant `A4`** (tranché le 9 août
2026, en écrivant `10b`). Le handoff donne 252 px à `A4` et 212 aux écrans `A5` → `A9` ; une
coquille unique ne peut pas être les deux, et la colonne sauterait de quarante pixels à
l'ouverture d'un premier onglet. Elle prend en outre la largeur de son `SplitPane` au lieu de
l'imposer — sans quoi la poignée livrée par `03` déplacerait un panneau dont le contenu garderait
sa largeur fixe. Un mockup figé ne peut pas exprimer un panneau que l'utilisateur déplace.

**Pourquoi `09` a été découpé en six** (7 août 2026) : `A4` est l'écran le plus dense du
handoff — barre de titre à pastille, sidebar 252 px à quatre niveaux, centre à onglets et
tableau de sept colonnes, panneau de détail à quatre blocs — et il porte en plus le
**câblage des données**, que rien n'avait fait : `load_config` existe depuis `05b` et n'était
appelée par personne. Ce câblage est placé en **second**, avant les quatre specs de fidélité,
pour que celles-ci se construisent sur de vraies données plutôt que sur des jeux factices
qu'il faudrait ensuite défaire.

**Pourquoi `08` a été découpé en cinq** (7 août 2026) : son périmètre indexé — « modale
nouvelle connexion, et son échec » — recouvrait six préoccupations séparables, dont quatre
primitives absentes de `02` et le **premier passage réel du pont JavaScript → Rust**. Ce
dernier n'a jamais été exercé depuis `01` et mérite ses propres critères : c'est le seul
point du projet qu'aucun test automatisé ne peut couvrir, Playwright ne pilotant pas
WKWebView.

**Pourquoi `06` a été découpé en cinq** (6 août 2026) : son périmètre indexé mêlait
le contrat, la connexion, l'introspection, la lecture de lignes et le tunnel SSH —
cinq préoccupations aux risques distincts. La lecture paginée en particulier porte
la contrainte IPC transverse, jamais mise à l'épreuve jusque-là, et mérite ses
propres critères de vérification.

## Écrans

| Spec | Écran | Scope | État |
| --- | --- | --- | --- |
| [`07`](07-a1-accueil.md) | A1 | Première ouverture, aucun projet | **fait** |
| [`08a`](08a-primitives-de-formulaire.md) | — | Primitives : `Modal`, `Select`, `CollapsiblePanel`, `RadioGroup` | **fait** |
| [`08b`](08b-a2-modale-et-formulaire.md) | A2 | Coquille de modale, sélecteur de moteur, formulaire principal | **fait** |
| [`08c`](08c-a2-panneau-proxy-tunnel.md) | A2 | Panneau proxy / tunnel | **fait** (sélecteur de fichier non observé) |
| [`08d`](08d-tester-la-connexion.md) | A2 + A3 | « Tester la connexion » : pont IPC réel, et sous-modale d'échec | **fait** (pont non observé) |
| [`08e`](08e-enregistrer-et-ouvrir.md) | A2 | « Enregistrer & ouvrir » : config + secret | **fait** |
| [`08f`](08f-creer-un-projet.md) | A2 | Créer un projet — `create_project`, « + Nouveau projet… » | **fait** |
| [`08g`](08g-modifier-une-connexion.md) | A2 | Modifier une connexion — `update_variant`, menu de la pastille | **fait** |
| [`08h`](08h-menu-de-ligne-dans-l-arbre.md) | A4 | Le menu « … » des lignes projet et base de l'arbre | **fait** |
| [`08i`](08i-renommer-un-projet.md) | A4 | Renommer un projet — `rename_project`, migration des secrets | **fait** |
| [`08j`](08j-supprimer-une-connexion-ou-un-projet.md) | A4 | Retirer une déclaration de connexion, ou un projet | **fait** |
| [`09a`](09a-primitives-de-tableau.md) | — | Primitives : `SegmentedControl`, `StatTile`, `DataTable` | **fait** |
| [`09b`](09b-cablage-des-donnees.md) | — | Câblage : `load_config` au démarrage, registre de connexions, introspection | **fait** (redémarrage non observé) |
| [`09c`](09c-a4-barre-de-titre.md) | A4 | Barre de titre : pastille projet, fil d'Ariane, sélecteur d'environnement | **fait** (clic vs glissement non observé) |
| [`09d`](09d-a4-sidebar-et-arbre.md) | A4 | Sidebar 252 px et son arbre à quatre niveaux | **fait** |
| [`09e`](09e-a4-liste-des-objets.md) | A4 | Centre : fil d'Ariane, tableau des objets | **fait** (bande d'onglets → `10`) |
| [`09f`](09f-a4-panneau-droit.md) | A4 | Panneau de détail 300 px | **fait** |
| [`10a`](10a-primitives-de-grille.md) | — | Primitives : `VirtualGrid`, `Popover` | **fait** |
| [`10b`](10b-coquille-de-travail-et-onglets.md) | A5 | Coquille d'écran de travail et bande d'onglets câblée | **fait** |
| [`10c`](10c-grille-de-donnees.md) | A5 | Grille de données : `read_rows`, rendu des valeurs, barre d'état | **fait** |
| [`10d`](10d-filtres-et-tri.md) | A5 | Filtres par en-tête, popover d'opérateur, tri multiple | **fait** |
| [`10e`](10e-toolbar.md) | A5 | Toolbar : `LIMIT`, chips, « Voir le SQL », colonnes | **fait** |
| [`10f`](10f-panneau-de-ligne.md) | A5 | Panneau droit : détail d'une ligne, ligne liée, INSERT | **fait** |
| [`11a`](11a-cellule-editable.md) | A6 | Cellule éditable et modifications en attente | **fait** |
| [`11b`](11b-marques-du-mode-edition.md) | A6 | Bandeau, badge, teintes, annotations, barre d'état | **fait** |
| [`11c`](11c-panneau-des-modifications.md) | A6 | Panneau droit : cartes, diff, SQL prévisualisé | **fait** |
| [`11d`](11d-appliquer-les-modifications.md) | A6 | Appliquer : transaction, garde-fous, conflit | **fait** |
| [`12a`](12a-coquille-de-console.md) | A7 | Coquille de console : onglets, toolbar, partage vertical | **fait** |
| [`12b`](12b-editeur-sql.md) | A7 | L'éditeur SQL — CodeMirror 6, thème du handoff | **fait** |
| [`12c`](12c-executer-une-requete.md) | A7 | Exécuter : `run_sql`, auto-`LIMIT`, requêtes destructives | **fait** |
| [`12d`](12d-autocompletion.md) | A7 | Autocomplétion depuis le catalogue introspecté | **fait** |
| [`12e`](12e-onglets-de-resultat.md) | A7 | Résultat, JSON, Plan, Messages | **fait** |
| [`12f`](12f-requetes-enregistrees.md) | A7 | « Mes requêtes » : persistance, renommer, retirer | **fait** |
| [`13a`](13a-console-mongodb.md) | A8 | Console MongoDB | livrée |
| [`13b`](13b-resultat-json.md) | A8 | Résultat en JSON dépliable | livrée |
| [`13c`](13c-schema-deduit.md) | A8 | « Schéma déduit » | livrée |
| [`14a`](14a-vue-structure.md) | A9 | Vue Structure et tableau des colonnes | livrée |
| [`14b`](14b-index-contraintes-declencheurs.md) | A9 | Index, contraintes, déclencheurs | livrée |
| [`14c`](14c-ddl.md) | A9 | Le DDL reconstruit, coloré et copiable | livrée |
| [`15a`](15a-coquille-des-preferences.md) | A10 | La coquille des préférences | livrée |
| [`15b`](15b-apparence.md) | A10 | Thème et couleur d'accent | livrée |
| [`15c`](15c-grille-et-code.md) | A10 | Densité de grille et police du code | livrée |
| [`15d`](15d-garde-fous.md) | A10 | Les garde-fous d'écriture, réglables | livrée |

## Moteurs additionnels

Un scope par moteur, après PostgreSQL (`06`) : MySQL / MariaDB (`16`), SQLite (`17`),
MongoDB (`18`), Redis (`19`), Snowflake (`20`), BigQuery (`21`). Écrits à mesure.

**Quatre moteurs répondent** : PostgreSQL (`06`), MongoDB (`18`), SQLite (`17`), MySQL (`16`).

**Le contrat de `06a` couvre six moteurs sur sept.** `19a` conclut que Redis n'y entre pas : un
espace de clés n'est pas un tableau, et l'y forcer donnerait des écrans qui affichent des colonnes
inventées. Il lui faut son propre écran, qui n'est pas maquetté. C'est la conclusion inverse de
`18a`, et elle vaut d'être écrite.

**`20` et `21` sont bloquées par l'absence de décor de test**, pas par une difficulté de conception :
le projet n'a ni compte Snowflake ni compte BigQuery, et chaque moteur livré est vérifié contre un
serveur réel. Un adaptateur dont aucun test ne dit s'il fonctionne est exactement le genre de code qui
perd des données sans le dire.

Comme `06`, un moteur ne tient pas dans une spec : `18` est découpé en sept scopes,
sur le modèle `06a` (contrat) → `06b` (connexion) → `06c` (introspection) →
`06d` (lecture). MongoDB en demande deux de plus, qui n'ont pas d'équivalent SQL :
le schéma déduit, et la console dont le langage n'est pas du SQL.

| Spec | Sujet | État |
| --- | --- | --- |
| [`18a`](18a-mongodb-face-au-contrat.md) | Les six endroits où le contrat de `06a` suppose ce que MongoDB n'a pas | livrée |
| [`18b`](18b-connexion-mongodb.md) | La connexion, le type de déploiement, les échecs distingués | livrée |
| [`18c`](18c-introspection-mongodb.md) | Bases, collections, vues, index | livrée |
| [`18d`](18d-schema-deduit.md) | Le schéma déduit par échantillonnage, et la fréquence des champs | livrée |
| [`18e`](18e-lecture-de-documents.md) | La lecture paginée de documents, filtres et tri | livrée |
| [`18f`](18f-ecrire-un-document.md) | L'écriture, sa prévisualisation, et son refus sans jeu de réplicas | livrée |
| [`18g`](18g-console-mongosh.md) | Exécuter une opération de collection, et l'expliquer | livrée |
| [`16a`](16a-mysql-connexion.md) | La connexion MySQL, et ses trois écarts avec PostgreSQL | livrée |
| [`16b`](16b-mysql-introspection.md) | Introspection et DDL, rendu par le serveur | livrée |
| [`16c`](16c-mysql-lecture-et-ecriture.md) | Lire, écrire, exécuter | livrée |
| [`17a`](17a-sqlite-un-fichier-pas-un-serveur.md) | SQLite : un fichier, pas un serveur | livrée |
| [`17b`](17b-sqlite-introspection-et-lignes.md) | Introspection, lignes, écriture | livrée |
| [`19a`](19a-redis-ce-que-le-contrat-ne-decrit-pas.md) | **Redis n'entre pas dans le contrat** — et pourquoi | livrée |
| [`20`](20-snowflake.md) | Snowflake — **aucun décor de test** | livrée |
| [`21`](21-bigquery.md) | BigQuery — **aucun décor de test**, et une facture par requête | livrée |

## Après l'usage réel

| Spec | Scope | État |
| --- | --- | --- |
| [`22`](22-colonne-de-droite-unifiee.md) | La colonne de droite unifiée, et le couple de vues dans son en-tête | livrée |
| [`23a`](23a-environnements-du-projet.md) | Les environnements appartiennent au projet | à faire |
| [`23b`](23b-une-connexion-un-environnement.md) | Une connexion, un environnement | à faire |
| [`23c`](23c-commandes-des-environnements.md) | Les commandes des environnements | à faire |
| [`23d`](23d-choisir-l-environnement-d-une-connexion.md) | Choisir l'environnement d'une connexion (`A2`) | à faire |
| [`23e`](23e-editer-un-projet.md) | Éditer un projet, et ses environnements | à faire |
| [`23f`](23f-supprimer-un-environnement.md) | Supprimer un environnement, et ce que ça emporte | à faire |
| [`23g`](23g-les-ecrans-face-aux-environnements-declares.md) | Les écrans face aux environnements déclarés | livrée |
| [`24a`](24a-creer-un-projet.md) | Créer un projet : l'étape 1 | livrée |
| [`24b`](24b-stepper-informatif.md) | Le stepper informatif | livrée |
| [`24c`](24c-enchainer-vers-la-connexion.md) | Enchaîner vers la première connexion | livrée |
| [`24d`](24d-deux-gestes.md) | Deux gestes : « Nouveau projet » et « Nouvelle connexion » | livrée |

**`24` renverse `08f`.** Le projet se créait au passage, depuis le sélecteur de `A2` : le geste
principal était « je déclare une connexion ». Il devient « je déclare un projet, puis on me propose sa
première connexion ». `08f` reste à lire pour ses arbitrages — un projet vide n'est pas défait, la
création est une commande à part — que `24` reconduit explicitement.

Les specs `24a`–`24d` ont été conçues avec deux agents, l'un UX et l'autre UI, dont les documents ont
tranché la plupart des questions. Deux les opposaient : la couleur des environnements à la création
(retenue : non, elle n'a aucune conséquence différée, contrairement au libellé) et la cellule « Projet »
de l'étape 2 (retenue : du texte étiqueté, non un `Chip` — la conception UI signalait elle-même qu'un
chip inerte se lit comme un contrôle en panne).

**`23` est le premier chantier qui invalide le format de configuration.** Les onze specs précédentes
ont employé `serde(default)`, justement parce qu'aucune n'invalidait ce qui était écrit sur disque.
Ici, `Environment` cesse d'être une énumération de trois valeurs et une base cesse de porter des
variantes : la version du format monte, et `23a`/`23b` portent chacune la migration de leur moitié.

L'ordre est contraint : `23a` avant `23b`, les deux avant `23c`, puis `23d`–`23g` dans n'importe quel
ordre. `23f` dépend de `23c` et de `23e`.

`22` n'est pas une spec du handoff : elle vient de l'usage. Le couple « Données / Structure » était à
droite de la bande d'onglets, comme le mockup le montre, et le détail de la table se regardait donc
à deux endroits — le DDL dans une colonne propre à la vue Structure, la ligne sélectionnée dans une
colonne propre à la vue Données. Une seule colonne, un en-tête permanent : le mockup ne pouvait pas
montrer ce défaut, étant figé sur un état à la fois.

`18a` est déclaratif et ne demande aucune base : c'est là que se prennent les décisions
que les six autres appliquent. `18d` est la seule spec de moteur du projet à produire
une donnée que le catalogue ne contient pas — d'où sa place à part.

**`A8` (`13a`–`13c`) attend `18d` et `18g`**, pas `18` entier : la console a besoin
d'exécuter et le panneau de schéma d'échantillonner. `A5`, `A6` et `A9` fonctionnent
pour MongoDB dès `18e` et `18f`, sans une ligne de code propre au moteur.

## Ordre d'exécution

Première tranche : `01` → `02` → `07`. Elle produit un `.app` qui se lance sur un
écran d'accueil fidèle, et le socle de fidélité dont tous les autres écrans
dépendent, sans toucher aux bases de données.

Puis les fondations partagées (`03`, `04`), dont les briques servent cinq écrans.

Puis le modèle et l'accès aux données : `05a`, `05b`, `05c` (faits) → `06a` → `06b` →
`06c` → `06d` → `06e`. Ensuite les écrans, en commençant par `08` — le premier qui crée
vraiment une entité de configuration.

`06e` (tunnel SSH) peut se glisser après `06b` sans attendre `06c`/`06d` : il ne dépend
que de la connexion.

**Aucune décision humaine ne bloque cette suite.** Le point de signature de code plus
haut est *tranché*, et l'achat d'un Developer ID ne concerne que la diffusion.

## Source de vérité du design

Le bundle de handoff : `README.md` (tokens, règles, comportements) et
`DoraBase.dc.html` (les 10 écrans, valeurs exactes). Il vit aujourd'hui dans
`~/Downloads/design_handoff_dorabase/` et est **versionné dans `design/handoff/`
par la spec `02`** — un chemin hors du repo n'est pas relisable dans six mois.
Les specs pointent déjà vers cet emplacement définitif.

Les specs **ne recopient pas** les tables de valeurs du handoff : elles y
renvoient. Les tokens sont transcrits une seule fois dans `tokens.json`, d'où
`tokens.css` et `tokens.ts` sont générés. Une seule source de vérité, et la dérive
rendue structurellement impossible plutôt que surveillée.

En cas de divergence entre la prose du `README.md` et le mockup, **le mockup fait
foi** : c'est contre lui que la fidélité se mesure. Les écarts constatés sont
consignés dans la spec de l'écran concerné.
