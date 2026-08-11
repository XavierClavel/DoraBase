# 11c — `A6` : le panneau des modifications en attente

## Objectif

Le panneau droit de 330 px : une carte par modification, son diff, le SQL qui sera exécuté, et
l'avertissement de production.

## Dépend de

`11a` (le modèle), `11b` (les marques et le bandeau qui mène ici), `10f` (le panneau droit qu'il
remplace en mode édition).

## Périmètre

- L'en-tête 34 px : icône, titre, pastille de compte.
- Une carte par modification : en-tête `ligne 3 · id 184217`, croix de retrait, diff.
- Le bloc sombre « SQL qui sera exécuté », coloré, avec sa copie.
- L'encart rouge d'avertissement pour une base `prod`.
- Les deux boutons du pied : « Tout annuler », « Appliquer ⌘↩ ».

## Hors périmètre

- **L'exécution** → `11d`. Le SQL est **montré**, pas envoyé.
- **La confirmation supplémentaire en production** et **le patch inverse 24 h** → `11d`, qui écrit.
  L'encart les **annonce** ici ; les livrer serait livrer l'écriture.
- **Modifier une valeur depuis le panneau.** Le mockup n'y met aucun champ : le diff se lit, il ne
  s'édite pas. La correction se fait dans la grille.

## Approche

### Le panneau de `10f` cède la place, il ne se superpose pas

`10f` a posé qu'il y a **un** panneau droit dont le contenu suit l'écran — détail de l'objet en `A4`,
ligne sélectionnée en `A5`. En `A6`, c'est celui-ci. La règle tient.

**La largeur, elle, ne change pas : elle reste celle que l'utilisateur a réglée.** Le mockup donne
330 px contre 296 pour `A5`, mais le panneau droit est un `SplitPane` à largeur mémorisée : la faire
sauter de 34 px à l'apparition des modifications reprendrait le défaut écarté pour la sidebar en
`10b`, où le handoff donne 252 px à `A4` et 212 aux écrans de travail. Un mockup figé ne peut pas
exprimer une colonne que l'utilisateur déplace. Écart assumé, comme celui de la sidebar.

Conséquence : en mode édition, on ne voit plus le détail de la ligne sélectionnée. C'est ce que le
mockup montre, et c'est défendable — en éditant, ce qu'on veut voir est ce qu'on a changé.

### Le SQL est **construit par le moteur**, pas par l'écran

Le bloc annonce « SQL qui sera exécuté ». S'il n'est pas exactement celui qui partira, il est pire
qu'absent : c'est le dernier endroit où l'on vérifie avant d'écrire en production.

Le composer côté front demanderait au JavaScript de citer les identifiants et littéraliser les
valeurs pour sept moteurs — refusé trois fois déjà (`09b`, `08e`, `10f`). Une commande Rust rend donc
le SQL **prévisualisé**, et `11d` exécutera exactement cette suite. Même arbitrage que « Voir le
SQL » de `10e`, qui montre `RowWindow.sql` plutôt qu'une reconstruction.

Corollaire : le panneau affiche ce que le cœur a rendu. Tant qu'il ne l'a pas rendu, il le dit — pas
de SQL fabriqué en attendant.

### La coloration réemploie celle de `10f`

Mots-clés `--syn-keyword`, chaînes `--syn-string`, nombres `--syn-number`, `BEGIN`/`COMMIT` en
`--syn-comment` : les quatre jetons existent depuis `02`. `JsonColore` de `10f` a déjà le motif —
découper par une expression rationnelle sur un texte que le cœur a produit, donc déjà valide.

**Un composant distinct de `JsonColore`** : les jetons d'un JSON et ceux d'un SQL n'ont rien de
commun, et un composant paramétré par une grammaire serait une abstraction pour deux usages.

### Le diff rend l'ancienne valeur avec sa forme, et `NULL` reste `NULL`

Le mockup barre `paid` dans une pastille rouge et rend `shipped` dans une verte ; barre `NULL` en
encre atténuée ; barre `''` pour une chaîne vide devenue texte. Trois formes pour trois natures, et
c'est ce qui rend le diff lisible : « `NULL` → valeur » et « `''` → valeur » sont deux changements
différents que le même rendu confondrait.

Les couleurs de pastille du mockup posent le même problème que `10c` : `paid` en rouge et `shipped`
en vert supposent qu'un état est meilleur que l'autre. Ici, le rouge et le vert ne disent pas
« mauvais » et « bon » mais **« avant » et « après »** — ce qui est une information de diff, pas de
métier. Elles sont donc reprises, et appliquées à toute valeur, pastille ou non.

### L'encart de production dit ce que `11d` fera, au futur

« DoraBase demandera une confirmation supplémentaire et gardera le patch inverse pendant 24 h. » Il
est affiché dès `11c` parce qu'il informe avant l'acte, et rédigé au futur parce que c'est vrai :
`11d` livre ces deux garde-fous. Le formuler au présent avant qu'ils existent serait une promesse
fausse.

Il n'apparaît **que** pour une base dont la variante est `prod` — l'environnement, pas une devinette
sur le nom de l'hôte.

## Terminé quand

- Comparaison visuelle contre `A6` : en-tête, cartes, diff, bloc SQL, encart rouge, deux boutons.
- Une carte par modification, dans l'ordre du modèle, et sa croix retire **celle-là**.
- Le diff distingue `NULL`, la chaîne vide et une valeur, chacun par sa forme.
- Le SQL affiché vient du cœur : le test tombe si l'écran le reconstruit.
- La coloration distingue mots-clés, chaînes, nombres et délimiteurs de transaction.
- L'encart n'apparaît que pour une variante `prod`.
- Sans modification, le panneau reprend celui de `10f` — pas de panneau vide.
- Aucune couleur littérale hors `tokens.json`.
