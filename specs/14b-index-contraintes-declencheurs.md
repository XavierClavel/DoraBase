# 14b — `A9` : index, contraintes et déclencheurs

## Goal

Les trois tableaux qui suivent celui des colonnes, avec ce que l'introspection en sait.

## Dépend de

`14a`, `06c`.

## Scope

- Index : nom, colonnes, unicité, méthode, taille.
- Contraintes : nom, genre, expression ou colonnes visées.
- Déclencheurs : nom, moment, événement, fonction appelée.
- Chaque tableau annonce son vide plutôt que de disparaître.

## Not in this scope

- **Créer ou supprimer un index.** `A9` montre.
- **Le détail d'un plan d'index** — c'est l'affaire de `12e`.

## Approche

### Un tableau vide se dit, il ne s'efface pas

Une table sans déclencheur n'a pas de section absente : elle a une section qui dit « aucun
déclencheur ». La différence compte — une section manquante se lit comme une donnée non chargée, et
c'est exactement le doute que `06d` a produit quand des colonnes s'affichaient vides.

### Les quatre tableaux partagent leur mise en page

`DataTable` (`09a`) les rend tous les quatre. Quatre tableaux du même écran aux hauteurs de ligne
différentes se verraient au défilement.

## Done when

- [ ] Les trois tableaux affichent ce que `TableDetail` porte.
- [ ] Une table sans index, sans contrainte ou sans déclencheur **le dit**.
- [ ] Un index unique se distingue d'un index simple autrement que par un mot en fin de ligne.
- [ ] Aucune lecture supplémentaire — les données viennent de la même introspection que `14a`.
