# 06d — Lecture paginée des lignes

## Objectif

Lire les données d'une table par fenêtres, avec filtres et tri, sans jamais qu'un jeu
de résultats complet traverse l'IPC. C'est la spec qui met à l'épreuve la contrainte
transverse du projet — jusqu'ici jamais vérifiée.

## Dépend de

`06a` (le type de fenêtre), `06b` (la connexion), `06c` (les types de colonnes, qui
décident du rendu et de la comparaison).

## Périmètre

- Lire une fenêtre de lignes d'une table : décalage, taille, tri, filtres.
- Traduire les filtres par colonne de `A5` en `WHERE` **paramétré**.
- Le tri multiple avec son rang, tel que `A5` l'affiche.
- Le `LIMIT` en palier (100 / 500 / 1000 / 5000).
- Rendre le SQL généré, que `A5` montre derrière « Voir le SQL ».
- Les métriques de la barre d'état : nombre de lignes, durée.
- **La preuve que l'empreinte mémoire reste plate** quelle que soit la table.

## Hors périmètre

- **L'écriture** — édition de cellule, transaction, `UPDATE` — → `11`. Ce scope lit.
- **La grille, les chips de filtre, le popover d'opérateur** → `10`. Ce scope rend des
  lignes et le SQL correspondant, il n'affiche rien.
- **L'édition manuelle du SQL** que `A5` permet (« toute édition manuelle se répercute
  dans les chips ») : c'est un aller-retour d'analyse syntaxique, et il appartient à
  `10` avec l'écran qui le porte.
- **Les valeurs fréquentes** du popover d'opérateur de `A5`. Elles exigent un
  `GROUP BY` sur la colonne, dont le coût sur une grande table demande sa propre
  décision. → `10`, avec l'écran qui les demande.
- **L'export CSV** → `10`, et il butera sur `blob:` que la CSP refuse (voir
  `specs/README.md`).
- **Le curseur de progression**. La pagination par décalage suffit aux écrans du
  handoff ; un curseur serait plus juste sur de très grandes tables, mais il impose un
  état côté serveur dont aucun écran n'a encore besoin.

## Approche

### La contrainte transverse, rendue vérifiable

`specs/README.md` pose : « Aucun jeu de résultats complet ne traverse l'IPC. Le cœur
Rust détient les résultats ; la webview ne reçoit jamais que la fenêtre visible de
lignes. La récupération est **paginée, pas seulement le rendu**. »

Cette dernière phrase est celle qui coûte. Récupérer un million de lignes en Rust puis
n'en envoyer que cinq cents respecterait la lettre et manquerait tout : l'empreinte
mémoire serait celle du million. La requête envoyée à PostgreSQL porte donc elle-même
le `LIMIT` et l'`OFFSET`.

Et cela se **mesure** : lire une fenêtre de 500 lignes dans une table d'un million
doit consommer un ordre de grandeur comparable à la même lecture dans une table de
mille. Un test qui compare les deux est la seule preuve ; sans lui, la contrainte
reste une intention. C'est le critère central de cette spec.

### Les filtres sont paramétrés, jamais concaténés

`A5` laisse saisir une valeur par colonne, avec un opérateur (`=`, `≠`, `in`, `~`,
`is null`). Interpoler cette valeur dans le SQL serait une injection ouverte sur
l'outil même dont le métier est d'exécuter du SQL — donc une faille qui ne se
remarquerait pas.

Les valeurs passent en **paramètres** liés. Le nom de colonne et l'opérateur, eux, ne
peuvent pas être des paramètres : ils sont donc validés contre la liste des colonnes
réellement introspectées par `06c` et une énumération fermée d'opérateurs. Un nom de
colonne inconnu est refusé, pas échappé.

Un test doit passer une valeur de filtre contenant une tentative d'injection et
constater qu'elle est traitée comme une **donnée** — c'est-à-dire qu'elle ne trouve
rien, sans rien casser.

### Ce que « Voir le SQL » doit montrer

`A5` masque le SQL brut par défaut et le déplie sur demande. Le SQL rendu doit être
celui **réellement exécuté**, avec ses paramètres substitués **pour l'affichage**
seulement. Montrer une requête différente de celle qui tourne serait un piège pour
qui débogue.

### Le tri, et sa clause stable

`A5` affiche « order by created_at desc » et permet un tri multiple numéroté. Un
détail à ne pas manquer : une pagination par décalage sur un tri **non total** rend
des lignes en ordre indéfini d'une page à l'autre, donc des doublons et des oublis. Un
critère stable est donc ajouté en dernier — la clé primaire quand elle existe —, et ce
comportement est documenté plutôt que subi.

### Les valeurs, et ce que le handoff en attend

`A5` rend `NULL` distinctement, aligne les nombres et les dates en mono, et affiche
certaines colonnes en pastille. Le contrat rend donc une valeur **typée** — nul,
nombre, texte, date, JSON, binaire — et non une chaîne déjà formatée : c'est l'écran
qui décide du rendu, et lui seul connaît la densité et la locale.

## Terminé quand

- Une fenêtre de lignes est lue avec décalage, taille, tri et filtres, contre une
  vraie base.
- **L'empreinte mémoire est mesurée** : lire 500 lignes dans une table d'un million
  coûte un ordre de grandeur comparable à la même lecture dans une table de mille.
  C'est le critère qui valide la contrainte transverse.
- Le `LIMIT` et l'`OFFSET` sont **dans la requête envoyée**, vérifié en lisant le SQL
  rendu.
- Une valeur de filtre contenant une tentative d'injection est traitée comme une
  donnée : elle ne trouve rien et ne casse rien.
- Un nom de colonne inconnu est **refusé**, pas échappé.
- Les cinq opérateurs de `A5` ont chacun un test.
- Le tri multiple respecte l'ordre des rangs, et un critère stable est ajouté quand le
  tri n'est pas total — vérifié en paginant une table où des valeurs se répètent, et
  en constatant l'absence de doublon et d'oubli entre pages.
- Le SQL rendu est celui réellement exécuté.
- Les valeurs sont typées, `NULL` inclus, et jamais préformatées en chaîne.
