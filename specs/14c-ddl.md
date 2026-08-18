# 14c — `A9` : le DDL

## Goal

Montrer le `CREATE TABLE` de la table ouverte, coloré et copiable.

## Dépend de

`14a`, `06c` (`TableDetail.ddl`), `11c` (`SqlColore`).

## Scope

- Le DDL rendu par le moteur, affiché tel quel.
- « Copier » — dans le presse-papiers, comme l'`INSERT` de `10f`.
- La mention de ce que ce DDL est : une **reconstruction**, non le texte d'origine.

## Not in this scope

- **Exporter le DDL de tout un schéma.** Utile, et c'est un autre geste — probablement `A10` ou une
  commande de menu.
- **Le DDL des index et contraintes séparément.** Le moteur les inclut dans le `CREATE TABLE` quand
  ils y appartiennent.

## Approche

### Ce DDL est reconstruit, et il faut le dire

PostgreSQL ne garde pas le texte du `CREATE TABLE` d'origine : `pg_dump` le reconstruit depuis le
catalogue, et `06c` fait de même. Le résultat est **équivalent**, pas identique — l'ordre des
clauses, les noms de contraintes générés, les valeurs par défaut normalisées peuvent différer de ce
qui a été tapé.

Le taire serait laisser croire qu'on lit la migration d'origine. Un utilisateur qui compare ce DDL à
son fichier de migration et trouve un écart doit savoir d'où il vient.

### La coloration est celle de `11c`

`SqlColore` sert déjà au bloc « SQL qui sera exécuté ». Le DDL est du SQL : deux colorations pour deux
blocs du même produit se verraient.

## Done when

- [ ] Le DDL s'affiche, coloré, et vient de `TableDetail.ddl`.
- [ ] L'écran dit qu'il est reconstruit.
- [ ] « Copier » met le texte dans le presse-papiers.
- [ ] Le DDL affiché **s'exécute** sur une base vide — vérifié contre PostgreSQL réel, comme
      l'`INSERT` de `10f` : un DDL reconstruit qui ne tourne pas serait pire qu'absent.
- [ ] La copie ainsi obtenue a **les mêmes colonnes, les mêmes défauts, les mêmes identités et les
      mêmes index** que l'originale. Un rejeu qui réussit ne suffit pas : c'est ce que la
      comparaison regarde qui décide de ce que le test attrape (`DEFAUTS.md` n° 49).
