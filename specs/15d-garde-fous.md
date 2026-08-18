# 15d — `A10` : les garde-fous d'écriture

## Goal

Rendre réglables les quatre garde-fous que `11d` et `12c` ont livrés « actifs par défaut et non
réglables ».

## Dépend de

`15a`, `11d` (l'application des modifications), `12c` (l'exécution libre).

## Scope

- « Modifications en attente avant écriture » — le mode de `A6`.
- « Ouvrir les bases *prod* en lecture seule ».
- « Refuser DELETE/UPDATE sans clause WHERE », dans la console **comme** dans la grille.
- « Garder le patch inverse 24 h » — et sa persistance, que `11d` n'a pas livrée.

## Not in this scope

- **Un garde-fou par base.** Le mockup les met au niveau de l'application. Une exception par base
  serait plus fine et beaucoup plus facile à oublier.

## Approche

### Désactiver un garde-fou doit être plus difficile que l'activer

`11d` disait : « un garde-fou qu'on peut désactiver avant qu'un écran ne l'explique est un garde-fou
qu'on désactive par accident ». L'écran existe maintenant, et chaque bascule porte la phrase de ce
qu'elle protège — pas son mécanisme. « Refuser DELETE/UPDATE sans WHERE » dit ce qui arrive quand on
l'éteint.

Les quatre restent **activés par défaut**, y compris pour une installation existante : `serde(default)`
rend `true`, pas `false`. Un défaut à `false` transformerait une mise à jour de DoraBase en levée
silencieuse des garde-fous.

### « Refuser sans WHERE » devient un refus, pas une confirmation

`12c` demande une confirmation ; ce réglage la transforme en **refus**. La différence est réelle :
une confirmation se clique, un refus oblige à écrire la clause. Quand le garde-fou est éteint, la
confirmation de `12c` reste — elle ne dépend pas de lui.

### Le patch inverse persisté est un vrai travail, pas une case à cocher

`11c` et `11d` ont annoncé « gardera le patch inverse pendant 24 h » puis retiré la promesse, faute de
le persister. Cette spec doit décider **où** (la configuration ? un fichier à part ?), **sous quelle
forme**, et ce qu'il advient d'un patch dont la base a changé entre-temps. Si la réponse dépasse cette
spec, la bascule est livrée **désactivée avec sa raison** plutôt qu'activée sans effet — la leçon du
défaut n° 36.

## Done when

- [ ] Les quatre bascules se règlent et survivent à un redémarrage.
- [ ] Les quatre sont **actives par défaut**, y compris sur une configuration antérieure.
- [ ] Éteindre « prod en lecture seule » permet d'éditer une base `prod` ; l'allumer l'interdit.
- [ ] « Refuser sans WHERE » **refuse** dans la console, et la confirmation reste quand il est éteint.
- [ ] Chaque bascule dit ce qu'elle protège, pas comment elle marche.
- [ ] Le patch inverse est soit persisté, soit désactivé avec sa raison — jamais annoncé sans effet.
