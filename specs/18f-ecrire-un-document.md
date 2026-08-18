# 18f — Écrire dans un document

## Goal

Appliquer les modifications en attente de `A6` à des documents MongoDB : la prévisualisation, puis
l'écriture — ou son refus motivé.

## Dépend de

`18a` (les transactions exigent un jeu de réplicas), `18e` (la lecture, qui donne les clés),
`11c`/`11d` (le panneau et l'application).

## Scope

- `preview_updates()` : les commandes `mongosh` qui partiront, **exactement** celles-là.
- `apply_updates()` : `updateOne` par modification, dans une transaction.
- Le refus quand le déploiement ne sait pas transiger.
- Le patch inverse, comme `11d` le rend pour SQL.

## Not in this scope

- **Insérer ou supprimer un document.** `A6` modifie des cellules. Sa propre spec.
- **Modifier un champ imbriqué.** `A5` affiche un document imbriqué en JSON dans une cellule ;
  l'éditer demanderait un éditeur de JSON, pas un champ de saisie. Explicitement remis.

## Approche

### Le bloc annonce « ce qui sera exécuté », donc il doit l'être

`11c` affiche le texte rendu par `preview_updates`, et `11d` a posé la règle : s'il n'est pas
exactement ce qui partira, il est **pire qu'absent** — c'est le dernier endroit où l'on vérifie avant
d'écrire en production. Pour MongoDB, ce texte est une suite de `db.collection.updateOne(…)` en
`mongosh`, et `apply_updates` exécute ces mêmes opérations — pas une reconstruction.

Conséquence pratique : l'échappement des valeurs se fait **une fois**, dans la fonction qui rend le
texte, et l'exécution part de la même structure. C'est ce que `11d` a fini par faire en SQL après
avoir découvert que le pilote refusait de typer certains paramètres.

### Le filtre porte l'ancienne valeur, comme le `WHERE` de `11d`

`{_id: …, champ: ancienne}` : zéro document modifié signifie que le document a changé depuis la
lecture, et **toute** la transaction est annulée. C'est la garantie de `06a`, et elle transpose
exactement.

**Une nuance qui n'existe pas en SQL** : `{champ: null}` ne trouve pas un document où le champ est
*absent*, alors que la grille affichait la même cellule vide (`18e`). Une modification partant d'une
cellule vide doit donc filtrer sur les deux cas — `{$in: [null]}` avec `$exists` — sinon elle
n'affecte aucun document et annule la transaction sans que l'utilisateur comprenne pourquoi. C'est
**le défaut le plus probable de cette spec**, et il vient de la seule différence de modèle qui
compte.

### Sans jeu de réplicas, l'écriture est refusée — pas tentée

`18b` connaît le type de déploiement dès la connexion. Sur un `mongod` isolé, `apply_updates` **refuse
avec sa raison** : « ce serveur ne sait pas ouvrir de transaction, trois modifications pourraient
s'appliquer à moitié ». Écrire quand même serait rompre la promesse de `06a` sans le dire, et
l'interface de `11d` sait déjà afficher un refus.

Le refus arrive **avant** le premier `updateOne`, jamais après le second.

### Le patch inverse est une suite de `updateOne` symétrique

`11d` le rend pour SQL en échangeant valeur et attendue. La même transformation s'applique, et la même
réserve tient : il n'est pas persisté (`15d` en décidera).

## Done when

- [ ] Une modification s'applique contre un jeu de réplicas réel, et la relecture la montre.
- [ ] Le texte prévisualisé est **celui qui part** — vérifié en comparant les deux, pas en le
      relisant.
- [ ] Une modification concurrente annule **toute** la transaction, et le dit.
- [ ] Une valeur partant d'une cellule vide affecte le document, que le champ soit nul ou absent —
      les deux cas testés.
- [ ] Sur un `mongod` isolé, l'écriture est refusée avec sa raison, et **rien n'est écrit** —
      vérifié en relisant.
