# 27 — Le menu d'une ligne : clic droit, et fermeture quand on s'en va

## Objectif

Rendre le menu d'actions d'une ligne d'arbre atteignable au **clic droit**, et le faire se **fermer**
quand le pointeur s'en éloigne. Les trois défauts corrigés ici viennent du premier usage de `26`, et
aucun ne concerne le renommage : ils portent sur le menu de toutes les lignes.

## Dépend de

`08h` (le « … » et sa gouttière), `10a` (`Popover`), `10f` (`MenuContextuel`), `26` (l'usage qui a
signalé les trois).

## Périmètre

- Le **clic droit** sur une ligne d'arbre, qui ouvre les mêmes actions au pointeur.
- La **fermeture** du menu quand le pointeur quitte l'ensemble déclencheur + panneau.
- L'**arrondi du survol** du « … », que le CSS demandait sans l'obtenir.

## Hors périmètre

- **Le clic droit ailleurs que dans l'arbre.** La grille de `A5` a déjà le sien (`10f`), les autres
  surfaces n'ont pas d'actions à offrir. `useClicDroitDesactive` continue de désactiver le menu du
  système partout où rien n'est proposé.
- **Un menu contextuel sur les lignes de schéma et de table.** Elles n'ont pas de configuration —
  l'arbitrage de `08h`, inchangé. Le clic droit y laisse donc le menu du système.
- **Un garde-fou sur les noms de tokens.** Le défaut n° 121 en réclame un ; c'est un outil de build,
  et il a sa propre place. Consigné, pas fait ici.

## Approche

### Le clic droit s'ajoute au « … », il ne le remplace pas

`08h` écartait le menu contextuel : « le handoff ne le maquette pas, et un “…” visible enseigne son
existence là où un clic droit se devine ». L'argument reste vrai — c'est pourquoi le « … » **reste**.
Mais il ne dit rien *contre* le clic droit : celui-ci est le geste qu'on a dans les doigts, et se
priver de la seconde voie pour préserver la pédagogie de la première est un mauvais échange.

**Une seule construction d'entrées alimente les deux ouvertures.** Deux listes auraient divergé d'une
action au premier ajout, et c'est l'écart qu'on ne remarque qu'en montrant le produit. `entreesDe`
rend donc des données, et l'écran choisit ce qui les affiche.

Le rendu au pointeur réutilise `MenuContextuel` (`10f`), déjà écrit pour la valeur d'une cellule : il
gagne les icônes et les entrées désactivées de `RowMenu`, faute de quoi deux menus du même produit se
seraient contredits. **Une ligne sans actions garde le menu du système** — un `preventDefault` sur un
clic droit qui n'a rien à offrir retirerait le geste natif pour rien.

### Le menu ne se fermait pas : il disparaissait

Le panneau du `Popover` est un descendant de la gouttière `.actions`, que `TreeRow` repasse en
`visibility: hidden` hors survol — la réservation d'espace de `08h`, pour que le méta d'une ligne ne
bouge pas d'un pixel. Conséquence que ni l'une ni l'autre des deux règles ne pouvait prévoir seule :
le menu restait **ouvert dans l'état** tout en étant invisible, et le survol suivant le repeignait
sans qu'on ait cliqué. Un menu qui réapparaît tout seul ne s'explique pas (`DEFAUTS.md` n° 122).

D'où une **quatrième fermeture** : le pointeur quitte l'ensemble, le menu se ferme pour de bon, et il
faut recliquer. Elle est **opt-in** sur `Popover` — un menu d'actions se referme volontiers quand on
s'en éloigne, un panneau où l'on *travaille* (le sélecteur de colonnes de `10e`, le popover
d'opérateur de `A5`) doit au contraire survivre à un pointeur parti chercher autre chose. Les deux
besoins sont opposés, l'appelant tranche.

**Le clavier n'est pas concerné** : sans pointeur, pas de départ de pointeur, et les trois fermetures
existantes restent seules aux commandes.

### Le délai de grâce n'est pas un confort

`Popover` ouvre son panneau à `top: calc(100% + var(--space-1))` : **2 px** séparent le déclencheur de
son menu, et ces 2 px n'appartiennent à aucun des deux. Une fermeture au premier `pointerleave`
refermait donc le menu pendant qu'on descendait vers une entrée — inatteignable à la souris une fois
sur deux (n° 123). 150 ms suffisent à traverser l'interstice ou couper un angle, et restent trop
courts pour qu'un menu abandonné traîne à l'écran.

Le test qui garde cette propriété **déplace le pointeur pas à pas**. `hover()` téléporte d'un élément
à l'autre : il ne traverse jamais l'interstice, et le premier test passait avec le délai comme sans.

### Un token qui n'existe pas ne fait rien, et c'est ce qui le rend durable

`--radius-chip` n'était déclaré nulle part : les sept `border-radius` qui l'employaient étaient
invalides, et sept contrôles dessinaient des coins carrés là où le CSS disait « arrondi » — dont le
fond de survol du « … ». Pas d'avertissement de build, pas de lint, pas de test rouge : une faute de
frappe dans un nom de token est silencieuse par construction (n° 121).

Corrigé vers des tokens **réels** : `--radius-control` (6 px) pour les petits boutons carrés,
`--radius-badge` (4 px) pour les étiquettes textuelles. Aucune valeur inventée — c'est en inventant un
nom plutôt qu'en choisissant un nom existant que le défaut est né.

## Terminé quand

- [x] Le clic droit sur une ligne à actions ouvre les **mêmes** entrées que son « … », dans le même
      ordre, et mène à l'action jusqu'au bout.
- [x] Une ligne sans actions — schéma, table — n'ouvre rien et **garde le menu du système**.
- [x] Une entrée indisponible est offerte et désactivée dans les deux menus, avec sa raison.
- [x] Quitter la ligne **ferme** le menu ; y revenir ne le rouvre pas, il faut recliquer.
- [x] Descendre du « … » vers une entrée, **pointeur déplacé pas à pas**, ne ferme pas le menu — et
      un sabotage ramenant le délai de grâce à 0 fait échouer ce test.
- [x] Plus aucun `var(--radius-chip)` dans le dépôt.
