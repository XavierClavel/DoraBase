# 12e — `A7` : les onglets de résultat

## Goal

Les quatre vues d'un résultat de console : Résultat, JSON, Plan, Messages — et les chiffres qui les
accompagnent.

## Scope

- Le contrôle segmenté à quatre entrées, et la vue qui suit.
- **JSON** : la ligne sélectionnée en JSON, avec la coloration de `10f`.
- **Plan** : `EXPLAIN` de la requête courante, rendu par le moteur.
- **Messages** : les avis du serveur (`NOTICE`, `WARNING`) et le récapitulatif d'exécution.
- Les chiffres de la barre : `14 lignes · 128 ms · plan 2.4 ms`.

## Not in this scope

- **`EXPLAIN ANALYZE`.** Il **exécute** la requête pour la mesurer : sur un `DELETE`, cela
  supprimerait des lignes pour produire un plan. `12e` ne fait que `EXPLAIN`, et la distinction est
  écrite à l'écran.
- **Le plan graphique** (arbre de nœuds, coûts en barres). Le mockup montre du texte ; un plan
  visuel est un écran en soi.
- **L'export du résultat** → l'icône de téléchargement de `10e`, hors périmètre ici.

## Approche

### `EXPLAIN` sans `ANALYZE`, et l'écran le dit

C'est la décision qui compte dans cette spec. `EXPLAIN ANALYZE` donne les vrais temps, ce qui est
précisément ce qu'on veut d'un plan — et il exécute la requête. Sur une console où l'on écrit aussi
des `UPDATE`, « Expliquer » deviendrait un bouton qui écrit.

Le plan est donc estimé, et l'onglet le nomme : « coûts estimés, requête non exécutée ». Un
`ANALYZE` demandé explicitement pourra venir plus tard, avec la même confirmation que `12c` réserve
aux requêtes destructives.

### Messages : ce que le serveur a dit, même quand tout va bien

Un `NOTICE` perdu est une information que la base a jugée utile. L'onglet les liste, avec le
récapitulatif — instruction exécutée, limite ajoutée par DoraBase le cas échéant. C'est aussi là que
`12c` dépose son « limité à 1000 ».

### JSON montre la ligne sélectionnée, pas tout le résultat

Sérialiser 1000 lignes pour l'affichage contredirait la contrainte transverse du projet. La vue JSON
suit la sélection de la grille, comme le panneau de `10f`.

## Done when

- [ ] Les quatre onglets existent et changent la vue ; l'actif est marqué.
- [ ] « Plan » affiche un `EXPLAIN` rendu par le moteur, et l'écran dit que la requête n'a pas été
      exécutée.
- [ ] Un test échoue si `EXPLAIN ANALYZE` est employé.
- [ ] Les `NOTICE` du serveur apparaissent dans « Messages », et la limite ajoutée par DoraBase aussi.
- [ ] « JSON » suit la ligne sélectionnée.
- [ ] Les trois chiffres de la barre viennent de la mesure, pas d'un recalcul côté écran.
