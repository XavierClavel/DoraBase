# 08e — « Enregistrer & ouvrir »

## Objectif

Créer réellement l'entité que `A2` décrit : écrire la base et sa variante dans la
configuration, ranger le mot de passe dans le magasin de secrets, et fermer la modale.
C'est le premier geste du produit qui **persiste** quelque chose.

## Dépend de

`05a` (le modèle et ses invariants), `05b` (l'écriture atomique), `05c` (le magasin de
secrets), `08b` et `08c` (le formulaire), `08d` (l'état désactivé après échec).

## Périmètre

- Une commande Tauri qui ajoute une base et sa variante à un projet existant.
- L'écriture du mot de passe dans le magasin, et la `SecretRef` qui le remplace dans la
  configuration.
- Le raccourci `⌘↩`, tel que le pied l'affiche.
- Le refus, quand les invariants de `05a` ne sont pas tenus.
- La fermeture de la modale, et le compteur de projets de `A1` qui cesse d'être figé.

## Hors périmètre

- **L'ouverture de la base**, malgré le libellé du bouton. « Ouvrir » veut dire aller vers
  `A4`, qui n'existe pas avant `09`. Ce scope enregistre et ferme ; la navigation est
  branchée par `09`. À dire dans le code, pour qu'un lecteur ne cherche pas le bug.
- **La création d'un projet.** Le `Select` « Projet » de `A2` choisit parmi les projets
  existants. Le mockup ne montre aucun « Nouveau projet… » dans cette liste, et `A1` a son
  propre bouton. Ce qui pose une question : que voit un utilisateur sans aucun projet ?
  Voir § Approche.
- **La modification d'une base existante.** `A2` s'intitule « Nouvelle connexion ». Un
  écran d'édition réemploierait le même formulaire, et c'est une spec à part.
- **La migration de configuration.** Faite en `05b`, rien à ajouter.

## Approche

### Deux écritures qui peuvent échouer séparément

Ranger un secret et écrire la configuration sont deux opérations distinctes, sur deux
supports distincts. Trois issues possibles, dont une piège :

1. Les deux réussissent — cas normal.
2. Le secret échoue — rien n'est écrit, on refuse. Simple.
3. **La configuration échoue après que le secret est rangé** — un secret orphelin reste
   dans le Trousseau, référencé par rien.

Le troisième cas est celui qu'on découvre six mois plus tard. L'ordre retenu :
**secret d'abord, configuration ensuite, et suppression du secret si la configuration
échoue.** Un secret orphelin n'est pas dangereux mais il est sale, et `05c` fournit
`supprimer`.

Ce nettoyage doit être **testé en le provoquant** : rendre l'écriture de configuration
impossible (répertoire en lecture seule) et vérifier que le magasin est revenu à son
état de départ. Sans ce test, la branche de nettoyage ne serait jamais exécutée.

### Les invariants restent en Rust

`05a` porte déjà les règles — nom non vide, port dans les bornes, unicité du couple
base/environnement. L'écran ne les redit pas : il appelle, et affiche le refus.

Recopier la validation côté JavaScript donnerait deux vérités qui divergeraient, et
c'est côté Rust que la règle est vraie, parce que c'est là que l'écriture se fait. Le
prix est un aller-retour IPC pour un champ vide : inaudible.

Le mockup ne maquette **aucun message d'erreur de saisie** dans `A2`. Le refus est donc
affiché là où `08d` affiche déjà les échecs : le message inline du pied. Réemploi plutôt
qu'invention, et la question d'un affichage par champ est consignée au § « À trancher ».

### Un utilisateur sans projet

`A1` propose « Nouveau projet », et `A2` un `Select` de projets existants. Rien ne
maquette le cas où l'on arrive sur `A2` sans aucun projet — pourtant c'est la première
chose qu'un nouvel utilisateur rencontre s'il passe par `⌘N`.

Ce scope refuse d'inventer un formulaire de création dans `A2`. Il fait le minimum
vérifiable : **le bouton « Enregistrer & ouvrir » est désactivé quand aucun projet
n'existe**, et le `Select` affiche « Aucun projet — créez-en un d'abord ». Le vrai
parcours appartient au design, et la question part au § « À trancher ».

### Le compteur de `A1` cesse de mentir

`07` affiche « 0 projet » en dur, faute de quoi que ce soit qui appelle `load_config`.
Après ce scope, une base enregistrée doit se voir. C'est le premier bout de boucle
complète du produit : saisir, persister, relire, afficher.

C'est aussi ce qui rend l'écriture vérifiable de bout en bout **dans l'app réelle** :
enregistrer, quitter, relancer, et retrouver ce qui a été saisi. Aucun test automatisé
ne couvre ce parcours ; il est à faire et à rapporter, comme le pont de `08d`.

### Le mot de passe est un secret dès la saisie

Le champ ne doit jamais voir sa valeur passer par un journal, un message d'erreur ou un
`Debug`. Côté Rust, `Secret` de `05c` s'en charge. Côté JavaScript, l'état du champ est un
`string` ordinaire — rien n'y protège, et rien ne peut vraiment.

La règle applicable est donc : **la valeur quitte le JavaScript et n'y revient pas.** À
la fermeture de la modale, l'état est vidé ; après enregistrement, le champ affiche des
points venant du badge « Trousseau », pas de la valeur.

## Terminé quand

- Une base enregistrée survit à un redémarrage de l'app, vérifié dans l'app réelle.
- Le mot de passe est dans le magasin, la configuration ne contient qu'une `SecretRef`,
  et le fichier de configuration ne contient nulle part le mot de passe — vérifié par
  sentinelle avec contrôle positif.
- Une configuration impossible à écrire laisse le magasin **inchangé**, vérifié en
  provoquant l'échec.
- Chaque invariant de `05a` violé produit un refus visible, et rien n'est écrit.
- `⌘↩` enregistre ; il est inopérant quand le bouton est désactivé.
- Sans aucun projet, le bouton est désactivé et le `Select` le dit.
- Après enregistrement, la modale se ferme et `A1` affiche le bon compte.
- Aucun secret dans un journal ni un message, y compris en cas d'échec.
