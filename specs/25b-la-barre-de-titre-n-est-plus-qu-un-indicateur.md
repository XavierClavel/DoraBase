# 25b — La barre de titre n'est plus qu'un indicateur

## Goal

La barre de titre perd ses deux contrôles — le sélecteur d'environnement et le menu de la pastille
projet. Il ne reste au centre qu'un **indicateur passif** de ce qui est sélectionné. Rien de
sélectionné : rien du tout.

## Scope

**Le centre, dans cet ordre :** le point d'état de connexion (6 px), l'icône `bag`, le nom du projet,
la pastille de couleur de l'environnement (7 px), son libellé, le badge `PROD` si le drapeau est levé,
le fil d'Ariane en mono, puis `ÉDITION` **ou** `LECTURE SEULE` — jamais les deux, comme aujourd'hui.

**L'environnement se lit sans capitales.** Depuis `23a` son libellé est renommable : c'est une chaîne
de l'utilisateur, et « Pré-production » ne doit pas devenir « PRÉ-PRODUCTION ». Le seul mot en
capitales reste `PROD`, parce que c'est une catégorie et non un nom. L'étiquette « ENV » du sélecteur
disparaît avec lui : sans commutateur, il n'y a plus rien à étiqueter.

**La boîte blanche disparaît.** La pastille vivait dans un encadré de 24 px, bordé, sur fond de champ.
Un encadré sur fond de barre est une affordance, et ce dépôt a déjà tranché ce point exact en refusant
un `Chip` inerte pour la cellule « Projet » de `24` — un contrôle inerte se lit comme un contrôle en
panne. D'autant que cette boîte **a été** un bouton pendant tout le développement. Reste un simple
alignement horizontal, qui garde `min-width: 0` et l'élision sur le nom et sur le fil d'Ariane :
c'est ce qui empêche un nom long de pousser les icônes d'action hors de la barre.

**Rien de sélectionné : aucune empreinte réservée.** `.center` vide a une hauteur de zéro sans rien
déplacer — la barre garde ses 40 px, le wordmark et les actions ne bougent pas. Ce n'est pas un état
à inventer : c'est celui que `A1` montre déjà dans le handoff, et que `TitleBar` rend déjà. Une boîte
fantôme n'achèterait aucune stabilité, et une boîte vide bordée au centre d'une barre se lirait comme
un champ à remplir.

**Le badge `PROD` est un ajout**, assumé. Ni la pastille ni le sélecteur ne l'avaient. Mais le
sélecteur partant, plus rien dans la barre ne dit « vous écrivez en production » au moment où `11d`
applique ses garde-fous — et `23g` accroche ces garde-fous à ce drapeau précis.

**Ce qui disparaît :** `EnvironmentPicker` (composant, CSS, test), `ProjectMenu`, la prop `right` de
`TitleBar` — dont le sélecteur était l'unique appelant — et la prop `onEnvironmentChange` avec toute
sa chaîne jusqu'à `App.tsx`.

**Les deux points d'entrée de `23e` deviennent un.** La pastille en portait un ; le « … » de la ligne
projet dans l'arbre porte l'autre, et il reste. Rien à reloger, mais rien à casser non plus : c'est
désormais le seul chemin vers l'édition d'un projet.

## Not in this scope

- **L'arbre et son palier d'environnement** : `25a`, qui fournit la sélection que cet indicateur lit.
- **Le retrait de `activeEnvironment` du modèle** : `25c`.
- **Les feux tricolores ternis** sous modale : toujours hors de portée du CSS (`09c`), inchangé.
- **Un état « rien d'ouvert » propre aux écrans de travail** : c'est le même vide que `A1`.

## Approach

**L'environnement vient de la sélection, jamais du projet.** Aujourd'hui l'écran de travail lit
`projetActif?.activeEnvironment ?? 'dev'` et le distribue à huit endroits, dont la clé de connexion
des onglets. Il vient désormais du nœud sélectionné ou de l'onglet actif, qui le portent tous les
deux déjà. Les replis `noeud.environment ?? environnement` partent avec : un repli silencieux sur un
environnement arbitraire, c'est ouvrir la mauvaise connexion sans le dire.

**Aucun rôle, et surtout pas `role="status"`.** `status` est une région live implicite : la sélection
changeant à **chaque flèche** dans l'arbre, un lecteur d'écran énoncerait « Atelier Nord, prod,
analytics public orders » par-dessus l'annonce de la ligne en cours de parcours. C'est le pire endroit
du produit pour une région live. `role="group"` a été essayé et écarté : ARIA le destine à un ensemble
de **contrôles**, et Biome le signale en proposant `<fieldset>` — ce qui serait faux pour une zone en
lecture seule. La zone n'est que du texte, lu dans l'ordre du document, et c'est ce qu'un indicateur
doit être.

**Le texte masqué visuellement reste, et s'étend.** Le point d'état est `aria-hidden` et `09d`
interdit que la couleur porte seule : l'état de connexion et le compte de modifications continuent
d'arriver en `.srOnly`, et le fait `production` s'y ajoute en clair — `PROD` seul est un sigle. Les
espaces restent explicites (le piège de `08a`, `09a` et `09c`).

**La barre gagne en préhension, sans qu'on l'ait demandé.** `data-tauri-drag-region="deep"` glisse
partout sauf sur les éléments focalisables ; il n'y en a plus au centre. Le parcours clavier passe de
quatre arrêts à **deux** — console, préférences — ce qui invalide un critère de `09c`.

**`ProjectPill` est renommée `SelectionIndicator`.** Ce n'est plus une pastille et elle ne désigne
plus seulement un projet ; garder le nom laisserait le prochain lecteur chercher une boîte. Son
`libelleDeConnexion` part avec elle : sa docstring la disait partagée avec l'arbre, mais l'arbre a son
propre `resumeEtat` — la mention était périmée.

## Done when

- [ ] Le centre montre projet, environnement et fil d'Ariane, et **aucun** élément focalisable
- [ ] Rien de sélectionné : le centre est vide, et la barre ne bouge pas d'un pixel
- [ ] Un environnement marqué production porte `PROD`, quel que soit son libellé
- [ ] Le libellé d'environnement s'affiche tel qu'il est déclaré, sans capitalisation
- [ ] `EnvironmentPicker`, `ProjectMenu`, la prop `right` et `onEnvironmentChange` n'existent plus
- [ ] Le parcours clavier de la barre compte deux arrêts : console, préférences
- [ ] L'état de connexion, le compte de modifications et le fait `production` restent annoncés
- [ ] L'édition d'un projet (`23e`) reste atteignable depuis le « … » de l'arbre
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint` passent
