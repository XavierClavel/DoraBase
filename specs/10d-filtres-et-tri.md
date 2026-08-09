# 10d — `A5` : filtres par en-tête et tri multiple

## Objectif

La seconde ligne d'en-tête — un champ de filtre par colonne — son popover d'opérateur, et le
tri à plusieurs critères numérotés.

## Dépend de

`06d` (`Filter`, `FilterOperator`, `SortKey`), `10a` (`Popover`), `10c` (la grille et
`read_rows`).

## Périmètre

- La ligne de filtres : un champ 20 px par colonne, opérateur en gras à gauche.
- Le popover d'opérateur : les cinq de `FilterOperator` (`=`, `≠`, `in`, `~`, `is null`).
- Le tri : clic sur un en-tête, sens, rang en pastille quand plusieurs colonnes trient.
- Les teintes : colonne filtrée à 10 %, colonne triée à 6 %.
- Les annotations « filtré » et « tri ↓ » dans la liste de colonnes de la sidebar (`10b`).

## Hors périmètre

- **Les chips de la toolbar** qui résument les filtres actifs → `10e`, qui les lit dans
  l'état créé ici.
- **Le bloc « Valeurs fréquentes »** du popover → voir § Approche : il est *dans* le mockup
  et *hors* de ce périmètre, avec sa raison.
- **La liste `in`** et son éditeur multi-valeurs : le mockup montre l'entrée de menu, jamais
  le panneau. Voir § Approche.
- **Les filtres sur colonne masquée** — la visibilité des colonnes est `10e`.

## Approche

### Un filtre part au serveur, il ne trie pas la fenêtre

C'est la décision structurante de cette spec. Filtrer les 500 lignes déjà reçues serait
immédiat, et faux : l'utilisateur croirait voir toutes les commandes payées de la table alors
qu'il ne verrait que celles des 500 premières lignes lues. Un filtre modifie donc la
`RowQuery` et **relance** `read_rows`.

Même raisonnement pour le tri : trier la fenêtre côté client trierait un échantillon
arbitraire. `RowQuery.sort` existe, l'adaptateur le traduit en `ORDER BY`, et c'est la base
qui ordonne.

Le test qui compte n'est donc pas « la grille affiche les bonnes lignes » — un tri client le
ferait passer — mais « la requête envoyée porte le filtre », et un aller-retour réel dont le
résultat ne peut pas venir de la fenêtre précédente.

### Chaque frappe ne déclenche pas une requête

Un filtre relancé à chaque caractère envoie cinq requêtes pour `paid`. Le filtre est appliqué
sur `Entrée` et à la perte de focus — pas sur un anti-rebond au jugé, dont la durée serait une
valeur inventée de plus. Un champ modifié mais non appliqué se distingue visuellement d'un
filtre actif ; le mockup donne les deux états (bordure accent 1.5 px pour celui en cours de
saisie, bordure accent 1 px pour celui appliqué).

### « Valeurs fréquentes » exigerait une requête d'agrégat, et une décision

Le popover du mockup affiche `paid 72% · pending 14% · refunded 8% · cancelled 6%`. Obtenir
ces chiffres demande un `GROUP BY` sur toute la table — sur `orders` et ses 1,9 million de
lignes, c'est un parcours complet déclenché par l'ouverture d'un menu.

Ce n'est pas une décision d'implémentation, c'est un arbitrage produit : ou bien on
échantillonne (et les pourcentages sont approximatifs, ce que l'écran devrait dire), ou bien
on interroge le catalogue (`pg_stats.most_common_vals`, gratuit mais limité aux colonnes
analysées et propre à PostgreSQL), ou bien on l'assume coûteux et on le déclenche
explicitement.

Le bloc n'est donc **pas rendu** dans cette spec, et la question part au § « À trancher ».
Rendre un bloc vide serait pire ; rendre des pourcentages faux serait bien pire. La piste
`pg_stats` est la plus prometteuse — c'est déjà là que `06c` prend ses estimations.

### `in` : l'entrée existe, le panneau n'est pas maquetté

« dans la liste… » et ses points de suspension annoncent un second panneau que le handoff ne
montre nulle part. Le minimum défendable : l'opérateur `in` est proposé, et sa valeur se
saisit dans le même champ, séparée par des virgules, avec un texte d'aide qui le dit. Un
éditeur de liste à part serait une invention. Trou consigné.

### Le rang de tri est l'ordre du vecteur, et il est visible

`SortKey` porte la remarque depuis `06a` : « leur ordre dans le vecteur **est** leur rang ».
La pastille numérotée du mockup en est l'affichage. Elle n'apparaît qu'à partir de deux
critères — un « 1 » solitaire sur la seule colonne triée serait du bruit, et le mockup n'en
montre qu'un parce qu'il y en a un seul... visible. Décision assumée : pastille dès qu'il y a
deux critères, flèche seule sinon.

Ajouter un critère se fait au clic avec la touche `⌘` enfoncée ; un clic simple remplace le
tri. Le handoff ne le dit pas ; c'est la convention de tous les tableurs et de tous les
clients SQL, et l'inventer autrement serait gratuit.

## Terminé quand

- Comparaison visuelle contre `A5` : ligne de filtres, teintes de colonne, flèche et
  pastille de rang, popover ouvert sur `status`.
- Un filtre appliqué modifie la `RowQuery` envoyée — vérifié sur la requête, pas sur
  l'affichage — et le test tombe si le filtrage est fait côté client.
- Un tri sur une colonne, puis un second en `⌘`-clic, produit deux `SortKey` dans l'ordre du
  clic, et la grille suit.
- Vider un filtre le retire de la requête ; il ne reste aucune trace teintée.
- Le popover se pilote entièrement au clavier et rend le focus au champ.
- La liste de colonnes de la sidebar annote « filtré » et « tri ↓ » d'après le même état.
- Un filtre sur une colonne de type incompatible échoue **avec le message du moteur**, sans
  planter la grille.
- Aucune couleur littérale hors `tokens.json`.
