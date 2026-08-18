# 17b — SQLite : l'introspection, les lignes, l'écriture

## Goal

Faire répondre `A4`, `A5`, `A6`, `A7` et `A9` pour SQLite.

## Dépend de

`17a`.

## Scope

- `schemas()` : ce qu'un fichier sans schéma rend.
- `objects()`, `table_detail()`, et le DDL.
- `rows()`, `row_as_insert()`, `preview_updates()`, `apply_updates()`.
- `run_sql()`, `explain_sql()`.

## Not in this scope

- **Les bases attachées** (`ATTACH DATABASE`). Elles feraient plusieurs schémas dans un fichier ;
  personne ne les déclare depuis `A2`, et les découvrir demanderait de les monter nous-mêmes.

## Approche

### Un fichier n'a qu'un schéma, et il faut lui donner un nom

SQLite appelle sa base `main`. Le niveau « schéma » de l'arbre en porte donc **un seul**, nommé
`main` — c'est le nom que SQLite emploie lui-même dans `pragma_table_info` et dans les messages
d'erreur, donc celui que l'utilisateur reconnaîtra. Inventer « base » ou reprendre le nom du fichier
créerait un mot qui n'existe nulle part ailleurs.

Conséquence assumée : l'arbre a un niveau à un seul enfant. C'est moins beau qu'un niveau replié, et
c'est cohérent avec les six autres moteurs — le prix d'une coquille unique.

### Les types de SQLite sont des **suggestions**

Une colonne déclarée `INTEGER` peut contenir du texte : SQLite a une affinité de type, pas un type.
`ColumnInfo.type_name` porte donc la déclaration, et `Value` la nature **réelle** de chaque valeur
lue — les deux peuvent se contredire, et c'est la vérité de ce moteur.

**Conséquence pour `A5` :** l'alignement d'une colonne suit sa catégorie déclarée, donc une valeur
textuelle dans une colonne `INTEGER` s'affichera alignée à droite. Le dire ici évite de le prendre
pour un défaut d'affichage. La fréquence de `18d` ne s'applique pas : la colonne existe pour toutes
les lignes, c'est son *type* qui varie.

### Le DDL vient de `sqlite_master.sql`, **presque tel qu'il a été tapé**

C'est le seul moteur des trois à garder le texte d'origine — pas une reconstruction. La mention
« reconstruit » de `A9` (`14c`) serait donc **fausse** ici : l'écran doit pouvoir dire « tel qu'il a
été écrit » quand le moteur le garde. Un mot à distinguer, pas une phrase à réécrire.

**Une réserve, constatée en la testant** : SQLite normalise le **préfixe** `CREATE TABLE` en
majuscules et laisse tout le reste verbatim — indentation, casse, retours à la ligne. « Presque » est
donc le mot juste, et l'écrire évite qu'on croie le fichier modifié en comparant à sa migration.

### Le compte de lignes est exact, et c'est une nouveauté

`SELECT count(*)` sur SQLite est rapide sur les tailles qu'un fichier local porte, et il n'existe
aucune estimation à laquelle se rabattre. `RowCount::Exact` sert enfin — il existe depuis `06a` et
aucun moteur ne le rendait. **À mesurer** sur une table d'un million de lignes avant de le tenir pour
acquis ; si le coût se voit, `RowCount::Unknown` est la réponse honnête.

### `EXPLAIN QUERY PLAN` n'exécute pas

Et `EXPLAIN` seul rend le bytecode de la machine virtuelle, illisible. C'est `QUERY PLAN` qu'il faut,
et la règle de `12e` tient : jamais de forme qui exécute.

## Done when

- [ ] L'arbre se déplie jusqu'aux tables d'un fichier SQLite réel, sous un schéma `main`.
- [ ] La grille affiche les lignes, filtres et tri compris.
- [ ] Le DDL est celui de `sqlite_master`, et `A9` dit qu'il est **d'origine** et non reconstruit.
- [ ] La réserve sur le préfixe normalisé est vérifiée, pas supposée.
- [ ] Une valeur textuelle dans une colonne `INTEGER` s'affiche sans erreur.
- [ ] Le compte est `Exact`, et son coût est mesuré sur une grande table.
- [ ] Une modification s'applique dans une transaction, et une modification concurrente l'annule.
- [ ] `EXPLAIN QUERY PLAN` n'exécute pas — prouvé.
