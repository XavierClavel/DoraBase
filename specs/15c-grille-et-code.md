# 15c — `A10` : la grille et le code

## Goal

La densité des lignes et la police du code, réglables et appliquées partout.

## Dépend de

`15a`, `10a` (`VirtualGrid`, dont `rowHeight` est déjà une prop).

## Scope

- La densité : de « compact » à « aéré », 20 à 36 px — la plage que `10a` annonçait.
- La police du code : famille et corps.
- L'application à la grille, à l'éditeur de `12b` et aux blocs SQL de `11c`.

## Not in this scope

- **La largeur des colonnes.** Elle se règle à la souris dans la grille, et la mémoriser est un autre
  sujet.
- **Une police d'interface réglable.** Le handoff n'en parle pas, et Nunito porte l'identité du
  produit.

## Approche

### `10a` avait prévu ce réglage, il suffit de le brancher

`VirtualGrid` prend `rowHeight` en prop depuis `10a`, avec un commentaire qui annonce « `15` la fera
varier de 20 à 36 ». Cette spec est l'échéance de cette promesse.

**La densité change le pas de virtualisation**, donc le nombre de lignes montées : c'est le genre de
réglage qui casse une virtualisation écrite en supposant une hauteur fixe. `10a` ne la suppose pas —
mais le vérifier fait partie du travail, sur les trois valeurs extrêmes.

### La police du code passe par un jeton, pas par un style en ligne

`--font-mono` existe. La préférence le redéfinit sur la racine, ce qui atteint d'un coup la grille,
l'éditeur, les blocs SQL et le JSON. L'appliquer composant par composant en oublierait un — et c'est
le genre d'oubli qui ne se voit que sur l'écran qu'on n'a pas regardé.

### Un corps de police change la hauteur de ligne utile

Passer le code à 14 pt dans une grille à 20 px rognerait le texte. La densité minimale suit donc le
corps choisi : le réglage de l'un contraint la plage de l'autre, ce qui est dit à l'écran plutôt que
laissé produire un affichage tronqué.

## Done when

- [ ] La densité se règle, et la grille change de pas — vérifié aux deux extrêmes.
- [ ] La police du code s'applique à la grille, à l'éditeur et aux blocs SQL.
- [ ] Un corps élevé empêche la densité la plus compacte, et l'écran dit pourquoi.
- [ ] Les réglages survivent à un redémarrage.
