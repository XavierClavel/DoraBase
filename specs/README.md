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

**`blob:` n'est pas autorisé par la CSP.** `img-src 'self' data:` ne le couvre pas. Un
export CSV par `URL.createObjectURL`, un aperçu d'image, un téléchargement de résultats —
tous plausibles pour `10` et `14` — seront bloqués. Deux réponses possibles le jour où ça
se pose : ajouter `blob:` à la directive concernée, ou gérer l'écriture côté Rust. Ne pas
élargir la CSP par anticipation.

## Fondations

| Spec | Scope | État |
| --- | --- | --- |
| [`01`](01-socle-tauri.md) | Socle : Tauri 2 + React/TS/Vite, structure du repo, packaging `.app`, CI | à relire |
| [`02`](02-design-system.md) | Design system : tokens, polices, icônes, primitives | à relire |
| [`03`](03-coquille-panneaux-onglets.md) | Coquille : panneaux redimensionnables + persistance, bande d'onglets | **fait** |
| [`04`](04-menu-lateral-standard.md) | Menu latéral standard — le composant partagé A5 → A9 | **fait** |

## Modèle et accès aux données

| Spec | Scope | État |
| --- | --- | --- |
| [`05a`](05a-modele-configuration.md) | Modèle de configuration : Projet / Base / Environnement, types et invariants | **fait** |
| [`05b`](05b-persistance-disque.md) | Persistance sur disque : emplacement, écriture atomique, version et migration | à relire |
| [`05c`](05c-stockage-identifiants.md) | Stockage des identifiants : interface, Trousseau, fichier chiffré | à relire |
| `06` | Couche moteur en Rust : abstraction + adaptateur PostgreSQL, test de connexion, SSL, tunnel SSH | à écrire |

**Pourquoi `05` a été découpé en trois** (5 août 2026) : le périmètre indexé —
« modèle de domaine, persistance, Trousseau » — mêlait trois préoccupations
séparables, dont une sensible en sécurité, et dépassait largement la limite de
~150 lignes d'`AGENTS.md`. Les sous-lettres évitent de renuméroter `06`→`15`, dont
`07` déjà implémenté et cité partout.

**L'introspection reste avec le moteur.** Schéma, table, vue, fonction, index,
comptages et tailles ne viennent pas de l'utilisateur mais du catalogue de la base,
et leur forme est dictée par chaque moteur. Ils appartiennent donc à `06`, pas au
modèle de configuration — c'est la ligne de faille qui a guidé le découpage.

## Écrans

| Spec | Écran | Scope | État |
| --- | --- | --- | --- |
| [`07`](07-a1-accueil.md) | A1 | Première ouverture, aucun projet | à relire |
| `08` | A2 + A3 | Modale nouvelle connexion, et son échec | à écrire |
| `09` | A4 | Explorateur : projets → bases → schémas → tables | à écrire |
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

Ensuite : fondations d'abord (`03`, `04`), avant `05`/`06`. Raison : `05` a une
décision humaine en attente (signature de code, voir § « À trancher ») qui
bloquerait le début de son écriture, alors que `03`/`04` ne dépendent d'aucune
décision en suspens.

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
