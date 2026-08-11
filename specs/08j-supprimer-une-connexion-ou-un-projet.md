# 08j — Supprimer une connexion ou un projet

## Objectif

Retirer de DoraBase une base déclarée, ou un projet entier avec ses bases. Aujourd'hui rien ne
permet de défaire une déclaration : une base créée par erreur reste dans l'arbre pour toujours.

## Dépend de

`05a` (le modèle), `05b` (la persistance), `05c` (les secrets), `08h` (le menu « … » qui ouvre cette
action), `09b` (le registre de connexions).

## Périmètre

- Les commandes `delete_database` et `delete_project`, qui n'existent pas.
- La **suppression du mot de passe** correspondant dans le Trousseau macOS.
- La fermeture de la connexion ouverte, et la fermeture des onglets qui lisaient cette base.
- Une confirmation qui dit **exactement** ce qui est supprimé.

## Hors périmètre

- **Supprimer quoi que ce soit dans la base distante** — voir § Approche : c'est le risque central
  de cette spec, et la réponse est « jamais ».
- **Une corbeille, ou une annulation.** La configuration est un fichier ; la restaurer relève d'une
  sauvegarde, pas d'un `undo`. Dit dans la confirmation.
- **Supprimer une seule variante d'environnement** d'une base qui en a plusieurs. Utile, mais c'est
  un autre geste et une autre confirmation : sa propre spec si le besoin vient.

## Approche

### On supprime une **déclaration de connexion**, jamais la base distante

C'est l'ambiguïté qui peut coûter des données à quelqu'un, et aucun mot ne doit la laisser
subsister. Trois décisions en découlent :

- **Le libellé ne dit jamais « supprimer la base ».** Il dit ce qui part : « Retirer cette
  connexion de DoraBase ».
- **La confirmation nomme les deux faits**, celui qui inquiète et celui qui rassure : la déclaration
  et son mot de passe enregistré sont effacés de cet ordinateur ; **le serveur et ses données ne
  sont pas touchés**. Aucun `DROP` n'est émis, et aucune commande de cette spec n'ouvre de
  connexion.
- **Le bouton porte le verbe du geste** — « Retirer la connexion » — et non « OK ». Un bouton qui
  nomme son acte est la dernière chance de lire ce qu'on fait.

### La configuration est écrite d'abord, les secrets effacés ensuite

L'ordre inverse a été écrit puis corrigé, et la raison vaut d'être notée : si l'écriture échouait
**après** l'effacement, la base restait *déclarée sans son mot de passe*, et le redemandait à la
prochaine connexion sans que rien l'explique. Dans cet ordre, une écriture qui échoue ne laisse rien
derrière ; un secret qui résiste après coup est un orphelin **signalé**. Même arbitrage qu'en `08i` :
la phase destructive en dernier.

### Le mot de passe part avec la déclaration

Décision prise le 10 août 2026 : un secret laissé derrière serait **invisible depuis
l'application** et personne ne le nettoierait jamais. La suppression du Trousseau suit donc celle
de la déclaration.

**Un secret introuvable n'est pas un échec.** Il peut avoir été effacé à la main, ou n'avoir jamais
existé pour un moteur qui n'en demande pas. La suppression se poursuit — refuser de retirer une
déclaration parce que son mot de passe manque déjà rendrait certaines entrées indélébiles.

### L'écran ne doit pas rester ouvert sur ce qui n'existe plus

Supprimer une base ferme sa connexion et les onglets qui la lisaient. Un onglet survivant lirait une
base dont la déclaration est partie — au mieux une erreur, au pire une lecture sur une connexion que
le registre ne sait plus nommer. Des **modifications en attente** (`11b`) sur un onglet fermé de la
sorte seraient perdues : la confirmation le dit quand il y en a, en les comptant.

### Supprimer un projet est la même opération, répétée

`delete_project` retire chaque base — donc chaque secret — puis le projet. Rien de spécifique, sinon
que la confirmation compte ce qui part : « 3 connexions et leurs mots de passe enregistrés ».

## Terminé quand

- [ ] `delete_database` retire la déclaration et son secret ; un secret absent ne fait pas échouer.
- [ ] `delete_project` retire toutes les bases du projet, leurs secrets, puis le projet.
- [ ] **Aucune commande de cette spec n'ouvre de connexion ni n'émet de SQL** — vérifié, pas
      supposé : un test échoue si un moteur est sollicité.
- [ ] La confirmation nomme ce qui est effacé **et** ce qui n'est pas touché ; le bouton porte le
      verbe du geste.
- [ ] La connexion ouverte est fermée, et les onglets de cette base aussi.
- [ ] Les modifications en attente perdues sont comptées dans la confirmation.
- [ ] La suppression survit à un redémarrage — la base ne réapparaît pas.
