# 18a — MongoDB face au contrat de `06a`

## Goal

Trancher les six endroits où le contrat de la couche moteur suppose quelque chose que MongoDB n'a
pas. Aucune implémentation : des décisions, et ce que le contrat gagne ou relâche.

## Dépend de

`06a` (le contrat), `05a` (le modèle de configuration, qui connaît déjà `Engine::MongoDb`).

## Scope

- Le niveau « schéma » : ce qu'il porte pour MongoDB.
- Les colonnes d'une collection, qui n'existent pas.
- Le DDL de `A9`, qui n'existe pas non plus.
- Les types BSON que `Value` ne nomme pas.
- Les transactions, qui exigent un jeu de réplicas.
- Les deux méthodes du trait qui portent « sql » dans leur nom.

## Not in this scope

- **Toute connexion, lecture ou écriture** → `18b` à `18g`. Cette spec est déclarative, comme `06a`.
- **Les écrans** : `A8` (`13a`–`13c`) est écrit et attend ce moteur.

## Approche

### Le niveau « schéma » porte les bases MongoDB

L'arbre de `A4` a quatre niveaux : projet → base déclarée → schéma → objet. PostgreSQL les remplit
par base → schéma → table. MongoDB n'a pas de schéma, et fabriquer un pseudo-schéma nommé comme la
base afficherait `analytics › analytics › orders`.

**La déclaration de connexion est le serveur, le niveau « schéma » est la base MongoDB, l'objet est
la collection.** Une connexion MongoDB voit plusieurs bases ; c'est exactement ce que le niveau
schéma sait montrer. Aucun changement d'arbre, aucun niveau replié, et le mot « schéma » n'apparaît
nulle part dans l'interface — la sidebar affiche des noms, pas des types de niveau.

### Une collection n'a pas de colonnes : elles sont déduites

`A5` et `A9` réclament des `ColumnInfo`. `18d` les produit par **échantillonnage**, avec la
fréquence de chaque champ. Le mot « déduit » est porté par l'interface (`13c`), pas seulement par un
commentaire — un champ à 98 % n'existe pas dans 2 % des documents.

### Le DDL est le `createCollection` équivalent, pas une fiction

`TableDetail.ddl` est une `String`, pas une option, et `A9` l'affiche en disant qu'il est
**reconstruit** (`14c`). Pour MongoDB, ce texte est la suite de commandes `mongosh` qui recrée la
collection : `createCollection` avec ses options et son validateur s'il en a un, puis les
`createIndex`. C'est du DDL au sens de `14c` — équivalent, replayable, pas identique à ce qui a été
tapé. Rendre une chaîne vide ferait un panneau vide sans raison affichée.

### Les types BSON entrent dans `Value` sans nouvelle variante

`Value` couvre neuf formes. La correspondance : `Decimal128` → `Decimal` (texte exact, comme
`numeric`), `Date` → `Timestamp`, `BinData` → `Binary`, document imbriqué et tableau → `Json`.

**`ObjectId` devient un `Text` de catégorie `uuid`**, donc le glyphe `ID` de `A5`. Ajouter une
variante obligerait chaque écran à connaître un type propre à MongoDB — sept `match` à étendre pour
un rendu identique à celui d'un texte. Le coût est nommé : un `ObjectId` ne se distingue pas d'une
chaîne de 24 caractères hexadécimaux à l'affichage. Le tableau de `A9` porte son type natif, qui le
dit.

### Une transaction exige un jeu de réplicas, et un `mongod` seul n'en est pas

`apply_updates` promet « tout ou rien » (`06a`, `11d`). MongoDB ne l'offre qu'en jeu de réplicas ou
en cluster fragmenté. Sur un `mongod` isolé, la promesse est **intenable** : `18f` doit la refuser
avec sa raison plutôt que d'écrire sans filet. Le contrat ne change pas — c'est l'adaptateur qui
échoue, et l'écran affiche déjà les refus (`11d`).

### `run_sql` et `explain_sql` gardent leur nom, et c'est une dette assumée

Les deux méthodes portent « sql » ; MongoDB reçoit du `mongosh`. Les renommer toucherait le trait,
l'énumération, les commandes Tauri, la projection TypeScript et six appels d'écran, pour un gain de
lecture. **La dette est inscrite ici** plutôt que payée maintenant : le paramètre est du texte dans
le langage du moteur, et c'est ce que les docstrings diront.

## Done when

- [ ] Les six décisions sont dans le code, en commentaires, là où elles se constatent.
- [ ] `AnyEngine` gagne sa variante `MongoDb`, et la compilation exige de traiter les onze méthodes.
- [ ] La correspondance BSON → `Value` est écrite une fois, testable sans base.
- [ ] Aucun écran ne gagne un `match` sur un type propre à MongoDB — vérifié.
- [ ] Aucun test n'a besoin d'une base : ce scope est déclaratif.
