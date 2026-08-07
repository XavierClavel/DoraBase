# 09c — A4 : la barre de titre

## Objectif

La barre de titre des écrans de travail : pastille projet, fil d'Ariane, badge
« LECTURE SEULE », et le sélecteur d'environnement dans sa boîte séparée.

## Dépend de

`09a` (rien directement), `09b` (le projet actif et son environnement), `01`
(`titleBarStyle: Overlay`, dont le `padding-left: 78px` existe déjà).

## Périmètre

- La pastille projet : point d'état, sac à dos, nom, chevron.
- Le fil d'Ariane `analytics · public`, en mono.
- Le badge « LECTURE SEULE », quand l'état effectif l'est.
- Le sélecteur d'environnement, **dans une seconde boîte blanche**.
- Les deux icônes de droite, console comprise (`showConsole` existe déjà, `04`).

## Hors périmètre

- **Le menu du chevron de la pastille** — changer de projet. Le mockup montre le chevron,
  pas ce qu'il ouvre. Un popover viendra avec l'écran qui le maquette.
- **Le basculement d'environnement effectif** : le sélecteur affiche et change
  l'environnement actif du projet (`05a` le persiste), mais **ce que devient une base
  absente de l'environnement cible** relève de `09d`, qui dessine l'arbre.
- **La règle de lecture seule.** Trois réglages la composent — la variante (`05a`), la
  préférence globale de `A10`, l'environnement courant. `05a` a explicitement laissé cette
  composition à `11`. Ce scope **affiche** le badge à partir du seul réglage disponible, et
  le dit dans le code.

## Approche

### Deux boîtes, pas une

Le handoff insiste : la pastille projet est une boîte blanche, puis « **dans une seconde
boîte blanche séparée** (margin-left 8 px) » vient le sélecteur d'environnement. Les fondre
donnerait un bandeau unique, et l'environnement se lirait comme une propriété du fil
d'Ariane plutôt que comme un commutateur.

C'est aussi ce qui rend le commutateur atteignable au clavier sans traverser le fil
d'Ariane.

### Le point d'état est celui de la base ouverte, pas du projet

Le mockup montre un point vert 6 px dans la pastille projet. Un projet n'a pas d'état de
connexion — ses bases en ont. Le point reflète donc **la base ouverte** (celle du fil
d'Ariane), et un projet sans base ouverte n'a pas de point plutôt qu'un point gris
inventé.

Lecture assumée, notée au § « À trancher » : le handoff ne dit pas ce que le point
signifie, et le mettre sur le projet supposerait d'agréger des états hétérogènes.

### Le fil d'Ariane est en mono, et c'est une règle du produit

`analytics · public` en JetBrains Mono 11 px `rgba(35,32,28,.45)`. Même règle qu'en `08b` :
ce que l'utilisateur transcrit littéralement est en mono, ce qu'il lit est en Nunito. Un
nom de schéma est une valeur technique.

### La barre reste déplaçable

`data-tauri-drag-region` est déjà posé (`04`), et les enfants cliquables restent
cliquables sans traitement. Mais **la pastille et le sélecteur sont interactifs** : sans
vérification, un clic dessus pourrait déplacer la fenêtre au lieu de les activer. À
vérifier dans l'app réelle — ce n'est pas testable autrement.

## Terminé quand

- Comparaison visuelle contre la barre de `A4`, sans écart.
- Les deux boîtes sont distinctes, avec leurs 8 px de séparation, mesurés.
- Le sélecteur d'environnement change l'environnement actif, et la valeur persiste
  (`05a`, `05b`).
- Le badge « LECTURE SEULE » suit le réglage de la variante, et le code dit pourquoi la
  règle complète attend `11`.
- Sans base ouverte, aucun point d'état — pas un point gris.
- Parcours clavier : pastille, sélecteur, console, préférences. Quatre arrêts, dans cet
  ordre.
- Un clic sur la pastille l'active et **ne déplace pas la fenêtre**, vérifié dans l'app
  réelle et rapporté comme observé.
- Aucune couleur littérale hors `tokens.json`.
