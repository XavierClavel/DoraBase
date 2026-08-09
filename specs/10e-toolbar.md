# 10e — `A5` : la toolbar

## Objectif

La barre de 36 px au-dessus de la grille : rafraîchir, palier de `LIMIT`, chips des filtres
et du tri actifs, « Voir le SQL », compteur de colonnes, export.

## Dépend de

`10a` (`Popover`), `10c` (la grille et `read_rows`), `10d` (l'état des filtres et du tri).

## Périmètre

- Le bouton rafraîchir 25 px : relance la requête courante.
- Le stepper `LIMIT` : les quatre paliers de `RowLimit` (100 / 500 / 1000 / 5000).
- Les chips de filtres actifs, avec leur croix, et le chip de tri.
- « Voir le SQL » : replié par défaut, dépliant le SQL réellement exécuté.
- Le compteur de colonnes `16/18` et le choix des colonnes visibles.
- Le bouton d'export, désactivé, avec l'infobulle qui dit pourquoi.

## Hors périmètre

- **L'export lui-même** → une spec dédiée. Voir § Approche : ce n'est pas un bouton, c'est
  un sujet.
- **La saisie des filtres**, qui est `10d`. Ici les chips *affichent* et *retirent*.
- **La persistance du palier ou des colonnes masquées entre sessions** → `15` (`A10`).

## Approche

### Le stepper ne peut pas produire une valeur hors des quatre paliers

`RowLimit` est une énumération fermée depuis `06a`, précisément pour que « demander tout » ne
soit pas exprimable. Le stepper monte et descend dans cette liste, et ses flèches se
désactivent aux extrémités. Un champ de saisie libre — plus « puissant » — rouvrirait le trou
que le type a été créé pour fermer.

Changer de palier relance la requête. Passer de 5000 à 100 aurait pu se contenter de tronquer
la fenêtre déjà reçue ; ne pas le faire garde **une seule** façon d'obtenir des lignes, et
donc un seul chemin à vérifier.

### « Voir le SQL » montre ce qui a été exécuté, pas ce qui aurait dû l'être

`RowWindow.sql` porte le SQL réellement envoyé — le champ existe depuis `06d` pour cet
écran. Le reconstruire côté front à partir des filtres donnerait une chaîne *plausible*, qui
divergerait le jour où l'adaptateur cite une identité ou lie un paramètre autrement. Et c'est
justement quand la requête ne fait pas ce qu'on croit qu'on ouvre ce panneau.

Corollaire : tant qu'aucune requête n'a abouti, il n'y a pas de SQL à montrer, et le bouton
le dit au lieu d'afficher une chaîne vide.

### Le mockup montre un compteur de colonnes, pas de sélecteur

`16/18` annonce que deux colonnes sont masquées, sans montrer par quoi. Le minimum
défendable, et le moins inventif : le compteur est un déclencheur de `Popover` (`10a`)
listant les colonnes avec une case à cocher chacune. Aucune forme nouvelle, aucune couleur
nouvelle — la liste reprend la présentation de la section « Colonnes de *table* » de la
sidebar, qui existe depuis `10b`.

Masquer une colonne ne change pas la requête : `SELECT *` reste, et la colonne est retirée du
rendu. Restreindre la projection serait défendable, mais rendrait le SQL affiché différent
selon un réglage d'affichage, ce qui est déroutant dans un client de bases.

Une colonne masquée qui porte un filtre garde son filtre — le chip de la toolbar reste, c'est
ce qui empêche un filtre invisible d'agir en secret.

### L'export est bloqué par la CSP, et ce n'est pas le seul obstacle

`specs/README.md` le dit depuis `08` : `img-src 'self' data:` ne couvre pas `blob:`, donc
`URL.createObjectURL` — la façon habituelle de télécharger un CSV — est refusée. Deux
réponses possibles, élargir la CSP ou écrire côté Rust, et la seconde est la bonne : elle
évite d'ouvrir la CSP pour un besoin qu'un `tauri-plugin-dialog` couvre déjà.

Mais l'export pose surtout des questions que cette spec n'a pas à trancher : exporte-t-on la
fenêtre affichée ou le résultat complet de la requête ? Avec quel encodage, quel séparateur,
quel traitement des `NULL` et des sauts de ligne ? Et sur 1,9 million de lignes, l'écriture
doit être en flux, donc entièrement côté Rust.

Le bouton est donc **présent et désactivé**, avec une infobulle qui nomme sa spec — comme
`09f` l'a fait pour ses quatre actions, et pour la même raison : quatre boutons cliquables qui
ne répondent pas sont pires qu'un bouton qui dit ce qui n'est pas encore là.

### Les chips lisent l'état, ils ne le possèdent pas

Un chip qui garderait sa propre copie du filtre divergerait de la ligne d'en-tête à la
première modification. La toolbar affiche l'état de `10d` et sait le retirer ; la croix d'un
chip et le vidage du champ correspondant font exactement la même chose, et c'est le même
test qui le vérifie.

## Terminé quand

- Comparaison visuelle de la toolbar contre `A5` : hauteurs, chips accent, stepper.
- Le stepper ne produit que les quatre paliers, et ses flèches se désactivent aux extrémités.
- Changer de palier relance la requête, vérifié sur la requête envoyée.
- Retirer un chip retire le filtre de la ligne d'en-tête, et réciproquement — un seul état.
- « Voir le SQL » affiche `RowWindow.sql`, jamais une chaîne reconstruite : le test tombe si
  le SQL rendu par la commande change et que l'affichage ne suit pas.
- Masquer une colonne change le compteur, ne change pas le SQL, et conserve un éventuel
  filtre visible en chip.
- L'export est désactivé et son infobulle nomme sa spec.
- Aucune couleur littérale hors `tokens.json`.
