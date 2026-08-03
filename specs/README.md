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

## À trancher avant certaines specs

Points établis par les relectures d'implémentation, qui ne peuvent pas être décidés au
moment où ils se posent sans coûter un retour en arrière.

**Signature de code et Trousseau — à trancher avant d'écrire `05`.** Les ACL du Trousseau
macOS sont liées à la **signature de code** de l'application. Le bundle est aujourd'hui
signé en ad-hoc (`flags=0x20002(adhoc,linker-signed)`, aucune `signingIdentity`
configurée), et une signature ad-hoc change à chaque reconstruction. Conséquence : un
outil qui range des identifiants de bases dans le Trousseau redemandera l'autorisation à
chaque build, et les entrées créées par un build ne seront pas lisibles par le suivant.
Développer le stockage des identifiants sans avoir résolu ça, c'est développer contre une
cible mouvante.

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
| `03` | Coquille : barre de titre, barre d'état, split panes redimensionnables + persistance, onglets | à écrire |
| `04` | Menu latéral standard — le composant partagé A5 → A9 | à écrire |

## Modèle et accès aux données

| Spec | Scope | État |
| --- | --- | --- |
| `05` | Modèle de domaine : Projet / Base / Environnement / Schéma / Objet, persistance, Trousseau | à écrire |
| `06` | Couche moteur en Rust : abstraction + adaptateur PostgreSQL, test de connexion, SSL, tunnel SSH | à écrire |

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

Ensuite, l'ordre reste à décider : soit remonter les fondations (`03`, `04`) avant
les écrans, soit dérisquer tôt l'accès aux données (`05`, `06`).

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
