# 18c — L'introspection MongoDB

## Goal

Remplir l'arbre et le tableau de `A4` pour MongoDB : bases, collections, comptes, index.

## Dépend de

`18a` (le niveau « schéma » porte les bases), `18b`.

## Scope

- `schemas()` : les bases du serveur, avec leurs compteurs d'objets.
- `objects(base)` : les collections et les vues, avec leur nombre de documents et leur taille.
- `table_detail()` : index, options de la collection, validateur s'il y en a un, et le DDL de `18a`.
- Les vues MongoDB, distinguées des collections.

## Not in this scope

- **Les colonnes** → `18d`, qui les déduit. `table_detail()` les portera, mais elles ne viennent pas
  du catalogue.
- **Les relations.** MongoDB n'a pas de clé étrangère : `relations` reste vide, et le panneau de
  `A4` dit déjà « Aucune clé étrangère ». Une convention de nommage (`user_id` → `users`) serait une
  **devinette**, et le projet a déjà refusé d'en faire une pour l'autocomplétion (`12d`).
- **Les déclencheurs.** Ils n'existent que dans Atlas, hors serveur. `triggers` reste vide.

## Approche

### Les comptes sont estimés, et le type le dit déjà

`RowCount` distingue `estimated`, `exact` et `unknown` depuis `06c`, et `A4` affiche le `≈` en
conséquence. `estimatedDocumentCount()` lit les métadonnées de la collection : instantané et
approximatif — donc `estimated`. `countDocuments()` est exact et parcourt ; il n'est pas appelé ici,
pour la raison qui a fait choisir `reltuples` en `06c`.

**Après une écriture non propre, l'estimation de MongoDB peut être fausse**, pas seulement
imprécise. C'est ce que `estimated` promet — une estimation, pas une borne.

### Un compte de collections vides n'est pas zéro objet

`ObjectCounts` porte tables, vues, fonctions et index. Pour MongoDB : collections en « tables »,
vues en « vues », **fonctions à zéro** — il n'y en a pas côté serveur — et les index comptés en
parcourant les collections. Ce dernier coûte un appel par collection : `18c` doit mesurer si c'est
tenable sur une base à deux cents collections, et le dire si ce n'est pas le cas.

### Une vue MongoDB se reconnaît à son pipeline

`listCollections` rend `type: "view"` et le `viewOn` avec le pipeline. `A4` la teinte en violet
comme une vue SQL (`09d`), et `A9` peut afficher son pipeline là où une table montre son DDL — même
place, même rôle.

## Done when

- [ ] L'arbre se déplie jusqu'aux collections d'un MongoDB réel.
- [ ] Une collection vide apparaît, avec zéro document — pas absente.
- [ ] Une vue se distingue d'une collection, et porte son pipeline.
- [ ] Les comptes sont marqués `estimated`, et `A4` affiche le `≈`.
- [ ] Le coût de `schemas()` est mesuré sur une base à deux cents collections, et dit.
