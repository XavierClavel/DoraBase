# 16b — MySQL : l'introspection et le DDL

## Goal

Remplir l'arbre, le tableau de `A4` et la vue Structure de `A9` pour MySQL.

## Dépend de

`16a`.

## Scope

- `schemas()` : les bases du serveur, avec leurs compteurs.
- `objects()` : tables et vues, avec compte de lignes, taille, clé primaire.
- `table_detail()` : colonnes, index, contraintes, déclencheurs, relations.
- Le DDL, **rendu par le serveur**.

## Not in this scope

- **La lecture des lignes** → `16c`.
- **Les procédures stockées.** `ObjectCounts.functions` les comptera ; les afficher est un écran
  que le handoff ne maquette pas.

## Approche

### `SHOW CREATE TABLE` rend le DDL, il n'y a rien à reconstruire

C'est l'avantage que `06c` n'avait pas : PostgreSQL ne garde pas le texte d'origine et oblige à
réassembler, avec les défauts que `14c` a documentés — identité perdue, index oubliés. MySQL le rend
tel qu'il le tient. La mention « reconstruit » de `A9` reste néanmoins **vraie** : MySQL normalise
aussi (il ajoute `ENGINE`, `CHARSET`, réordonne les clauses), donc le texte est équivalent, pas
identique.

Conséquence : le test de rejeu de `14c` s'applique tel quel, et il est **plus fort** ici — un DDL
rendu par le serveur qui ne se rejoue pas signalerait un vrai problème, pas un défaut de notre
assemblage.

### Le compte de lignes d'InnoDB est une estimation qui peut être très fausse

`information_schema.tables.table_rows` est exact pour MyISAM et **estimé** pour InnoDB — avec des
écarts de l'ordre de 50 % constatés en pratique, pas de quelques pourcents. `RowCount::Estimated` le
dit déjà, et `A4` affiche le `≈` ; ce qu'il faut éviter est de croire l'estimation assez bonne pour
s'y fier, comme `06c` l'a évité pour `reltuples`.

### Les schémas de service s'écartent, comme `pg_catalog`

`information_schema`, `performance_schema`, `mysql` et `sys` sont la plomberie du serveur. Les
afficher mettrait quatre entrées de bruit en tête de l'arbre — la décision de `06c`, et celle de
`18c` pour `admin`/`config`/`local`.

## Done when

- [ ] L'arbre se déplie jusqu'aux tables d'un MySQL réel, sans les quatre schémas de service.
- [ ] Une table vide apparaît, avec zéro ligne.
- [ ] Une vue se distingue d'une table.
- [ ] Le DDL vient de `SHOW CREATE TABLE`, et **se rejoue** dans une base vierge en donnant les
      mêmes colonnes, défauts et index — le critère de `14c`.
- [ ] Les comptes sont marqués `estimated` pour InnoDB.
