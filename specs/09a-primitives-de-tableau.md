# 09a — Primitives de tableau et de statistiques

## Objectif

Les trois primitives que `A4` réclame et que `02` n'a pas livrées. Livrées avec leur
entrée de galerie, donc vérifiables sans écran.

## Dépend de

`02` (tokens, `Badge`, `Button`), `04` (`TreeRow`, `ColumnRow` — déjà là).

## Périmètre

- **`SegmentedControl`** : Tables 8 · Vues 2 · Fonctions 6 · Index 31, à droite du
  fil d'Ariane de `A4`.
- **`StatTile`** : les deux tuiles du panneau droit (Lignes 1.9 M, Taille 2.1 GB).
- **`DataTable`** : le tableau dense d'objets — sept colonnes, ligne sélectionnable.
- Le jeton manquant : le fond de ligne sélectionnée, `accent` à 9 %.

## Hors périmètre

- **La grille de `A5`** → `10`. Celle-ci est virtualisée, éditable, à colonnes
  redimensionnables ; `DataTable` liste des objets et n'a rien de tout cela. Les
  confondre produirait une abstraction qui ne sert bien ni l'une ni l'autre.
- **Le tri des colonnes de `DataTable`.** Le mockup ne montre aucun indicateur de tri sur
  ce tableau, contrairement à `A5` qui en a. Rien à inventer.
- **Le contrôle segmenté à choix multiple.** `A4` en fait un filtre exclusif.
- **L'assemblage de `A4`** → `09c` à `09f`.

## Approche

### `SegmentedControl` n'est pas un `RadioGroup`

Tentant, et faux. Trois écarts relevés sur le mockup :

| | `RadioGroup` (`08a`) | `SegmentedControl` |
| --- | --- | --- |
| Hauteur | 30 px | **25 px** |
| Actif | fond accent | fond **`--dark`** (`#23201C`) |
| Contenu | libellé | libellé **+ compte** à `opacity .55` |

Le fond sombre est le point qui compte : ce n'est pas une variante de couleur mais une
autre intention. L'accent signale « ce que vous avez choisi de faire » ; l'encre signale
« ce que vous regardez ». Réemployer `RadioGroup` avec des surcharges donnerait un
composant dont la moitié des règles se battent, comme `.envOption` l'a montré en `08d`.

En revanche, la **mécanique** est la même : radios natives partageant un `name`, pour
les flèches gratuites. Ce qui se factorise est le comportement, pas l'habillage.

### `DataTable` est un vrai `<table>`

Sept colonnes, un en-tête, des lignes sélectionnables. Un `<table>` avec `<th scope>`
donne gratuitement la navigation par cellule des lecteurs d'écran et l'association
en-tête ↔ cellule — qu'une grille de `<div>` doit réimplémenter en `role="grid"`.

`A5` aura besoin de l'inverse (virtualisation, donc `<div>` positionnés), et c'est
précisément pourquoi les deux composants sont séparés.

La ligne sélectionnée porte `fond accent 9 %` **et** `inset 2px 0 0 accent` — un liseré
intérieur à gauche, pas une bordure : une bordure décalerait le contenu d'un pixel.

### Ce que jsdom ne peut pas dire

Les largeurs de colonnes, l'alignement des nombres à droite et le liseré intérieur sont
hors de portée de Vitest. Ils vont dans `e2e/`.

Testable en Vitest : la sélection, `aria-selected`, l'association en-tête ↔ cellule, le
clavier du contrôle segmenté, le formatage des valeurs.

### Le formatage des nombres appartient ici

« 1.9 M », « 2.1 GB », « 128 k » : le mockup abrège. La fonction qui le fait est **pure**,
donc exhaustivement testable, et vaut mieux qu'un `toLocaleString` par appelant — trois
écrans afficheront ces mêmes comptes.

**Attention au piège** : `1_900_000` doit rendre « 1.9 M », mais `999` rend « 999 » et non
« 1.0 k ». Et les tailles sont en puissances de 1024 quand les comptes sont en
puissances de 1000 — `2.1 GB` de `pg_total_relation_size` est un compte d'octets.

## Terminé quand

- Les trois primitives existent avec leur entrée de galerie.
- `SegmentedControl` expose ses comptes, se pilote aux flèches, et une seule tabulation
  traverse le groupe.
- `DataTable` associe chaque cellule à son en-tête, vérifié par le rôle et non par la
  position.
- Une ligne sélectionnée porte `aria-selected` et son liseré intérieur.
- Le formatage rend « 999 », « 1.0 k », « 1.9 M », « 2.1 GB » — et « 0 » pour zéro, non
  « 0.0 k ».
- Aucune couleur littérale hors `tokens.json`.
- Les trois faits de mise en page hors de portée de jsdom sont dans `e2e/`.
