# 11a — `A6` : la cellule éditable et les modifications en attente

## Objectif

Modifier une valeur dans la grille, et retenir ce changement **sans l'envoyer**. C'est le modèle
qui porte tout `A6`, et le geste qui l'alimente.

## Dépend de

`06a` (`Value`), `10a` (`VirtualGrid`), `10c` (la grille et le rendu des valeurs), `10f` (la
sélection de ligne).

## Périmètre

- Le modèle d'une **modification en attente** : ligne, colonne, ancienne valeur, nouvelle.
- La cellule en saisie : boîte flottante, caret, `↩` valide, `esc` annule.
- L'infobulle de raccourcis flottant sous la cellule éditée.
- `⌘Z` annule la dernière modification retenue.
- Entrer en édition : `↩` ou double-clic sur une cellule.

## Hors périmètre

- **Les marques visuelles** — bandeau, teintes de ligne et de cellule, annotations de la sidebar,
  badge « ÉDITION » → `11b`.
- **Le panneau droit** et son diff → `11c`.
- **Toute écriture en base** → `11d`. Ici rien ne part : c'est le sens même de « en attente ».
- **Éditer une clé primaire.** Elle identifie la ligne, et la changer déplacerait la cible du
  `WHERE`. Refusé, et dit.
- **Insérer ou supprimer une ligne.** Le mockup ne montre que la modification de cellules.

## Approche

### Le modèle est indexé par (ligne, colonne), et garde l'ancienne valeur

Une modification porte l'identité de sa ligne — la valeur de sa clé primaire, pas son rang :
le rang change au moindre tri, et une modification qui suivrait le rang s'appliquerait à une autre
ligne. La clé primaire est aussi ce que `11d` mettra dans son `WHERE`.

Elle garde **l'ancienne valeur** parce que trois choses en dépendent : le diff de `11c`, l'annulation
d'une seule modification, et la détection d'un retour à la valeur d'origine — retaper la valeur
initiale doit **retirer** la modification, pas en créer une qui ne change rien.

Deux modifications de la même cellule n'en font qu'une : la dernière valeur gagne, l'ancienne reste
celle d'origine.

### La saisie est une boîte flottante, et c'est structurel

Le mockup la fait déborder de 3 px en haut et en bas de sa ligne, avec une bordure de 2 px et une
ombre portée. Une cellule éditée *dans* la trame aurait à choisir entre rogner son texte et pousser
ses voisines ; la boîte flottante ne fait ni l'un ni l'autre.

Conséquence : elle est en `position: absolute` par-dessus la grille, avec un `z-index` supérieur aux
lignes. La grille étant virtualisée, la cellule éditée doit rester montée même si le défilement
l'emmène hors fenêtre — ou l'édition s'annule. **Décision : elle s'annule**, et la ligne éditée est
ramenée dans la vue quand on entre en édition. Perdre une saisie parce qu'on a défilé serait pire
que la voir se fermer devant soi.

### Trois touches, trois portées distinctes

| Touche | Effet |
| --- | --- |
| `↩` | valide la cellule — la modification est **retenue**, rien n'est envoyé |
| `esc` | abandonne la saisie en cours, la valeur d'origine reste |
| `⌘Z` | annule la **dernière modification retenue**, pas la saisie |

`esc` et `⌘Z` ne font pas la même chose, et le mockup l'écrit dans sa barre du centre : « esc annule
la cellule · ⌘Z annule la modif ». Les confondre ferait perdre une modification validée en voulant
sortir d'un champ — le défaut que `esc` dans une modale a déjà produit une fois.

### L'infobulle des raccourcis est ancrée à la cellule, pas à l'écran

Le mockup la place sous la cellule éditée. Elle n'apparaît **que** pendant la saisie : affichée en
permanence, elle occuperait la place d'une ligne pour rappeler trois touches.

### Une valeur saisie reste du texte jusqu'à `11d`

L'utilisateur tape des caractères ; la colonne a un type. Convertir ici demanderait de connaître les
types de sept moteurs — le couplage que `06a` a refusé en rendant `Filter.value` textuel. La
nouvelle valeur est donc une **chaîne**, et c'est l'adaptateur qui la liera en paramètre.

Conséquence assumée : une saisie invalide n'est refusée qu'à l'application (`11d`), avec le message
du moteur. Un contrôle de type côté écran serait plus confortable et mentirait sur sept moteurs.

### `NULL` se saisit, et ne se devine pas

Vider une cellule de texte donne la chaîne vide, pas `NULL` — la distinction est l'une des rares
qu'un client de bases ne doit pas brouiller (`10c`). Il faut donc un geste explicite pour poser
`NULL` : `⌥⌫` sur la cellule éditée. Le handoff ne le maquette pas ; la barre d'état du mode édition
l'affiche à côté des autres rappels.

## Terminé quand

- Double-cliquer ou frapper `↩` sur une cellule ouvre la boîte flottante, avec la valeur courante.
- `↩` retient la modification ; `esc` l'abandonne ; `⌘Z` retire la dernière retenue.
- Retaper la valeur d'origine **retire** la modification au lieu d'en créer une vide.
- Deux modifications de la même cellule n'en font qu'une, dont l'ancienne valeur est l'originale.
- Une modification survit à un tri et à un changement de filtre : elle suit la **clé**, pas le rang.
- Éditer une clé primaire est refusé, avec un message qui le dit.
- `⌥⌫` pose `NULL`, distinct d'une cellule vidée.
- **Aucune requête d'écriture n'est émise** — vérifié sur la commande, pas sur l'écran.
- Comparaison visuelle de la cellule en saisie contre `A6` : débordement, bordure, caret, ombre.
- Aucune couleur littérale hors `tokens.json`.
