# 06c — Introspection PostgreSQL

## Objectif

Remplir le modèle de `06a` depuis le catalogue de PostgreSQL : schémas, tables, vues,
fonctions, index, colonnes, contraintes, relations. C'est ce qui peuple l'arbre de
`A4`, la sidebar de `A5` et la structure de `A9`.

## Dépend de

`06a` (le modèle à remplir), `06b` (la connexion).

## Périmètre

- Lister les schémas d'une base, et les objets d'un schéma.
- Décrire une table : colonnes, types, nullabilité, défauts, clés, commentaires.
- Index, contraintes, triggers.
- Relations — clés étrangères entrantes et sortantes.
- Comptages et tailles, avec leur coût assumé.
- Le `CREATE TABLE` de `A9`.

## Hors périmètre

- **La lecture des données** → `06d`. L'introspection lit le *catalogue*, pas les
  tables de l'utilisateur.
- **Le schéma déduit de MongoDB** (`A8`) : il n'y a pas de catalogue à lire, c'est un
  échantillonnage de documents. → spec du moteur MongoDB.
- **La modification de structure.** Aucun `CREATE`, `ALTER` ni `DROP` n'est exécuté :
  `A9` *affiche* un DDL, ne l'applique pas. Le handoff ne montre aucun écran qui
  modifie une structure.
- **Les fonctions dans le détail** — corps, arguments, type de retour. `A4` n'en
  affiche qu'un **compte** (« Fonctions 6 ») ; les décrire serait construire pour un
  écran qui n'existe pas.
- **Le cache** : voir `06a`. Chaque appel interroge le catalogue.
- **Le diagramme** de `A9` (bouton « Diagramme ») : hors handoff maquetté.

## Approche

### Le catalogue plutôt que `information_schema`

PostgreSQL expose les deux. `information_schema` est portable mais incomplet : il
ignore les index, les commentaires d'objet, les tailles physiques et le `TOAST` — or
`A4` affiche des tailles, `A9` des index et des commentaires. Les catalogues `pg_*`
sont donc la source, et la portabilité se gagne par le contrat de `06a`, pas par une
vue commune qui ne suffit à personne.

### Le coût des comptages, et ce que le handoff permet

`A4` affiche « 1.9 M » lignes, `A9` « 1 904 220 lignes ». Le second est exact, le
premier arrondi — mais compter exactement exige un parcours complet, inacceptable sur
une grande table à l'ouverture d'un arbre.

`pg_class.reltuples` donne une **estimation** que le planificateur maintient, à coût
nul. La décision : l'arbre et le tableau de `A4` affichent l'estimation, et `A9` — un
écran de détail, ouvert délibérément sur une table — peut se permettre un compte
exact. Le modèle de `06a` doit donc distinguer les deux, sinon l'écran ne saurait pas
s'il affiche une valeur sûre.

C'est aussi ce qui explique la colonne « Dernier ANALYZE » de `A4` : elle dit quand
l'estimation a été rafraîchie, donc à quel point s'y fier. Sans elle, l'estimation
serait un chiffre sans garantie.

### Une requête par nature d'objet, pas une par objet

Ouvrir un schéma de deux cents tables ne doit pas produire deux cents allers-retours.
Chaque opération d'introspection interroge le catalogue **en une requête** pour tous
les objets demandés. C'est ce qui rend l'ouverture d'un arbre tenable, et ce qu'un
test doit constater — en comptant les requêtes, pas en supposant.

### Ce qu'on ne montre pas

Les schémas système (`pg_catalog`, `information_schema`, `pg_toast`) sont exclus par
défaut : `A4` montre « public » et les schémas de l'utilisateur. Les exclure est un
choix d'affichage, donc réversible, et il doit être **explicite** dans le code plutôt
qu'un effet de bord d'une clause `WHERE` illisible.

### Le DDL est lu, jamais reconstitué à la main

`A9` montre un `CREATE TABLE` complet. Le reconstruire par concaténation de chaînes
depuis le catalogue est un travail sans fin — types de tableaux, valeurs par défaut
avec appels de fonction, contraintes d'exclusion. Le DDL est donc assemblé à partir
de ce que le catalogue rend déjà formaté (`pg_get_indexdef`,
`pg_get_constraintdef`, `format_type`), et le résultat est **vérifié en le rejouant**
sur une base de test : un DDL qui ne se réexécute pas est faux, et c'est testable.

## Terminé quand

- Les schémas d'une base de test sont listés, sans les schémas système.
- Les objets d'un schéma sont listés par nature, avec les colonnes du tableau de
  `A4` — dont la date du dernier `ANALYZE`.
- Une table est décrite avec ses colonnes, types, nullabilité, défauts, clés et
  commentaires, vérifié contre une table créée exprès qui porte chacun de ces cas.
- Index, contraintes et triggers sont rendus, chacun couvert par un cas de test.
- Les relations entrantes et sortantes d'une table sont rendues.
- Le modèle distingue une **estimation** d'un **compte exact**, et l'arbre n'emploie
  que l'estimation.
- Ouvrir un schéma de cent tables ne fait **pas** cent requêtes, vérifié en les
  comptant.
- Le `CREATE TABLE` produit se **réexécute** sans erreur sur une base vierge, et la
  table obtenue a la même description que l'originale.
