# 10b — La coquille d'écran de travail et sa bande d'onglets

## Objectif

Assembler l'écran de travail partagé par `A5` → `A9` — sidebar standard, centre à onglets,
panneau droit — et le **monter dans l'application**, qui n'affiche aujourd'hui que `A1` et
`A2`. Puis rendre la bande d'onglets vivante : ouvrir une table, en changer, la fermer.

## Dépend de

`03` (`SplitPane`, `TabStrip`), `04` (`Sidebar` 212 px), `09b` (registre de connexions,
introspection), `09d` (l'arbre), `09f` (le panneau de détail de `A4`).

## Périmètre

- Un composant d'écran de travail : sidebar 212 px, centre, panneau droit, deux poignées.
- **Son montage depuis `App`** : ouvrir une base mène à cet écran ; `A1` reste l'écran des
  débuts.
- La bande d'onglets 34 px câblée : ouvrir une table depuis l'arbre ou depuis « Ouvrir les
  données » de `09f`, activer, fermer, réordonner.
- Le **chargement de l'arbre** — ouvrir une base, lister ses schémas, lister les objets d'un
  schéma — que `09b` n'avait pas câblé faute d'écran, et le détail d'une table (`describe_table`,
  écrite en `06c` et jamais appelée).
- La section « Colonnes de *table* » de la sidebar : nom, glyphe de catégorie, type.
- Le couple « Données / Structure » à droite de la bande, `Données` actif.

## Hors périmètre

- **Le contenu de l'onglet** — grille, toolbar, panneau de ligne → `10c` à `10f`. Ici
  l'onglet actif rend un emplacement nommé, et le dit.
- **Les annotations « filtré » et « tri ↓ »** de la liste de colonnes → `10d`, qui crée
  l'état qu'elles reflètent.
- **`Structure`** → `14` (`A9`). Bouton présent, désactivé, avec l'infobulle qui nomme
  l'écran attendu — la règle posée par `09f`.
- **La persistance des onglets entre sessions**, écartée par `03` et par rien réclamée.
- **Les onglets de console** (`console 1` dans le mockup) → `12`.

## Approche

### `A4` n'était assemblé que dans la galerie — c'est ce que cette spec corrige

Constat du 9 août 2026, en préparant `10` : `ExplorerSidebar`, `BreadcrumbBar`, `ObjectTable`
et `DetailPanel` existent, sont testés et sont **fidèles**, mais aucun composant ne les
réunit et `App` ne les monte pas. Les tests Playwright de `A4` visent tous `/?gallery`.

Autrement dit, `A4` est vérifié pièce par pièce et n'a jamais été vu entier dans
l'application. Ce n'est pas un défaut de fidélité : c'est un trou d'assemblage, et il est
resté invisible parce que la galerie donne exactement la même image que l'écran.

Conséquence pour cette spec : l'écran de travail se construit **une fois**, `A4` le prend
comme les autres, et au moins un test Playwright part de `/` — jamais de `?gallery`. Un écran
qu'on ne peut atteindre qu'en galerie n'est pas livré.

### Un onglet est une paire (base, objet), et l'état vit au-dessus de la bande

`TabStrip` (`03`) ne connaît que des `Tab` — identifiant, icône, libellé. Ce que `A5` ouvre
est une **table dans une base**, donc l'identifiant d'un onglet est composé de la
`DatabaseKey` et du couple schéma/table. Deux bases peuvent avoir une table `public.orders` ;
un identifiant réduit au nom les confondrait, et l'utilisateur verrait le contenu de l'autre.

L'état des onglets appartient à l'écran de travail, pas au centre : le fil d'Ariane de la
barre de titre suit la base **ouverte**, celui du centre suit l'**onglet actif** — distinction
déjà posée par `09e`, et qui n'a de sens que si quelqu'un tient les deux.

### La sidebar est à 212 px, y compris quand le centre montre `A4`

Le handoff donne **deux** largeurs : 252 px à `A4`, 212 px aux écrans de travail `A5` → `A9`
(`04` a livré les deux variantes). Dans une coquille unique, ce ne peut pas être les deux :
la colonne sauterait de quarante pixels à l'ouverture d'un premier onglet.

Décision : la largeur standard, 212 px. Et surtout, la sidebar prend la largeur de son
`SplitPane` au lieu de l'imposer — sans quoi la poignée déplacerait un panneau dont le contenu
garderait sa largeur fixe. Un mockup montre des écrans figés ; il ne peut pas exprimer un
panneau que l'utilisateur déplace, et `03` a livré cette poignée avec sa persistance.

### Fermer le dernier onglet ne ferme pas l'écran

Le mockup ne montre jamais zéro onglet. Le minimum défendable : la bande reste, le centre
affiche l'état vide de `A4` (la liste des objets du schéma), et l'écran de travail ne
disparaît pas sous les pieds de l'utilisateur. Fermer le dernier onglet est un geste courant ;
en faire une sortie d'écran serait hostile.

### Réouvrir une table déjà ouverte l'active, elle ne la duplique pas

Deux onglets sur la même table donneraient deux états de filtres divergents pour une même
donnée. Aucun éditeur ne fait ça par défaut, et le mockup ne montre pas de doublon.

## Terminé quand

- Depuis `/` (pas `?gallery`), ouvrir une base mène à l'écran de travail, et la comparaison
  visuelle avec `A5` ne montre aucun écart sur la coquille — sidebar 212 px, bande 34 px,
  poignées de 5 px, panneau droit 296 px.
- Cliquer une **feuille** de l'arbre ouvre un onglet ; dans la liste du centre, où sélectionner
  remplit le panneau de détail, il faut un double-clic. Rouvrir la même table active l'existant.
- Fermer un onglet active un voisin ; fermer le dernier laisse l'écran debout.
- Deux tables de même nom dans deux bases donnent deux onglets distincts.
- La section « Colonnes de *table* » suit la table de l'onglet actif, et son titre porte son
  nom.
- `Structure` est désactivé et son infobulle nomme `A9`.
- Parcours clavier complet : arbre → onglets → centre → panneau droit.
- Aucune couleur littérale hors `tokens.json`.
