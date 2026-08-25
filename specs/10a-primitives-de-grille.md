# 10a — Primitives : `VirtualGrid` et `Popover`

## Objectif

Les deux briques qu'`A5` réclame et qu'aucune spec n'a livrées : une grille **virtualisée**,
et un panneau flottant ancré à un élément.

## Dépend de

`02` (tokens, `Icon`), `09a` — dont `DataTable`, qui reste tel quel.

## Périmètre

- `VirtualGrid` : colonnes à largeur fixe, hauteur de ligne constante, ne monte que les
  lignes visibles plus une marge, en-tête collant, sélection d'une ligne.
- `Popover` : panneau ancré à un déclencheur, fermé par `Échap`, par un clic hors de lui et
  par la perte du focus ; rendu **dans le flux** du déclencheur, pas dans un portail.
- Les deux dans la galerie (`?gallery`), avec les cas qui les cassent : 100 000 lignes,
  zéro ligne, popover près du bord droit.

## Hors périmètre

- **Colonnes redimensionnables à la souris** : le mockup n'en montre aucune poignée.
- **La densité de ligne paramétrable** (20–36 px) → `15` (`A10`). La hauteur est une prop,
  sa valeur par défaut est celle du mockup (26 px).
- **Le défilement horizontal synchronisé de deux grilles**, dont personne n'a besoin.
- **Tout ce qui est propre à `A5`** — filtres, tri, pastilles, gouttière `#` — qui appartient
  aux specs suivantes. `VirtualGrid` ne connaît ni `Value`, ni `Filter`.

## Approche

### Pourquoi une seconde grille, et pas `DataTable` virtualisé

`09a` a séparé les deux délibérément, et le commentaire de `DataTable` le dit déjà : un vrai
`<table>` donne gratuitement l'annonce « en-tête, valeur » à la voix, ce qu'une grille de
`<div>` doit réimplémenter. Mais un `<table>` ne se virtualise pas sans mentir sur sa
hauteur, et `A5` doit tenir 5 000 lignes — le palier maximal de `RowLimit`.

`VirtualGrid` est donc `role="grid"` avec `aria-rowcount` sur le **total**, et
`aria-rowindex` sur chaque ligne montée. C'est ce qui permet à un lecteur d'écran d'annoncer
« ligne 812 sur 5 000 » alors que 812 est la troisième ligne présente dans le DOM. Sans ces
deux attributs, la virtualisation ment à l'arbre d'accessibilité au lieu de mentir seulement
au navigateur.

### La fenêtre visible est calculée depuis des props, pas mesurée

**jsdom ne calcule aucune mise en page** (`DEFAUTS.md`, règle 2). Une virtualisation qui lit
`clientHeight` rendrait zéro ligne sous Vitest, et le test « seules les lignes visibles sont
montées » passerait pour la mauvaise raison — c'est exactement le défaut 3 de la même liste.

`VirtualGrid` calcule donc sa fenêtre depuis `rowHeight`, `viewportHeight` et la position de
défilement, toutes trois des **valeurs**. Le composant hôte peut passer une hauteur mesurée ;
le test passe une hauteur choisie. La mesure réelle — que la hauteur du conteneur suit bien
celle du panneau — est un test Playwright, pas un test Vitest.

Corollaire : le sabotage qui doit faire tomber le test est « monter toutes les lignes ». Un
test qui compte les lignes rendues sans que ce sabotage le fasse tomber est à réécrire.

### Le popover se ferme de trois façons, et les trois sont testées

Fermer sur `Échap` seulement laisse un panneau ouvert derrière un clic ailleurs ; fermer sur
clic extérieur seulement le laisse ouvert au clavier. La perte de focus est la troisième, et
c'est celle qu'on oublie : sans elle, tabuler hors du popover laisse un panneau visible que
plus rien ne concerne.

Le contenu n'est pas typé par la primitive : `10d` y mettra une liste d'opérateurs, `10e` une
liste de colonnes. `Popover` fournit le placement, l'ancrage, la fermeture et le renvoi du
focus au déclencheur ; le rôle ARIA du contenu est décidé par l'appelant, parce qu'une liste
d'options et un formulaire n'ont pas le même.

### Pas de portail

Un portail vers `document.body` simplifierait le débordement, mais `A5` vit dans un
`SplitPane` dont les panneaux ne coupent pas leur contenu à cet endroit, et un portail
casserait l'ordre de tabulation naturel — le popover se retrouverait en fin de document.
Rendu sur place, `Échap` et `Tab` fonctionnent sans code de rattrapage.

Conséquence assumée : un popover ancré près du bord droit doit se replacer lui-même. Il le
fait en basculant son alignement, et c'est la galerie qui le montre.

## Terminé quand

- Avec 100 000 lignes, le nombre de nœuds `role="row"` montés reste borné — et le test tombe
  si la virtualisation est retirée.
- `aria-rowcount` porte le total, `aria-rowindex` l'indice réel, vérifiés sur une ligne qui
  n'est pas la première du DOM.
- Le défilement change les lignes montées sans changer leur nombre.
- L'en-tête reste visible après défilement — mesuré dans Playwright, pas dans jsdom.
- La sélection d'une ligne porte `aria-selected` et se pilote au clavier (`↑`, `↓`).
- Le popover se ferme sur `Échap`, sur clic extérieur et sur perte de focus, et le focus
  revient au déclencheur dans les trois cas.
- Un popover ancré à 20 px du bord droit reste entièrement visible.
- Les deux primitives sont dans la galerie, cas vides compris.
- **La galerie porte les deux débordements**, pas un seul : des colonnes plus larges que le cadre
  *et* des colonnes plus étroites. Le second manquait, et la bande d'en-tête s'arrêtait après la
  dernière colonne sans que rien ne le dise (`DEFAUTS.md` n° 125). Le fond et le filet de l'en-tête
  sont donc sur la **ligne**, comme ceux de la ligne de filtres, et non sur ses cellules.
- Aucune couleur littérale hors `tokens.json`.
