# 23f — Supprimer un environnement, et ce que ça emporte

## Goal

Retirer un environnement d'un projet supprime les connexions qui lui appartiennent. L'écran le **dit
avant**, en les nommant.

## Scope

**La confirmation nomme ce qui disparaît**, et non « êtes-vous sûr ? » — la règle de `08j` et `11d` :

> Retirer **staging** de *Atelier Nord* supprimera aussi ses **3 connexions déclarées** :
> `analytics`, `shop`, `evenements`. Leurs mots de passe seront retirés du trousseau.
> **Les bases distantes ne sont pas touchées.**

Les trois phrases sont là pour trois raisons distinctes : la première dit l'ampleur, la deuxième dit
que le trousseau suit, la troisième dit ce qui **ne** se passe pas — c'est celle que `08j` a rendue
obligatoire, parce que « supprimer une connexion » se lit comme « supprimer la base ».

**Sans connexion, pas de confirmation.** Retirer un environnement vide est un geste sans conséquence :
demander confirmation pour rien apprend à cliquer sans lire.

**L'environnement actif.** S'il est celui qu'on retire, le premier restant devient actif (`23c`), et
la confirmation le dit — sinon l'arbre changerait de contenu sans explication.

**Le trousseau.** Chaque connexion supprimée voit son mot de passe retiré, une entrée à la fois. Un
échec de retrait n'annule pas la suppression : la déclaration part, et l'écran signale les secrets
restés en place. L'inverse — tout annuler parce qu'une entrée du trousseau résiste — laisserait
l'utilisateur devant un environnement qu'il ne peut pas retirer.

## Not in this scope

- **Déplacer une connexion vers un autre environnement** au lieu de la supprimer. C'est une réponse
  raisonnable à la même situation, et elle demande de déplacer un secret du trousseau : son geste, sa
  spec. La confirmation ne la propose donc pas — proposer une action absente serait pire que son
  absence (défaut n° 36).
- **Annuler la suppression.** Rien dans ce produit n'a de corbeille, et en inventer une pour ce seul
  geste serait incohérent.

## Approach

`delete_environment` (`23c`) reçoit le projet et l'identifiant, et rend la liste des connexions
supprimées **et** celle des secrets qu'il n'a pas pu retirer. C'est ce second retour qui permet à
l'écran de dire la vérité plutôt que « c'est fait ».

Le compte affiché dans la modale d'édition (`23e`) et celui de la confirmation viennent de la même
source : les projets chargés. Deux calculs indépendants finiraient par annoncer deux nombres.

## Done when

- [x] La confirmation nomme l'environnement, compte les connexions, les liste et dit que les bases
      distantes ne sont pas touchées
- [x] Un environnement sans connexion se retire sans confirmation
- [x] Retirer l'environnement actif en désigne un autre, et la confirmation l'annonce
- [x] Les mots de passe des connexions supprimées sont retirés du trousseau
- [x] Un échec de retrait de secret n'annule pas la suppression, et se dit
- [x] Le dernier environnement d'un projet ne se retire pas (`23c`)
