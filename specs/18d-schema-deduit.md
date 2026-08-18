# 18d — Le schéma déduit d'une collection

## Goal

Produire les `ColumnInfo` d'une collection par échantillonnage, avec la **fréquence** de chaque
champ — ce dont `A5`, `A9` et `13c` ont besoin, et qu'aucun catalogue MongoDB ne rend.

## Dépend de

`18a`, `18c`.

## Scope

- L'échantillonnage : combien de documents, et comment ils sont choisis.
- La fréquence d'un champ, calculée **dans MongoDB**.
- Le type d'un champ, et ce qu'on affiche quand il en a plusieurs.
- Le champ transporté jusqu'à l'écran, `13c` l'affichant.

## Not in this scope

- **L'affichage** → `13c` (sidebar) et `14a` (tableau des colonnes de `A9`).
- **Les champs imbriqués au-delà d'un niveau.** Le mockup montre `items[]` sans le détailler.
- **Le réglage de la taille de l'échantillon** → `15`, une préférence.

## Approche

### La fréquence est un champ du modèle, pas une décoration de `A8`

`ColumnInfo` gagne une fréquence optionnelle. `None` pour PostgreSQL, où la colonne est **déclarée** :
elle existe pour toutes les lignes, la question ne se pose pas. `Some(0.98)` pour MongoDB.

Deux conséquences voulues : `A9` peut l'afficher pour une collection sans code propre à MongoDB, et
un champ à moins de 100 % se distingue partout où les colonnes s'affichent — pas seulement dans la
section que `13c` dessine.

### `$sample` puis `$group`, en une passe, côté serveur

Compter côté DoraBase demanderait de faire traverser l'IPC aux documents échantillonnés, ce que la
contrainte transverse du projet interdit. Le pipeline agrège dans MongoDB : `$sample` pour tirer,
`$objectToArray` pour énumérer les champs, `$group` pour compter. Ce qui traverse est une liste de
champs, jamais un document.

**`$sample` est aléatoire, donc deux lectures peuvent ne pas donner les mêmes champs.** Un champ rare
apparaît ou non selon le tirage. C'est inhérent, et c'est pourquoi la fréquence est affichée : elle
dit à quel point s'y fier. La taille de l'échantillon est **écrite dans le code avec sa raison**, pas
choisie au hasard — assez pour voir les champs qui comptent, assez peu pour rester instantané.

### Un champ de plusieurs types se dit ainsi

Une collection réelle porte des champs hétérogènes : `total` en `int` dans les anciens documents, en
`decimal` dans les nouveaux. Le type rendu est le **majoritaire**, et le nom natif dit qu'il y en a
plusieurs — `int | decimal`. Choisir silencieusement le premier vu ferait croire à une collection
homogène, et c'est exactement l'erreur qu'une migration à moitié faite produit.

La catégorie, elle, doit être **unique** : elle décide du glyphe et de l'alignement (`06a`). Celle du
type majoritaire.

## Done when

- [ ] Les champs d'une collection réelle apparaissent, avec leur fréquence.
- [ ] Aucun document ne traverse l'IPC — vérifié en comptant ce que rend la commande.
- [ ] Un champ absent de la moitié des documents rend une fréquence proche de 0,5.
- [ ] Un champ hétérogène rend un type qui le dit, et une catégorie unique.
- [ ] La fréquence est `None` pour PostgreSQL, et aucun écran ne s'en trouve changé.
