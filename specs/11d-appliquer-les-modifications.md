# 11d — `A6` : appliquer les modifications

## Objectif

Écrire les modifications en attente dans la base, en une transaction. **C'est la première écriture
du projet** — tout le reste, depuis `01`, est en lecture.

## Dépend de

`06a` (le contrat moteur), `06b` (la connexion), `11a` (le modèle), `11c` (le SQL prévisualisé).

## Périmètre

- Une commande `apply_changes` : `BEGIN`, un `UPDATE` par modification, `COMMIT`.
- La génération du SQL, **côté moteur**, que `11c` prévisualise déjà.
- Les trois garde-fous : `WHERE` obligatoire, confirmation en production, patch inverse.
- Les issues : succès, refus du moteur, conflit.

## Hors périmètre

- **Les préférences de `A10`** qui gouvernent ces garde-fous (« Refuser DELETE/UPDATE sans WHERE »,
  « Garder le patch inverse 24 h »). Ici ils sont **actifs par défaut** et non réglables : un
  garde-fou qu'on peut désactiver avant qu'un écran ne l'explique est un garde-fou qu'on désactive
  par accident.
- **`INSERT` et `DELETE`** — `A6` ne montre que des modifications de cellules.
- **La détection de conflit par version.** Voir § Approche : ce scope compare l'ancienne valeur.

## Approche

### Une transaction, et le `WHERE` vient de la clé primaire

Chaque modification devient `UPDATE <table> SET <colonne> = $1 WHERE <clé> = $2`, les valeurs liées
en paramètres. Le tout entre `BEGIN` et `COMMIT` : trois modifications qui s'appliquent à moitié
laisseraient des données incohérentes que rien ne signalerait.

**Un `UPDATE` sans `WHERE` est impossible par construction**, pas par vérification : la commande
exige la clé primaire de chaque ligne, et une table sans clé primaire est **refusée à l'édition**
dès `11a`. Le garde-fou de `A10` (« refuser DELETE/UPDATE sans WHERE ») est donc déjà tenu par le
type, ce qui vaut mieux qu'un test de chaîne sur du SQL généré.

### Le SQL exécuté est celui qui a été montré, littéralement

`11c` prévisualise une suite d'instructions rendue par le cœur. `apply_changes` doit exécuter
**celle-là**, pas une reconstruite à partir des mêmes données : deux chemins de génération
divergeraient, et l'écart tomberait précisément sur les cas rares — citation d'un nom, valeur
contenant une apostrophe.

Une seule fonction produit donc les instructions ; la prévisualisation les rend en texte, l'exécution
les envoie paramétrées. Le test qui compte compare les deux sorties de la même entrée.

### Le conflit se détecte sur l'ancienne valeur

Entre la lecture et l'application, quelqu'un d'autre a pu modifier la ligne. Écrire quand même
écraserait son travail en silence.

Le `WHERE` porte donc aussi l'ancienne valeur : `WHERE id = $1 AND colonne = $2`. Zéro ligne affectée
signifie « la valeur a changé sous vos pieds », et la transaction est **annulée entièrement** — un
`ROLLBACK`, pas un rapport partiel.

C'est plus faible qu'un numéro de version, et c'est ce que le schéma permet : les tables n'ont pas
toutes une colonne de version, et en exiger une réduirait l'édition aux tables qui en ont. Limite
connue : deux modifications successives ramenant la même valeur passeraient inaperçues. Consigné.

### Le patch inverse, et pourquoi il n'est pas une préférence ici

Avant d'écrire, la commande retient de quoi défaire : pour chaque ligne, la clé et l'ancienne valeur
— soit exactement le modèle de `11a`. Le « patch inverse » est donc **le SQL de retour**, rendu à
l'écran après succès.

`A10` en fait une préférence à 24 h, ce qui suppose de le **persister**. Ce scope le rend seulement
disponible dans la session : le persister demanderait de décider où, sous quelle forme, et ce qu'il
advient d'un patch dont la base a changé entre-temps. Trois questions qui appartiennent à `15`.

Ce qui est livré ici : après une application réussie, le panneau montre le SQL qui l'annulerait, et
il est copiable. C'est le minimum honnête — annoncer « patch inverse gardé 24 h » sans le garder
serait pire que ne rien annoncer.

### La confirmation de production est une sous-modale, comme `A3`

`08d` a déjà posé le motif : une sous-modale par-dessus la modale, voile plus opaque. Pour une base
`prod`, appliquer demande une confirmation qui **récapitule** — table, nombre de lignes, colonnes
touchées — parce qu'une confirmation qui dit seulement « Êtes-vous sûr ? » ne fait que déplacer le
clic.

Elle ne demande **pas** de retaper le nom de la table : le mockup ne le montre pas, et cette friction
appartient à une décision produit que rien ne réclame ici.

### Après le succès, la grille est relue

Les valeurs écrites peuvent différer de celles saisies — un `trigger`, une valeur par défaut, une
troncature. Afficher la valeur saisie donnerait un écran qui ne reflète plus la base.

La lecture de `10c` est donc relancée, et le modèle de `11a` vidé. C'est aussi ce qui fait
disparaître toutes les marques de `11b` d'un coup, sans qu'aucune ait à être effacée à la main.

## Terminé quand

- Trois modifications s'appliquent en **une** transaction, vérifié contre une vraie base.
- Un échec au milieu laisse la base **inchangée** — testé en provoquant l'échec du second `UPDATE`.
- Une valeur modifiée entre-temps par un tiers fait échouer l'application entière, avec un message
  qui dit que la ligne a changé.
- Le SQL exécuté est celui que `11c` a montré : une seule fonction les produit, et le test compare.
- Une table sans clé primaire n'est pas éditable, et l'écran le dit avant la saisie.
- Une base `prod` demande une confirmation qui récapitule ce qui va être écrit.
- Après succès, la grille est relue et les marques disparaissent ; le patch inverse est affiché.
- La valeur affichée après application vient de la **base**, pas de la saisie — vérifié avec un
  `trigger` qui modifie la valeur écrite.
- Aucune couleur littérale hors `tokens.json`.
