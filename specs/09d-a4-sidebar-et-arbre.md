# 09d — A4 : la sidebar et son arbre

## Objectif

La sidebar 252 px de `A4` : barre de filtre, arbre projets → bases → schémas → tables et
vues, et son pied. C'est le composant de navigation principal du produit.

## Dépend de

`04` (`Sidebar`, `TreeRow`, `SidebarFilterBar`, `ConsoleFooterButton`), `09b` (les
données et les états de connexion).

## Périmètre

- La sidebar à **252 px**, contre les 212 px de `04`.
- L'arbre à quatre niveaux, avec le projet actif déplié et les voisins repliés.
- Le dépliage paresseux : les objets d'un schéma sont demandés au dépliage, pas avant.
- L'état de connexion de chaque base, visible.
- Le filtre, qui porte sur ce qui est **chargé**.
- Le pied : « + Ajouter une base » et rafraîchir.

## Hors périmètre

- **Un second composant de sidebar.** Correction d'une erreur de cette spec : `Sidebar` de `04`
  fait **212 px** (partagée par `A5` → `A9`), non 300, et l'écart avec les 252 px de `A4` tient à
  une seule propriété. C'est donc une **variante de largeur**, pas un composant différent — deux
  composants pour un pixel de structure identique seraient une duplication.
- **Le glisser-déposer, le renommage, la suppression.** Rien de tout cela n'est maquetté.
- **La recherche globale `⌘P`** que la barre de filtre affiche en rappel → un scope à part,
  puisqu'elle traverse tous les projets et n'est maquettée nulle part en action.

## Approche

### Le dépliage est paresseux, et c'est la contrainte transverse

Demander tous les objets de tous les schémas de toutes les bases au chargement serait
exactement ce que `06c` a découpé pour éviter. Un schéma se déplie → une commande. Un
schéma replié n'a rien coûté.

Corollaire : un dépliage peut **échouer**. La ligne doit alors le dire à sa place, sans
vider l'arbre — une erreur de réseau sur un schéma ne doit pas faire disparaître les
autres.

### Le filtre ne peut porter que sur ce qui est chargé

`SidebarFilterBar` filtre les lignes visibles. Il ne peut pas trouver une table d'un
schéma jamais déplié : elle n'a jamais traversé l'IPC.

**Correction d'une erreur de cette spec** : le mockup écrit « Filtrer l'arborescence… » dans la
sidebar, ce qui est exact et ne promet rien de trop — `SidebarFilterBar` porte déjà ce
placeholder depuis `04`. Le « Chercher un objet… ⌘P » que cette spec lui attribuait est en
réalité dans la **barre du centre**, où il promet bien une recherche globale : c'est donc `09e`
que le point concerne, pas `09d`.

Reste que l'utilisateur qui tape « orders » sans avoir déplié le schéma ne verra rien. Le mot
« arborescence » le dit implicitement — on filtre ce qui est affiché — et c'est le mieux que
puisse faire un libellé. La vraie réponse est la recherche globale `⌘P`, hors périmètre.

### Quatre états de connexion, quatre rendus distincts

`09b` les livre. Ici il faut qu'ils se distinguent **sans couleur seule** : un point vert
et un point rouge sont indiscernables pour une part des utilisateurs. Le libellé ou
l'icône doit porter l'information, la couleur la renforcer.

Le handoff ne maquette qu'un état — la base ouverte. Les trois autres sont donc à
composer avec ce qui existe déjà (`Badge`, `Dot` de `02`), sans inventer de forme.

### Ce que jsdom ne peut pas dire

`04` a coûté quatre défauts de mise en page. L'indentation par niveau, la largeur de
252 px et l'absence de débordement horizontal des lignes vont dans `e2e/`.

`TreeRow` porte déjà sa table d'indentation littérale — `['8px','22px','36px','52px']`,
gaps 14/14/**16** — et **aucune formule ne la produit**. Quatre niveaux exactement : `A4`
n'en a pas cinq, et en ajouter un demanderait une valeur que le handoff ne donne pas.

## Terminé quand

- Comparaison visuelle contre la sidebar de `A4`, sans écart.
- 252 px mesurés, et l'indentation des quatre niveaux conforme à la table de `TreeRow`.
- Un schéma replié n'a déclenché **aucune** commande, vérifié par compteur.
- Un dépliage qui échoue le dit sur sa ligne et **ne vide pas l'arbre**.
- Les quatre états de connexion se distinguent autrement que par la couleur.
- Le filtre annonce qu'il porte sur ce qui est chargé.
- Parcours clavier complet de l'arbre : flèches pour naviguer et déplier, comme un
  `treeitem` l'exige.
- Aucune ligne ne déborde horizontalement, à 252 px comme après élargissement.
- Aucune couleur littérale hors `tokens.json`.
