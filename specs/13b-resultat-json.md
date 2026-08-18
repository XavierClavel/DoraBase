# 13b — `A8` : le résultat en JSON dépliable

## Goal

Afficher des documents : un arbre JSON qu'on déplie, avec « Tout replier » et « Copier ».

## Dépend de

`13a` (donc `18b` et `18g`), `10f` (`JsonColore`).

## Scope

- L'arbre des documents, replié au premier niveau, dépliable nœud par nœud.
- « Tout replier », « Copier » — le document sélectionné, pas le résultat entier.
- Le compte et la durée : `4 docs · 61 ms`.

## Not in this scope

- **La vue tabulaire d'un résultat mongo.** Le mockup ne la montre pas, et aplatir des documents
  hétérogènes en colonnes est une décision de produit à part.
- **L'édition d'un document depuis le résultat** — `A6` pour les tables, rien d'équivalent ici.

## Approche

### Un arbre, pas un bloc de texte coloré

`JsonColore` (`10f`) rend un JSON **entier**, ce qui convient à une ligne de table. Un document mongo
peut avoir cinquante champs et trois niveaux : il faut le replier. C'est un composant distinct, et le
premier de ce projet à avoir un état d'ouverture par nœud.

### Replié au premier niveau, pas déplié

Un résultat d'agrégation à quatre documents déplié entièrement remplit l'écran de crochets. Le
mockup montre les documents dépliés d'un cran — assez pour lire les clés, pas assez pour noyer.

### « Copier » copie **un** document

Copier le résultat entier ferait passer par le presse-papiers ce que la contrainte transverse du
projet interdit de faire traverser l'IPC. Et ce qu'on copie sert à le rejouer ailleurs, ce qui se
fait document par document.

## Done when

- [ ] Un document se déplie et se replie, nœud par nœud.
- [ ] « Tout replier » ramène l'arbre à son état initial.
- [ ] Les types sont distingués : nombre, chaîne, `ObjectId`, date.
- [ ] Le compte et la durée viennent de la mesure, pas d'un recalcul.
