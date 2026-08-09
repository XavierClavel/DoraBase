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
- Le rendu d'une `Value` selon son genre : `NULL` distinct, nombres et dates en mono,
  nombres alignés à droite, texte en Nunito.
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
| `text` | Nunito quand c'est de la prose, mono sinon — voir ci-dessous |
| `json` | mono, sur une ligne, tronqué |
| `binary` | `\x…` avec la taille, jamais le contenu |

Le mockup rend `note` — la dernière colonne — en Nunito 11.5 px et tout le reste en mono. La
règle lisible : **le mono est la valeur par défaut, Nunito est l'exception**, comme `09a`
l'avait déjà tranché à l'envers de l'intuition pour `DataTable`.

### La pastille de `status` : la forme oui, les couleurs non

Le mockup rend `status` en pastille verte, et son popover annonce quatre couleurs — `paid`
vert, `pending` ambre, `refunded` rouge, `cancelled` neutre. Ce sont des mots d'une table
fictive, pas une règle : rien ne dit à `A5` que `refunded` est un mauvais état, et une base
réelle aura `active`, `draft`, `archived`.

Décision : la pastille est rendue pour les colonnes dont le **catalogue** dit qu'elles sont
énumérées — un fait, pas une devinette — et dans le style neutre. Aucune couleur sémantique
n'est inventée à partir du vocabulaire. Le point est consigné au § « À trancher » de
`specs/README.md` : associer un sens à des valeurs métier est du design, ou une préférence.

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
- Les huit genres de `Value` ont chacun un rendu vérifié, `NULL` compris.
- Une table de 100 000 lignes affiche le palier demandé, et le nombre de nœuds montés reste
  borné.
- La barre d'état donne le compte de la fenêtre et la durée rendus par `RowWindow`, jamais
  des valeurs recalculées côté front.
- Vide, en cours et en échec se distinguent, et aucun ne ressemble aux deux autres.
- Aucune couleur littérale hors `tokens.json`.
