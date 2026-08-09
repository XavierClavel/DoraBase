# 10c — `A5` : la grille de données et sa barre d'état

## Objectif

Afficher les lignes d'une table. C'est le premier écran qui emploie la lecture paginée de
`06d`, écrite et testée depuis le 6 août et **appelée par personne**.

## Dépend de

`06d` (`RowQuery`, `RowWindow`, `Value`), `09b` (registre), `10a` (`VirtualGrid`), `10b`
(l'onglet qui désigne la table).

## Périmètre

- **Une commande Tauri `read_rows`**, qui n'existe pas : l'adaptateur sait lire une fenêtre,
  aucune commande ne l'expose.
- La grille : gouttière `#` de 30 px, en-tête 26 px, lignes 26 px, sélection à filet bleu.
- Le rendu d'une `Value` selon son genre : `NULL` distinct, tout en mono, nombres alignés à
  droite et groupés par milliers.
- La barre d'état 26 px : nombre de lignes, durée, résumé de la requête.
- Les états vide, en cours et en échec.

## Hors périmètre

- **Les filtres et le tri** → `10d`. Ici la requête est « toute la table, `LIMIT` par
  défaut, sans tri ».
- **La toolbar** → `10e`. Le palier de `LIMIT` est celui par défaut et n'est pas réglable.
- **Le panneau droit de ligne** → `10f`. La sélection existe déjà et n'alimente encore rien.
- **La pagination au-delà de la fenêtre.** `RowQuery.offset` reste à 0 : `A5` montre au plus
  `LIMIT` lignes et sa barre d'état le dit. Ce que le mockup montre.
- **L'édition** → `11` (`A6`).

## Approche

### La commande manquait, et son absence était invisible

`06d` a livré `PostgresAdapter::rows` et `ConnectionRegistry::rows`, testés contre une vraie
base — dont un test qui mesure le **coût** du chemin, parce que la fenêtre rendue ne prouve
pas que la base n'a pas tout renvoyé (`DEFAUTS.md`, règle 5). Mais rien n'était exposé au
front : `read_rows` est ajoutée ici, sur le modèle de `list_objects` et `describe_table`.

C'est le troisième câblage manquant du projet après `load_config` (`09b`) et l'assemblage de
`A4` (`10b`). Le motif est constant : une couche complète et testée, qu'aucun appelant ne
franchit. Le garde-fou n'est pas un test unitaire de plus, c'est un test qui part de l'écran.

### La contrainte IPC transverse est enfin exercée

C'est ici qu'elle se vérifie pour de vrai : la webview reçoit une `RowWindow`, jamais un jeu
complet, et `RowLimit` est une énumération fermée — « tout » n'est pas exprimable. Le test qui
compte doit mesurer **ce qui traverse le pont**, pas ce qui s'affiche : afficher 500 lignes
en en ayant rapatrié 100 000 laisserait vert un test qui compte les lignes rendues, et c'est
exactement le défaut consigné en règle 5.

### Le formatage appartient à l'écran, et `Value` est typée pour ça

`06a` a délibérément rendu des valeurs **typées** plutôt que préformatées : seul l'écran
connaît la densité et la locale. Ce qui donne, d'après la feuille de style du mockup :

| Genre | Rendu |
| --- | --- |
| `null` | `NULL`, en `rgba(35,32,28,.35)` — jamais du vide, qui se confondrait avec `''` |
| `int`, `float` | mono, aligné à droite, séparateur de milliers fine espace |
| `timestamp` | mono, tel que le moteur le rend — pas de reformatage local |
| `text` | mono, tel quel — voir ci-dessous |
| `json` | mono, sur une ligne, tronqué |
| `binary` | `\x…` avec la taille, jamais le contenu |

### La pastille de `status` n'est pas rendue, et le mockup se contredit lui-même

Le mockup rend `status` en pastille verte, et son popover annonce quatre couleurs — `paid`
vert, `pending` ambre, `refunded` rouge, `cancelled` neutre. Ce sont des mots d'une table
fictive, pas une règle : rien ne dit à `A5` que `refunded` est un mauvais état, et une base
réelle aura `active`, `draft`, `archived`.

Restait à savoir quelles colonnes reçoivent la **forme** de pastille, à défaut de ses
couleurs. Aucun signal ne le dit : `TypeCategory` (`06a`) n'a pas de catégorie « énumération »,
et — c'est le point qui tranche — **la sidebar du même mockup donne à `status` le glyphe `T`
du texte**. Le handoff se contredit d'un panneau à l'autre.

Décision : aucune pastille. Les valeurs de texte sont rendues comme du texte. La vraie réponse
est une annotation de colonne, donc `A10` ; l'ajouter maintenant demanderait d'inventer à la
fois le signal et la palette. Consigné au § « À trancher » de `specs/README.md`.

### Le mono est la règle, sans exception

La feuille de style du mockup pose `td { font: 500 11.5px JetBrains Mono }` pour toutes les
cellules, et une seule colonne y échappe : `note`, en Nunito. Or `note` et `coupon_code` sont
tous deux du texte, et rien dans le catalogue ne les distingue — la choisir demanderait une
règle que personne n'a écrite (« la dernière colonne » ? « la plus longue » ?).

Toutes les cellules sont donc en mono. C'est l'inverse de `DataTable` (`09a`), où le mono est
aussi la règle mais où l'exception — la colonne du nom — est **désignée par l'écran** et non
devinée d'un type.

### « ⌘E pour éditer » n'est pas affiché

La barre d'état du mockup finit par « lecture seule — ⌘E pour éditer ». L'édition est `11`.
`09e` a déjà tranché ce cas exact en retirant le rappel `⌘P` d'un champ qui ne l'honorait
pas : **un raccourci affiché qui ne répond pas est pire qu'un raccourci absent**. La mention
« lecture seule » reste — elle est vraie — et le rappel revient avec `A6`.

## Terminé quand

- Comparaison visuelle de la grille contre `A5` : gouttière, hauteurs, alignements,
  séparateurs, ligne sélectionnée.
- `read_rows` est testée contre PostgreSQL réel, et un test mesure que la base ne renvoie
  que la fenêtre — il tombe si la pagination est sabotée.
- Les huit genres de `Value` ont chacun un rendu vérifié, `NULL` compris — et `NULL` ne se
  confond pas avec la chaîne vide.
- Une table de 100 000 lignes affiche le palier demandé, et le nombre de nœuds montés reste
  borné.
- La barre d'état donne le compte de la fenêtre et la durée rendus par `RowWindow`, jamais
  des valeurs recalculées côté front.
- Vide, en cours et en échec se distinguent, et aucun ne ressemble aux deux autres.
- Aucune couleur littérale hors `tokens.json`.
