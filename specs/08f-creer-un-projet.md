# 08f — Créer un projet

## Objectif

Permettre de créer un projet. Aujourd'hui l'application n'en offre aucun moyen : `08e` refuse
l'enregistrement tant qu'aucun projet n'existe, et rien ne permet d'en faire un — l'application
neuve est donc une impasse.

## Dépend de

`05a` (le modèle `Project`), `05b` (la persistance), `08b` (le formulaire de `A2`),
`08e` (« Enregistrer & ouvrir »).

## Périmètre

- Une commande `create_project`, qui n'existe pas.
- Dans le `Select` de projets de `A2`, une entrée **« + Nouveau projet… »** qui révèle un champ
  « Nom du projet ».
- L'enregistrement crée le projet puis y ajoute la base, en une seule action de l'utilisateur.
- Le refus d'un nom vide ou déjà pris, dit à l'endroit où `08d` et `08e` disent déjà leurs échecs.

## Hors périmètre

- **Un écran de gestion des projets** — renommer, supprimer, réordonner. Rien ne le réclame, et
  le handoff ne le maquette pas. Le supprimer poserait en outre la question des secrets de ses
  bases, qui appartient à une autre spec.
- **Le choix de l'environnement actif du projet.** `05a` en fait une propriété du projet ; `A2`
  n'offre que le sélecteur d'environnement de la *variante*. Le projet naît donc sur
  l'environnement que la première variante déclare — voir § Approche.
- **Ajouter une base à un projet existant** : déjà là depuis `10b`, par « Ajouter une base » du
  pied de la sidebar.

## Approche

### Une commande distincte, et non un `save_database` plus permissif

`enregistrer` (`05b`) refuse un projet inconnu par `SaveError::ProjetInconnu`, et c'est une bonne
chose : une commande qui crée l'entité manquante par effet de bord ferait d'une faute de frappe
dans un nom de projet un second projet silencieux.

`create_project` est donc séparée. Elle porte son propre invariant — un nom non vide, unique — et
rend la liste des projets à jour, comme `save_database` depuis `08e`, pour que l'écran n'ait pas à
relire le disque.

### L'écran fait les deux en un geste, le cœur en deux commandes

Demander à l'utilisateur de créer un projet, de fermer, puis de rouvrir `A2` pour y déclarer une
base serait une friction que rien ne justifie : personne ne crée un projet vide. `A2` enchaîne
donc `create_project` puis `save_database`.

Conséquence assumée : si la seconde échoue, le projet reste — créé et vide. C'est le comportement
honnête. L'alternative serait de le défaire, donc de supprimer un projet à la suite d'un échec de
connexion, ce qui détruirait un projet homonyme préexistant en cas de course. Un projet vide est
visible dans l'arbre et se remplit au geste suivant.

### L'environnement actif du projet vient de sa première variante

`05a` fait de l'environnement actif une propriété du **projet**, et `A2` ne propose que celui de
la variante. Créer le projet sur `dev` alors que l'utilisateur vient de déclarer une variante
`prod` afficherait un arbre vide juste après l'enregistrement — la base existe, mais dans un autre
environnement que celui affiché.

Le projet naît donc sur l'environnement de la variante qu'on lui déclare. Trou du handoff, qui ne
maquette pas de choix d'environnement à la création.

### Le nom d'un projet n'est pas un identifiant technique

Il apparaît dans la sidebar et la barre de titre : « Atelier Nord », avec sa capitale et son
espace. C'est le seul champ de `A2` où l'autocorrection ne nuit pas — mais il reste dans un
`Field`, donc elle est désactivée comme partout. Cohérence plutôt qu'exception : un utilisateur
qui tape une capitale l'obtient, ce qui n'est pas le cas de `localhost` corrigé en `Localhost`.

## Terminé quand

- Depuis une application sans aucun projet, `⌘N` mène à un formulaire qui permet de créer le
  projet **et** sa première base, sans passer par un autre écran.
- `create_project` refuse un nom vide et un nom déjà pris, avec un message qui le dit.
- Le projet créé porte l'environnement actif de la variante déclarée.
- Après enregistrement, le projet et sa base apparaissent dans l'arbre sans relecture du disque.
- Un échec de `save_database` laisse le projet créé, et l'écran le dit.
- Le `Select` distingue « choisir un projet existant » de « en créer un » sans ambiguïté.
- Aucune couleur littérale hors `tokens.json`.
