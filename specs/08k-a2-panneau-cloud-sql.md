# 08k — A2 : le panneau proxy à deux visages

## Objectif

Faire du sélecteur « Type » du panneau « Proxy / tunnel » un **vrai choix** : SSH ou Cloud
SQL, avec les champs de la sorte retenue. Sans cela, `05d` et `06g` savent décrire et
ouvrir un proxy Cloud SQL que personne ne peut saisir.

## Dépend de

`05d` (l'union `Proxy`), `08c` (le panneau actuel et sa grille), `08e` (la conversion du
brouillon en configuration).

## Périmètre

- Le `Select` « Type » avec ses deux options, et le contenu du panneau qui suit.
- Les deux champs Cloud SQL : « Instance » et « Compte de service ». **« Compte de service »
  a été retiré le 24 août 2026** → `06j` ; ce qui suit décrit l'écran tel qu'il a été livré,
  et `06j` dit ce qui en reste.
- Le badge, qui nomme la sorte active.
- `TunnelDraft` aligné sur l'union du modèle, et la conversion de `08e`.
- Le comportement au **changement de Type**.

## Hors périmètre

- **Valider le nom de l'instance.** Le champ accepte ce qu'on y met ; `06g` refuse à
  l'ouverture, avec le message du proxy lui-même. Même raison qu'en `08c` pour le chemin
  de clé : un nom peut devenir valable entre la saisie et la connexion, et réimplémenter
  la validation de Google produirait un désaccord.
- **Les options avancées** — IP privée, authentification IAM, usurpation → `06g` § Hors
  périmètre. Aucun champ ici pour ce que le moteur ne sait pas faire.
- **Le chemin du binaire** → `06g` le cherche ; ce n'est pas un champ de connexion.
- **Un état vide instruit** quand `cloud-sql-proxy` n'est pas installé. Le panneau ne
  vérifie pas : l'échec appartient à « Tester la connexion » (`08d`), qui a déjà l'endroit
  pour l'afficher. Le panneau qui sonderait le disque à chaque frappe serait pire.

## Approche

### Ce qui est inventé, et qui doit être remonté

Cloud SQL **n'est pas dans le handoff**. Ce panneau invente donc deux champs, un libellé
d'aide et un libellé de badge, sans maquette à confronter. Les choix sont pris pour rester
dans le vocabulaire visuel existant — mêmes tailles de 28 px, même grille, même bouton
« Parcourir… » — de sorte qu'une maquette ultérieure ait peu à corriger.

À inscrire au § « À trancher » de `README.md`, avec les cinq trous déjà relevés en `08a`–
`08e`.

### La grille ne change pas, son contenu change

Le panneau garde la grille `130px 1fr 84px 1fr` de `08c`. En SSH, les quatre champs
occupent la première rangée comme aujourd'hui. En Cloud SQL, « Type » garde sa place et
« Instance » prend les trois colonnes restantes — un nom de connexion
(`projet:région:instance`) est long, et le couper sur 1fr le rendrait illisible.

La rangée suivante garde sa sous-grille `1fr 220px` : à gauche « Clé privée » ou « Compte
de service » selon la sorte, à droite « Port local mappé », inchangé. Le port local est
commun aux deux — c'est exactement ce que `05d` exprime en le sortant de l'énumération, et
le panneau le rend visible : la seule partie qui ne bouge pas est la seule qui est commune.

### Le champ « Compte de service » dit ce que le vide signifie

> **Retiré par `06j`** (24 août 2026). Ce qui suit reste écrit parce qu'il explique un choix
> qui a tenu quatre jours, et pourquoi il ne tenait pas : le vide était bien une valeur, mais
> une valeur qu'il fallait persister, migrer, projeter et traduire entre `''` et `null` — pour
> la moins employée des trois sources d'identifiants. Il reste la phrase, sans le champ.

Même `Field` mono, même bouton « Parcourir… », même permission `dialog:allow-open` déjà
accordée par `08c` — rien à ajouter aux capacités.

Ce qui est nouveau : **vide est une valeur valable**, et signifie « identifiants par défaut
de l'application ». Le champ le dit sous lui, en clair, parce qu'un champ vide sans
explication se lit comme un champ oublié — et parce que c'est le cas le plus courant.

### Changer de Type remet à zéro les champs de l'autre sorte

Non par hygiène, mais par nécessité : `05d` a fait de `Proxy` une union, donc `08e` ne
peut pas convertir un brouillon qui porte un bastion **et** une instance. Garder les
champs en mémoire « au cas où l'utilisateur revienne » obligerait la conversion à choisir,
c'est-à-dire à deviner.

Conséquence à assumer et à ne pas cacher : basculer sur Cloud SQL puis revenir sur SSH
présente des champs vides. C'est cohérent avec la façon dont le panneau se comporte déjà
sans tunnel, et le prix d'un type qui ne ment pas.

### `TunnelDraft` suit l'union, avec ses chaînes

Le brouillon reste distinct du modèle pour les raisons de `ConnectionDraft` — un port est
une chaîne le temps de la saisie. Mais il devient une union discriminée sur la même
étiquette, de sorte que le compilateur refuse un panneau qui lirait `bastionHost` sur un
brouillon Cloud SQL. C'est ce qui remplace la maquette absente comme garde-fou.

### Le badge nomme la sorte

« SSH activé » devient « SSH activé » ou « Cloud SQL activé », même jeton lavande, même
règle qu'en `08c` : présent seulement si un proxy est déclaré. Nommer la sorte est ce qui
permet de lire l'état du panneau **replié**, où les champs ne sont plus visibles — l'état
que `08c` a dû inventer faute de maquette, et qui gagne ici sa raison d'être.

## Terminé quand

- Le `Select` « Type » a deux options, et en changer échange les champs.
- En Cloud SQL, aucun champ de bastion n'est rendu, et réciproquement — vérifié par
  requête sur les libellés, pas par lecture du CSS.
- Les champs Cloud SQL font **28 px** comme les autres, vérifié par mesure.
- Le libellé qui explique le vide du champ « Compte de service » est lié au champ, donc
  annoncé par un lecteur d'écran, et pas seulement affiché.
- « Parcourir… » remplit le champ « Compte de service », avec la même permission
  `dialog:allow-open` et **aucune** permission ajoutée — le test qui compte les
  permissions de `08c` continue de passer sans être modifié.
- Changer de Type efface les champs de l'autre sorte, couvert dans les deux sens.
- Un brouillon Cloud SQL se convertit en `Proxy::CloudSql`, un brouillon SSH en
  `Proxy::Ssh`, et lire le champ de l'autre sorte **ne compile pas**.
- Le badge nomme la sorte, et suit sa présence dans les deux sens.
- Le panneau replié retire son contenu de l'arbre d'accessibilité, comme en `08c`.
- Comparaison visuelle du visage SSH contre `A2` : **aucun écart** par rapport à `08c`.
  Le visage Cloud SQL n'a rien à comparer, et c'est consigné comme tel.
- Aucune couleur littérale hors `tokens.json`.
