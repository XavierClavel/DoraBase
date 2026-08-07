# 09f — A4 : le panneau de détail

## Objectif

Le panneau droit 300 px de `A4` : en-tête épinglable, deux tuiles de statistiques, liste
des colonnes, grille d'actions, bloc Relations. C'est le dernier bloc de `A4`.

## Dépend de

`09a` (`StatTile`), `09b` (`table_detail`), `09e` (la ligne sélectionnée), `04`
(`ColumnRow`).

## Périmètre

- L'en-tête 34 px : `public.orders` et l'épingle.
- Deux tuiles : Lignes, Taille.
- La liste des colonnes : cinq, puis « + 13 autres… ».
- La grille 2×2 d'actions, dont « Ouvrir les données » en accent.
- Le bloc Relations.

## Hors périmètre

- **Ce que font les quatre actions.** « Ouvrir les données » → `10`, « Structure » → `14`,
  « SELECT dans console » → `12`, « Exporter CSV » → un scope à part (et la CSP bloque
  `blob:`, acquis consigné dans `specs/README.md`). Les quatre boutons sont présents et
  **désactivés avec une infobulle qui dit pourquoi** — voir § Approche.
- **Le déroulement des « 13 autres ».** Le mockup montre le repli, pas le déplié. La liste
  complète appartient à `A9` (`14`), qui est faite pour ça.
- **L'épinglage persistant.** L'épingle est rendue ; ce qu'elle épingle entre sessions
  n'est maquetté nulle part.

## Approche

### Un bouton inerte, ou un bouton désactivé ?

`A1` a livré des boutons **inertes mais actifs**, et `08b` a répété le choix : un bouton
désactivé sans explication fait croire à un bug. Ici, quatre boutons mèneraient à des
écrans qui n'existent pas — cliquer ne pourrait rien faire du tout, pas même échouer.

Décision **inverse de `A1`**, et pour une raison : à `A1` un seul bouton était inerte et
son écran suivant venait dans la spec d'après. Ici quatre boutons sur quatre le sont, et
leurs écrans sont à trois specs de distance. Un panneau dont tout est cliquable et rien ne
répond est pire qu'un panneau qui dit ce qui n'est pas encore là.

Ils sont donc **désactivés, avec une infobulle** nommant l'écran attendu. Cela demande une
primitive `Tooltip` — que `08a` avait laissée de côté faute d'écran la réclamant. Elle
entre ici, avec son entrée de galerie.

### « 1.9 M » et « 2.1 GB » ne viennent pas du même calcul

Le compte de lignes est une **estimation** — `reltuples`, que `06c` traduit déjà, et dont
`-1` signifie « jamais analysée » et non « moins une ligne ». La taille, elle, est exacte :
`pg_total_relation_size`.

Une estimation affichée comme un fait exact est un mensonge de précision. La tuile doit
donc distinguer les deux — le handoff ne le fait pas, et la question part au § « À
trancher ». Le minimum défendable : un `title` sur la tuile de lignes disant « estimation
du catalogue ».

### Cinq colonnes, et lesquelles ?

Le mockup en montre cinq puis « + 13 autres… ». Il ne dit pas **lesquelles** cinq. Deux
lectures : les cinq premières dans l'ordre du catalogue, ou les cinq les plus
significatives (clés d'abord).

Décision : **les cinq premières dans l'ordre du catalogue**, parce que c'est l'ordre que
l'utilisateur connaît de sa table, et que « significatif » demanderait une règle que
personne n'a écrite. Le mockup est cohérent avec cette lecture — sa première colonne est
`id`, la clé primaire, qui est aussi la première du catalogue.

### Sans sélection, le panneau n'est pas vide par accident

`A4` montre le panneau toujours rempli, parce qu'une ligne y est toujours sélectionnée. Au
premier affichage d'un schéma, rien ne l'est. L'état sans sélection doit donc exister et le
dire, plutôt que de laisser un panneau de 300 px blanc — ou de sélectionner d'office la
première ligne, ce qui déclencherait une requête `table_detail` que l'utilisateur n'a pas
demandée.

## Terminé quand

- Comparaison visuelle du panneau contre `A4`, sans écart.
- 300 px mesurés, et les deux tuiles côte à côte sans débordement.
- Les colonnes affichées sont les cinq premières du catalogue, et le compte restant est
  juste — vérifié contre `introspection.orders`, qui a neuf colonnes.
- Les quatre actions sont désactivées, et chacune dit dans son infobulle **quel** écran
  l'apportera.
- La tuile de lignes signale que le compte est une estimation.
- Sans sélection, le panneau le dit, et **aucune** commande `table_detail` n'a été
  appelée — vérifié par compteur.
- Une table jamais analysée affiche « — » et non « 0 », le cas `reltuples = -1` de `06c`.
- `Tooltip` a son entrée de galerie, s'ouvre au survol **et** au focus clavier, et se
  ferme par `esc`.
- Aucune couleur littérale hors `tokens.json`.
