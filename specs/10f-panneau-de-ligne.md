# 10f — `A5` : le panneau droit, détail d'une ligne

## Objectif

Le panneau de 296 px : la ligne sélectionnée en clé-valeur, ses onglets Champs / JSON /
Liens, l'aperçu de la ligne liée, et « Copier la ligne en INSERT ».

## Dépend de

`06c` (`Relation`, `ColumnInfo`), `10c` (la sélection dans la grille), `10d` (`Filter`, pour
l'aperçu de ligne liée).

## Périmètre

- L'en-tête 34 px : `Ligne 3 · id 184217`, et les flèches précédent / suivant.
- Les trois onglets : Champs (clé-valeur), JSON (la ligne entière), Liens (les relations).
- Les icônes de clé primaire et de clé étrangère en fin de ligne.
- Le rendu coloré d'une valeur JSON.
- Le bloc « Ligne liée », sous la règle de liste blanche du handoff.
- « Copier la ligne en INSERT ».

## Hors périmètre

- **Suivre une clé étrangère** — ouvrir la table cible filtrée sur la valeur. Le mockup
  n'offre pas ce geste ; l'onglet Liens s'y prêtera, et ce sera une décision produit.
- **L'édition d'un champ** → `11` (`A6`).
- **L'aperçu formaté « 280,00 € »** du mockup. Voir § Approche.

## Approche

### La règle « ligne liée » est écrite dans le handoff, et elle est stricte

Le `README.md` du handoff la donne mot pour mot : n'afficher l'aperçu de la ligne cible que
si celle-ci porte au moins un champ lisible par un humain, d'après une liste blanche
insensible à la casse — `email`, `name`, `label`, `title`, `first_name`/`firstName`,
`last_name`/`lastName`, `username`, `slug`, `code`, `reference`. Sinon, **ne rien afficher** :
pas de dump d'identifiants techniques. Et mentionner en légende les champs détectés, ce que le
mockup fait (« — email, name détectés »).

C'est la seule règle métier explicite du handoff, et elle est là pour une raison : un aperçu
automatique qui déverse le contenu d'une ligne référencée transforme un clic distrait en fuite
de données. Elle est donc implémentée telle quelle, testée aux deux bords — une table cible
avec `email` montre l'aperçu, une table cible avec seulement `id` et `tenant_id` ne montre
rien — et sa liste vit à **un seul endroit**.

L'aperçu demande une lecture supplémentaire : une `RowQuery` sur la table cible, filtrée sur
la clé, `LIMIT` au plus petit palier. Pas de commande nouvelle — c'est `read_rows` de `10c`,
et la contrainte IPC tient sans effort.

### « 280,00 € » suppose un lien entre deux colonnes que rien ne déclare

Le mockup affiche `28000` puis, en gris, `280,00 €`. Pour produire cela il faut savoir que
`total_cents` est en centimes, et que la devise se lit dans la colonne `currency` de la même
ligne. Aucune des deux informations n'est dans le catalogue : la première est une convention
de nommage, la seconde une relation entre colonnes que rien ne formalise.

Le déduire du suffixe `_cents` marcherait sur cette table et échouerait ailleurs, en silence
et en affichant un montant faux — le pire mode de défaillance pour un client de bases. Le
bloc n'est donc pas rendu, et la question part au § « À trancher » : elle appelle des
annotations de colonne, donc des préférences (`A10`), donc une autre spec.

### L'INSERT copié doit être exécutable, ou ne pas être copié

« Copier la ligne en INSERT » produit du SQL que quelqu'un collera dans une console. Deux
exigences en découlent : les identifiants sont cités selon le moteur, et les valeurs sont
littéralisées correctement — apostrophes doublées, `NULL` sans guillemets, JSON en littéral
de chaîne, binaire en `\x…`.

Le composer côté front demanderait au JavaScript de connaître les règles de citation de sept
moteurs, ce que le projet a déjà refusé deux fois — pour la clé de base (`09b`) et pour la
référence de secret (`08e`). C'est donc **une commande Rust**, où vit déjà la connaissance du
moteur, et elle est testable sans écran : le SQL produit est réinjecté dans la base de test et
doit s'exécuter.

Le presse-papiers, lui, reste côté front — c'est une API de la webview.

### Les trois onglets ne sont pas trois vues du même contenu

Champs rend les colonnes de la table, dans l'ordre du catalogue. JSON rend la ligne entière en
objet, ce qui sert à la recopier. Liens rend les `Relation` de la table — sortantes et
entrantes, les deux sens que `06c` fournit déjà — et c'est le seul des trois qui ne dépend pas
de la ligne sélectionnée. Le mockup ne le montre pas ouvert ; il liste donc les relations sans
en inventer la présentation, en réemployant le bloc « Relations » de `09f`.

### Le panneau droit de l'écran est **un**, et son contenu suit l'écran

Constaté en implémentant : le mockup de `A5` montre un panneau de 296 px qui longe **tout** le
corps, et une barre d'état qui court sous les trois colonnes. Rendre le panneau de ligne
*dans* le centre l'enfermait sous la toolbar, et empilait deux panneaux droits — celui de
détail de `A4` et celui de ligne — là où le mockup n'en montre qu'un.

L'écran de travail (`10b`) porte donc un seul panneau droit, dont le contenu suit le contexte :
le détail de l'objet sans onglet ouvert, la ligne sélectionnée avec. Et la barre d'état monte au
niveau de l'écran.

Corollaire, trouvé à la mesure : le `SplitPane` de `03` ne dimensionnait que son panneau de
**gauche**. Sur l'écran de travail, c'était donc le centre qui recevait 296 px et la grille
tombait à **zéro pixel de large** — depuis `10b`, sans qu'aucun test le voie : chacun mesurait
la colonne qui l'intéressait. `SplitPane` reçoit une option `sized`, et un test verrouille le
partage des trois colonnes.

### Précédent / suivant se déplacent dans la fenêtre, pas dans la table

Les flèches de l'en-tête changent la ligne sélectionnée dans la fenêtre reçue. Aller au-delà
demanderait de charger la fenêtre suivante, or `10c` a fixé `offset` à 0 et s'y tient. Aux
extrémités, les flèches se désactivent — plutôt que de boucler, ce qui ferait croire à un
parcours infini sur une fenêtre de 500 lignes.

### Un défaut de `06d` que ce travail a révélé

Le test d'`INSERT` a échoué sur `null value in column "created_at" violates not-null`. Cause :
la lecture de lignes repliait sur du texte tout type non lu nativement — horodatage, JSON, UUID,
énumération — mais le `select` ne transtypait pas, donc `try_get::<String>` échouait et la valeur
devenait `Null`. **`A5` aurait affiché `NULL` dans chaque colonne de date de chaque table.**

Les tests de `06d` ne l'avaient pas vu : leurs tables de mesure ne portent que des entiers et du
texte, les deux catégories qui se lisent nativement. Et la table `orders` du décor avait ses
colonnes exotiques nulles partout — un défaut de lecture y était indiscernable d'une colonne
vide. Le décor de test reçoit donc une ligne dont **aucune** colonne exotique n'est nulle.

## Terminé quand

- Comparaison visuelle du panneau contre `A5` : en-tête, onglets, largeur des étiquettes
  (96 px), bloc JSON, bloc de ligne liée, bouton pleine largeur.
- Une table cible sans champ de la liste blanche n'affiche **aucun** aperçu, et le test le
  vérifie explicitement — pas seulement le cas qui affiche.
- La légende nomme les champs réellement détectés.
- L'INSERT produit **s'exécute** contre la base de test — dans une transaction annulée —
  apostrophes, `NULL` et clé primaire comprises.
- Sélectionner une ligne dans la grille met le panneau à jour, y compris son en-tête.
- Précédent / suivant se désactivent aux bords de la fenêtre.
- Une ligne sans clé primaire affiche un en-tête qui ne prétend pas en avoir une.
- Aucune couleur littérale hors `tokens.json`.
