# 23e — Éditer un projet, et ses environnements

## Goal

Une modale pour modifier un projet déclaré : son nom, et la liste de ses environnements.

## Scope

**Un seul écran, deux sections.** Le nom du projet en haut — le renommage de `08i`, déjà écrit, y
déménage depuis son propre dialogue. La liste des environnements en dessous, chacun sur une ligne :
libellé modifiable, couleur, drapeau de production, et le bouton qui le retire.

**Ce que chaque ligne montre, en plus du réglage :** le **nombre de connexions** qui en dépendent.
C'est cette information qui rend l'avertissement de `23f` prévisible, avant même de cliquer.

**L'ordre se règle par glissement**, comme les onglets de `10b` : c'est l'ordre du sélecteur de la
barre de titre, donc un réglage d'affichage courant.

**Comment on y arrive.** Deux chemins, comme pour l'édition d'une base (`08g`) : le menu « … » de la
ligne de projet dans l'arbre, et le menu de la pastille projet de la barre de titre. Les deux mènent à
la même modale — l'arbre est là où l'on regarde ses projets, la pastille là où l'on regarde le projet
courant.

**Chaque geste s'applique immédiatement**, comme les préférences de `15a` : pas de bouton
« Appliquer », donc pas de formulaire tampon à réconcilier. Un renommage part au relâchement du champ,
une couleur au clic. La seule exception est la suppression, qui demande confirmation (`23f`).

## Not in this scope

- **La suppression du projet entier.** Elle existe déjà (`08j` pour une connexion) mais pour un projet
  elle emporte toutes ses connexions et tous ses mots de passe : sa propre décision, sa propre spec.
- **Les requêtes enregistrées du projet** (`12f`), qui ne dépendent d'aucun environnement.
- **Créer un projet** : `08f` le fait depuis `A2`, et rien ne change.

## Approach

La modale réemploie `Modal` (`03`) et les primitives de `15a` — même liste de lignes réglables, même
absence de bouton d'application. Le compte de connexions par environnement se calcule depuis les
projets déjà chargés : aucune lecture nouvelle.

**Le renommage de projet déménage plutôt que de se dédoubler.** `RenameProjectDialog` (`08i`) devient
la section haute de cette modale. Deux écrans qui renomment la même chose finiraient par diverger, et
le second à être écrit serait celui qu'on oublie de corriger.

## Done when

- [x] La modale s'ouvre depuis le menu « … » du projet et depuis la pastille de la barre de titre
- [x] Le nom du projet s'y renomme, et l'ancien dialogue de `08i` n'existe plus
- [x] Chaque environnement s'y renomme, se recolore, se marque production et se réordonne
- [x] Chaque ligne affiche le nombre de connexions qui en dépendent
- [x] Un environnement s'ajoute, avec le trio par défaut comme point de départ d'un projet neuf
- [x] Tout s'applique sans bouton « Appliquer », la suppression exceptée
