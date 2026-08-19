# 24a — Créer un projet : l'étape 1

## Goal

« Nouveau projet » ouvre une modale qui crée **un projet** : son nom, et ses environnements. Le projet
cesse d'être un effet de bord de la déclaration d'une connexion.

## Scope

**Ce que l'étape contient**, et rien de plus : le nom du projet, et la liste de ses environnements —
préremplie du trio de `23a`, `dev` vert, `staging` ambre, `prod` rouge et marqué production.

**Le projet est écrit à la validation de cette étape**, par `create_project`. Trois raisons, dans
l'ordre de force :

1. **L'étape suivante a besoin d'un projet réel.** `23d` veut les environnements *du projet choisi* ;
   `08e` construit la référence du trousseau depuis `dorabase/<projet>/<base>/<environnement>` ; et
   `save_database` refuse un projet inconnu. Un projet en mémoire obligerait à répliquer côté
   JavaScript ce que le cœur sait déjà.
2. **L'unicité du nom se vérifie tôt.** Écrire à la fin des deux étapes ferait découvrir « ce nom est
   déjà pris » après la saisie de l'hôte, du port et du mot de passe : le refus arriverait au pire
   moment.
3. **Un échec à l'étape 2 ne doit pas coûter l'étape 1.**

**Les libellés d'environnement sont modifiables ici, et c'est le seul moment où c'est gratuit.**
`23a` fige l'identifiant au libellé donné **à la création** : tant qu'aucune connexion n'existe,
identifiant et libellé coïncident et un renommage est sans dette. Dès la première connexion, tout
renommage installe la divergence que `23a` accepte comme un moindre mal.

**La couleur, elle, ne se choisit pas ici** — elle suit l'ordre de déclaration. C'est l'arbitrage entre
les deux conceptions : la couleur n'a aucune conséquence différée, contrairement au libellé, donc rien
ne justifie de la faire entrer dans une modale de création. Elle appartient à `23e`.

## Not in this scope

- **Le stepper** : `24b`.
- **L'enchaînement vers la connexion** : `24c`.
- **Les chemins d'entrée** et les raccourcis : `24d`.
- **Réordonner les environnements, changer leur couleur** : `23e`. Le composant de ligne écrit ici est
  celui que `23e` réemploiera — pas une seconde implémentation qui divergerait.
- **L'environnement actif ne se choisit pas.** La règle de `08f` tient : il est le premier déclaré, et
  la première connexion enregistrée le fixera. Le proposer ici demanderait de comprendre une notion
  avant d'avoir déclaré la moindre base.

## Approach

Une modale de 820 px — **la largeur d'`A2`**, parce qu'une modale qui change de largeur entre deux
étapes du même parcours se lit comme deux boîtes de dialogue différentes.

Les environnements sont **une liste de lignes**, non des `Chip` ni un `RadioGroup`. Un `RadioGroup` dit
« choisissez-en un » ; ici on n'en choisit aucun, on les déclare. Un `Chip` porte un libellé et une
croix, pas un libellé modifiable **et** un drapeau. La ligne est la forme que `15a` emploie déjà pour
un objet à plusieurs réglages, et celle que `23e` a déjà spécifiée pour cette donnée exacte.

La liste défile au-delà de cinq lignes (`max-height`), et **le pied ne bouge jamais** : une modale dont
le pied sort de la fenêtre n'a plus de bouton principal atteignable.

Les refus sont dits **avant le clic** et **à côté du champ fautif** : nom vide, nom déjà pris — la liste
des projets est en mémoire —, deux libellés identiques, dernier environnement retiré. L'invariant Rust
reste l'autorité pour la course entre deux fenêtres, et son refus s'affiche au même endroit.

## Done when

- [x] « Nouveau projet » **ouvre** cette modale — le câblage des points d'entrée est `24d` ; la modale,
      elle, existe et ne demande que le nom et les environnements
- [x] Le trio de `23a` est prérempli, ses libellés modifiables, sa couleur non
- [x] Un environnement s'ajoute et se retire ; le dernier ne se retire pas, et la ligne dit pourquoi
- [x] Le projet est écrit par `create_project` à la validation
- [x] Nom vide, nom déjà pris et libellés en doublon sont dits avant le clic, près du champ
- [x] Cinq environnements font défiler la liste ; le pied reste dans la fenêtre à 960 × 600
