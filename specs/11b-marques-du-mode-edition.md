# 11b — `A6` : les marques du mode édition

## Objectif

Rendre visible, partout dans l'écran, qu'il y a des modifications non envoyées — et lesquelles.
Sans ces marques, `11a` retient des changements que rien ne signale.

## Dépend de

`09c` (barre de titre, `ProjectPill`), `09d` (la sidebar et sa liste de colonnes), `10a`
(`VirtualGrid` et ses teintes), `11a` (les modifications en attente).

## Périmètre

- Le bandeau 34 px sous la barre de titre : compte, rappel, « Voir le SQL », « Tout annuler »,
  « Appliquer ⌘↩ ».
- Le badge « ÉDITION » de la pastille projet, et son point d'état ambre.
- Les teintes : ligne modifiée, cellule modifiée avec son coin.
- La pastille de compte sur la table dans l'arbre.
- Les annotations « modifié » et « en saisie » dans la liste de colonnes.
- La barre d'état du mode édition.

## Hors périmètre

- **Le panneau droit** → `11c`, où « Voir le SQL » du bandeau mène.
- **L'application des modifications** → `11d`. Ici « Appliquer » est présent et actif, mais son
  effet appartient à `11d` : voir § Approche.
- **Le passage en mode édition.** Le mockup ne montre pas d'interrupteur, et la barre d'état de
  `A5` annonce `⌘E` : voir § Approche.

## Approche

### `⌘E` bascule en édition, et le rappel de `10c` est enfin honoré

`10c` a retiré « ⌘E pour éditer » de la barre d'état faute d'écran qui l'honore — un raccourci
affiché qui ne répond pas est pire qu'un raccourci absent (`09e`). Cette spec le rétablit, et le
raccourci fonctionne.

Le mode est **par onglet**, pas global : deux tables ouvertes n'ont aucune raison de basculer
ensemble, et l'état d'édition appartient à ce qu'on édite.

**Quitter le mode avec des modifications en attente ne les jette pas** : le mode se ferme, les
modifications restent et le bandeau aussi. Les perdre sur une frappe serait le même défaut qu'`esc`
fermant une modale pleine.

### Le compte est calculé, jamais tenu à part

« 3 modifications en attente », la pastille `3` de l'arbre, le `3` du panneau de `11c` et la barre
d'état disent tous la même chose. Quatre affichages, **une** source : le modèle de `11a`. Un
compteur tenu à part divergerait au premier `⌘Z`.

### Le point d'état de la pastille passe à l'ambre, et c'est le mockup qui le dit

`A5` le montre vert (base connectée), `A6` ambre — la même pastille, la même base. La couleur ne
décrit donc pas la connexion mais **l'état de l'écran** : des modifications attendent. C'est un
écart avec `09c`, qui a fait de ce point l'état de connexion faute de mieux ; ici le handoff tranche
pour ce cas précis. Consigné, parce qu'un relecteur y verra une incohérence.

Décision : le point reflète les modifications en attente **quand il y en a**, et l'état de connexion
sinon. Deux informations sur un seul pixel de couleur, ce qui n'est pas idéal — mais l'ambre est
accompagné du badge « ÉDITION », qui lève l'ambiguïté sans dépendre de la couleur.

### La cellule modifiée porte un coin, pas seulement une teinte

Le mockup ajoute un petit triangle ambre de 5 px dans l'angle. Ce n'est pas décoratif : c'est la
seule marque qui distingue une cellule modifiée d'une cellule **teintée par un filtre** (`10d`), et
les deux teintes sont proches. Une différence qui ne tient qu'à une nuance de fond serait
indistinguable pour une part des utilisateurs — la règle que `09d` a déjà appliquée à ses quatre
états de connexion.

### « Appliquer » est actif dès `11b`, et échoue proprement

Le livrer désactivé serait plus prudent et moins honnête : le bandeau annonce trois modifications et
un bouton pour les appliquer, un bouton mort ferait croire à un défaut. Il appelle donc la commande
de `11d`, absente à ce stade — l'échec s'affiche dans le bandeau, là où les messages du mode édition
vivent.

C'est l'inverse du choix de `09f` (boutons désactivés avec infobulle), et pour une raison : là, les
quatre actions menaient à des écrans lointains ; ici, la commande arrive dans la spec suivante.

### La toolbar de `A5` n'est pas la même en `A6`

Le mockup de `A6` remplace la toolbar par une barre de 34 px qui ne porte que les chips de filtre et
de tri, plus les rappels `esc` / `⌘Z` à droite. Ni stepper `LIMIT`, ni rafraîchir, ni sélecteur de
colonnes.

C'est cohérent : rafraîchir jetterait les modifications en attente, et changer de `LIMIT` relancerait
la lecture. Les trois contrôles sont donc **retirés** en mode édition, plutôt que désactivés — une
barre à moitié grisée se lit comme une panne.

## Terminé quand

- Comparaison visuelle contre `A6` : bandeau, badge, teintes de ligne et de cellule, coin ambre,
  barre d'état.
- `⌘E` bascule, et le rappel réapparaît dans la barre d'état de `A5`.
- Les quatre affichages du compte suivent le modèle, vérifié après un `⌘Z`.
- Quitter le mode édition conserve les modifications en attente.
- Une cellule modifiée se distingue d'une cellule filtrée **autrement que par la couleur**.
- Le mode est par onglet : basculer sur un onglet ne bascule pas l'autre.
- « Tout annuler » vide le modèle et fait disparaître toutes les marques.
- La toolbar de `A5` disparaît en édition, elle n'est pas grisée.
- Aucune couleur littérale hors `tokens.json`.
