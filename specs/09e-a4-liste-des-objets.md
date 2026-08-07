# 09e — A4 : le centre, liste des objets

## Objectif

Le panneau central de `A4` : bande d'onglets, barre de fil d'Ariane avec sa recherche et
son contrôle segmenté, et le tableau des objets du schéma.

## Dépend de

`03` (`SplitPane`, `TabStrip`), `09a` (`SegmentedControl`, `DataTable`), `09b` (les
objets d'un schéma).

## Périmètre

- La bande d'onglets 34 px, avec l'onglet actif à `border-top 2px accent`.
- La barre de fil d'Ariane 34 px : chemin, champ de recherche, contrôle segmenté.
- Le tableau des objets : Nom, Lignes, Taille, Col., Clé primaire, Dernier ANALYZE,
  Commentaire.
- La sélection d'une ligne, qui alimente le panneau droit de `09f`.
- Le filtrage par le contrôle segmenté : Tables · Vues · Fonctions · Index.

## Hors périmètre

- **L'ouverture d'une table** → `10` (`A5`). Le double-clic et le bouton « Ouvrir les
  données » de `09f` y mèneront ; ici la sélection ne fait que renseigner le panneau droit.
- **La persistance des onglets entre sessions** : `03` l'a explicitement laissée de côté,
  et rien ne l'a réclamée depuis.
- **Le tri du tableau.** Aucun indicateur de tri n'est maquetté sur ce tableau, à la
  différence de `A5`. Ne pas l'inventer.
- **Les index en tant qu'objets listés.** Le contrôle segmenté annonce « Index 31 », mais
  le tableau du mockup ne montre que des tables. Voir § Approche.

## Approche

### Le compte du contrôle segmenté vient des données, jamais d'une constante

« Tables 8 · Vues 2 · Fonctions 6 · Index 31 » : quatre nombres que `06c` sait produire
pour un schéma. Les coder en dur les rendrait faux dès la première base réelle — et c'est
le genre de valeur qu'on oublie de brancher parce qu'elle *ressemble* à du bon.

Le test doit donc vérifier qu'ils suivent les données, contre le schéma de test dont la
composition est connue (`scripts/schema-test-pg.sql` : 4 tables, 1 vue, 2 fonctions,
6 index).

### Ce que « Index » affiche est un trou du handoff

Un index n'a ni « Lignes », ni « Clé primaire », ni « Dernier ANALYZE » — trois des sept
colonnes du tableau. Le mockup ne montre jamais le segment « Index » actif, donc rien ne
dit quelles colonnes il porte.

Décision : les colonnes sans objet affichent **un tiret cadratin**, et non zéro ni du vide.
« 0 ligne » sur un index serait un mensonge ; du vide ressemblerait à une donnée manquante.
Question consignée au § « À trancher » — un jeu de colonnes propre à chaque type serait la
vraie réponse, et c'est du design.

### Le fil d'Ariane du centre double celui de la barre de titre

`A4` affiche `analytics · public` dans la pastille projet **et** un fil d'Ariane dans le
centre. Ce n'est pas une redondance à supprimer : celui de la barre de titre suit la base
**ouverte**, celui du centre suit l'**onglet actif**. Avec plusieurs onglets, ils diffèrent.

À écrire dans le code, parce qu'un relecteur y verra un doublon.

### Le tableau vide n'est pas un tableau cassé

Un schéma sans table est normal — `public` d'une base neuve. L'état vide doit le dire, et
se distinguer d'un chargement en cours et d'un échec. Le handoff n'en maquette aucun des
trois ; le minimum défendable est une ligne de texte, sans illustration inventée.

## Terminé quand

- Comparaison visuelle du centre contre `A4`, sans écart.
- Les quatre comptes du contrôle segmenté suivent les données, vérifié contre le schéma
  de test aux valeurs connues.
- Changer de segment change le contenu du tableau, et le compte ne change pas.
- Une ligne sélectionnée porte `aria-selected` et alimente `09f`.
- Les colonnes sans objet portent un tiret cadratin, jamais zéro.
- Vide, chargement et échec se distinguent, et aucun ne ressemble aux deux autres.
- Le tableau ne déborde pas horizontalement à 960 px de fenêtre — la contrainte
  minimale, à vérifier et non à supposer.
- Parcours clavier : onglets, recherche, segments, lignes du tableau.
- Aucune couleur littérale hors `tokens.json`.
