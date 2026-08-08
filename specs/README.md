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
4. **Que voit un utilisateur sans aucun projet ?** `A2` a un `Select` de projets
   existants, sans « Nouveau projet… ». Or `⌘N` y mène directement. `08e` désactive
   l'enregistrement et l'annonce dans le `Select`, sans inventer de formulaire de création.
5. **Le panneau proxy replié, et sans tunnel, n'est pas maquetté.** `08c` rend l'en-tête
   seul et fait disparaître le badge « SSH activé » — la seule lecture cohérente.

**Six trous du handoff sur `A4`, relevés en écrivant `09a`–`09f`** (7 août 2026). Comme pour
`A2`, chaque spec prend le minimum défendable et le dit.

1. **Que signifie le point d'état de la pastille projet ?** Un projet n'a pas d'état de
   connexion — ses bases en ont. `09c` le fait donc refléter la base **ouverte**, et un projet
   sans base ouverte n'a pas de point plutôt qu'un point gris inventé.
2. **La barre de filtre promet plus qu'elle ne tient.** Le mockup écrit « Chercher un
   objet… », mais elle ne peut porter que sur ce qui est **chargé** : une table d'un schéma
   jamais déplié n'a jamais traversé l'IPC. `09d` change donc le libellé pour dire ce qu'il
   fait. La vraie réponse est la recherche globale `⌘P`, que rien ne maquette en action.
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
| [`05c`](05c-stockage-identifiants.md) | Stockage des identifiants : interface, Trousseau, fichier chiffré | **fait** (Trousseau non vérifié) |
| [`06a`](06a-contrat-couche-moteur.md) | Contrat de la couche moteur : trait, modèle d'introspection, fenêtre de lignes | **fait** |
| [`06b`](06b-connexion-postgresql.md) | Connexion PostgreSQL, modes SSL, test de connexion, infra de test | **fait** (TLS à brancher) |
| [`06c`](06c-introspection-postgresql.md) | Introspection PostgreSQL : catalogue → modèle, DDL | **fait** |
| [`06d`](06d-lecture-paginee.md) | Lecture paginée des lignes : filtres, tri, contrainte IPC | **fait** |
| [`06e`](06e-tunnel-ssh.md) | Tunnel SSH vers un bastion | **fait** (écran de confiance à trancher) |

**Pourquoi `05` a été découpé en trois** (5 août 2026) : le périmètre indexé —
« modèle de domaine, persistance, Trousseau » — mêlait trois préoccupations
séparables, dont une sensible en sécurité, et dépassait largement la limite de
~150 lignes d'`AGENTS.md`. Les sous-lettres évitent de renuméroter `06`→`15`, dont
`07` déjà implémenté et cité partout.

**L'introspection reste avec le moteur.** Schéma, table, vue, fonction, index,
comptages et tailles ne viennent pas de l'utilisateur mais du catalogue de la base,
et leur forme est dictée par chaque moteur. Ils appartiennent donc à `06a`, pas au
modèle de configuration — c'est la ligne de faille qui a guidé le découpage.

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
| [`08e`](08e-enregistrer-et-ouvrir.md) | A2 | « Enregistrer & ouvrir » : config + secret | **fait** (relecture au démarrage → `09`) |
| [`09a`](09a-primitives-de-tableau.md) | — | Primitives : `SegmentedControl`, `StatTile`, `DataTable` | **fait** |
| [`09b`](09b-cablage-des-donnees.md) | — | Câblage : `load_config` au démarrage, registre de connexions, introspection | **fait** (redémarrage non observé) |
| [`09c`](09c-a4-barre-de-titre.md) | A4 | Barre de titre : pastille projet, fil d'Ariane, sélecteur d'environnement | **fait** (clic vs glissement non observé) |
| [`09d`](09d-a4-sidebar-et-arbre.md) | A4 | Sidebar 252 px et son arbre à quatre niveaux | écrite |
| [`09e`](09e-a4-liste-des-objets.md) | A4 | Centre : onglets, fil d'Ariane, tableau des objets | écrite |
| [`09f`](09f-a4-panneau-droit.md) | A4 | Panneau de détail 300 px | écrite |
| `10` | A5 | Visualiseur de table : grille, filtres par en-tête, tri, LIMIT | à écrire |
| `11` | A6 | Édition inline, modifications en attente, diff et transaction | à écrire |
| `12` | A7 | Console SQL : éditeur, autocomplétion, onglets de résultat | à écrire |
| `13` | A8 | Console MongoDB et vue JSON | à écrire |
| `14` | A9 | Structure et DDL | à écrire |
| `15` | A10 | Préférences | à écrire |

## Moteurs additionnels

Un scope par moteur, après PostgreSQL (`06`) : MySQL / MariaDB, SQLite, MongoDB,
Redis, Snowflake, BigQuery. Numérotés `16` → `21` à mesure qu'ils sont écrits.

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
