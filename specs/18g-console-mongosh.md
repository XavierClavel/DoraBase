# 18g — Exécuter une commande, et l'expliquer

## Goal

Exécuter ce que l'utilisateur écrit dans la console de `A8`, et rendre le plan d'une requête.

## Dépend de

`18a` (les deux méthodes gardent leur nom), `18e` (la forme du résultat).

## Scope

- `run_sql()` recevant du `mongosh` : le sous-ensemble accepté, et celui qui est refusé.
- La limite ajoutée aux requêtes qui rendent des documents.
- `explain_sql()` : le plan, et s'il exécute.

## Not in this scope

- **Un interpréteur JavaScript.** Voir § Approche : c'est la décision structurante de cette spec.
- **L'écran** → `13a` (la console), `13b` (le résultat JSON).
- **Les commandes d'écriture depuis la console** : `13a` les a explicitement remises, la
  confirmation de `12c` reconnaissant du SQL.

## Approche

### Ce n'est pas `mongosh`, et il faut le dire

`mongosh` est un interpréteur JavaScript complet : variables, boucles, `require`. Embarquer un moteur
JS dans DoraBase pour cela serait une dépendance énorme, une surface d'exécution nouvelle, et une
promesse qu'on ne tiendrait qu'à moitié.

**Ce qui est accepté est une forme, pas un langage** :
`db.<collection>.<opération>(<arguments JSON>)` — `find`, `aggregate`, `countDocuments`,
`distinct`, et leurs options. C'est ce que le mockup d'`A8` montre, et ce qu'on écrit à la main
quatre-vingt-dix-neuf fois sur cent.

Tout le reste est **refusé avec sa raison** — « DoraBase accepte une opération de collection, pas du
JavaScript » — et non silencieusement ignoré. Un éditeur qui accepte une boucle puis n'en exécute
qu'une partie serait la pire des trois options.

L'interface ne doit donc pas annoncer « mongosh » sans réserve. `13a` prévoit le libellé
« console mongo · mongosh » : à corriger là-bas, ou à assortir de ce que la console sait faire.

### La limite est ajoutée, et elle est dite

`06a` l'impose : `select * from orders` ne doit pas faire traverser l'IPC à 1,9 million de lignes, et
`find({})` non plus. Une opération qui rend des documents et ne porte pas de `limit` en reçoit une,
rendue dans `applied_limit` pour que la barre et l'onglet « Messages » le disent (`12e`).

**Un `$limit` dans un pipeline compte comme une limite**, mais seulement s'il est au bon endroit : un
`$limit` suivi d'un `$unwind` peut rendre bien plus de documents qu'il n'en laisse passer. Le cas est
à trancher — probablement en ajoutant une limite **en fin** de pipeline, ce qui est toujours correct.

### `explain()` n'exécute pas, à la verbosité par défaut

C'est la question laissée ouverte par `13a`, et la réponse est mesurable : `queryPlanner` rend le plan
choisi **sans exécuter**, là où `executionStats` et `allPlansExecution` exécutent pour mesurer.

`explain_sql` emploie donc `queryPlanner`, exactement pour la raison qui a fait refuser
`EXPLAIN ANALYZE` en `12e` : sur une console où l'on écrit aussi, « Expliquer » deviendrait un bouton
qui écrit. Et comme en `12e`, l'écran dit que les coûts sont **estimés**.

À vérifier plutôt qu'à croire : une commande qui compte les documents lus avant et après un
`explain()` le prouve.

## Done when

- [ ] `db.collection.find({…})` s'exécute et rend des documents, dans la forme de `18e`.
- [ ] Une forme non reconnue est **refusée avec sa raison**, jamais exécutée partiellement.
- [ ] Une opération sans limite en reçoit une, rendue dans `applied_limit`.
- [ ] Un pipeline dont le `$limit` n'est pas final ne rend pas plus que la limite.
- [ ] `explain()` **n'exécute pas** — prouvé par un compteur, pas supposé.
