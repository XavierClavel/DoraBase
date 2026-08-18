# 16c — MySQL : lire, écrire, exécuter

## Goal

Faire répondre `A5`, `A6` et `A7` pour MySQL : la fenêtre de lignes, l'application des
modifications, la console.

## Dépend de

`16b`.

## Scope

- `rows()` : `SELECT` avec `LIMIT`/`OFFSET`, filtres et tri.
- `row_as_insert()` et `preview_updates()` — le SQL cité aux règles de MySQL.
- `apply_updates()` : la transaction de `11d`.
- `run_sql()` et `explain_sql()`.

## Not in this scope

- **Un dialecte de coloration propre à MySQL** dans l'éditeur. `12b` charge `PostgreSQL` ; la
  grammaire diffère peu et l'écart ne se voit pas sur les requêtes qu'on écrit à la main. À revoir
  si un test montre le contraire.

## Approche

### Les identifiants se citent au backtick, et c'est le premier piège

PostgreSQL cite au guillemet double, MySQL au backtick — et `ANSI_QUOTES` peut inverser la règle en
cours de session. Le SQL de `preview_updates` **doit** être exécutable tel quel : `11d` a posé qu'un
texte affiché différent de celui qui part est *pire qu'absent*.

La parade est celle de `11d` : la citation vit dans l'adaptateur, une seule fois, et le mode SQL de
la session est **vérifié** plutôt que supposé — comme `11d` vérifie `standard_conforming_strings`
avant d'écrire.

### InnoDB transige, MyISAM non

`apply_updates` promet « tout ou rien » (`06a`). MyISAM n'a pas de transaction : trois modifications
sur une table MyISAM s'appliqueraient à moitié. Le moteur de stockage de la table est **lisible**
dans `information_schema.tables`, donc le refus arrive **avant** la première écriture — la même
décision que `18f` pour un `mongod` isolé, et pour la même raison.

### `EXPLAIN` n'exécute pas, `EXPLAIN ANALYZE` si

Exactement comme en `12e`. `explain_sql` emploie `EXPLAIN FORMAT=TREE` quand le serveur le connaît
(MySQL 8.0.16+), et `EXPLAIN` sinon — jamais `ANALYZE`, qui ferait d'« Expliquer » un bouton qui
écrit sur une console où l'on écrit aussi.

## Done when

- [ ] La grille de `A5` affiche les lignes d'une table MySQL réelle, filtres et tri compris.
- [ ] Le SQL prévisualisé est **celui qui part** — vérifié en comparant, pas en le relisant.
- [ ] Une modification concurrente annule **toute** la transaction.
- [ ] Sur une table MyISAM, l'écriture est refusée avec sa raison, et **rien n'est écrit**.
- [ ] `ANSI_QUOTES` actif ne casse pas la citation — testé dans les deux modes.
- [ ] `EXPLAIN` n'exécute pas — prouvé, pas supposé.
