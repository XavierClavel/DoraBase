# 18e — La lecture paginée de documents

## Goal

Remplir la grille de `A5` avec les documents d'une collection : une **fenêtre**, filtrée et triée.

## Dépend de

`18a`, `18d` (les colonnes, qui décident des cellules), `06d` (dont ce scope est le pendant).

## Scope

- `rows()` : `find` avec saut et limite, tri, filtres.
- La traduction des `Filter` de `06a` en critères MongoDB.
- Un document aplati en ligne de grille, champ par champ.
- Un champ absent, distinct d'un champ nul.

## Not in this scope

- **L'écriture** → `18f`. **La console** → `18g`.
- **Le total exact.** `RowWindow` le rend optionnel depuis `06a`, et `A5` affiche le compte de la
  fenêtre.

## Approche

### Un document absent de champ n'est pas un document à champ nul

C'est la différence que MongoDB a et que SQL n'a pas, et elle est **réelle** : `{a: 1}` et
`{a: 1, b: null}` ne répondent pas pareil à une requête. `Value::Null` ne sait dire qu'un des deux.

Le champ manquant est donc rendu `Null`, et **la fréquence de `18d` est ce qui permet de le savoir** :
un champ à 60 % a 40 % de cellules qui sont des absences, pas des nuls. La grille ne les distingue
pas ; le tableau de `A9` porte la fréquence, qui le dit. Une variante `Absent` dans `Value` aurait
été plus juste et aurait obligé sept écrans à traiter un troisième vide — l'arbitrage est celui de
`18a`, et la limite est nommée ici plutôt que découverte.

### Le saut coûte cher, et c'est déjà connu

`skip` parcourt et jette. `06d` a rencontré la même limite en SQL avec `OFFSET`, et l'a acceptée
parce que `A5` propose des pages, pas un défilement infini. La même décision tient, avec la même
réserve : au-delà de quelques milliers de documents, la page suivante ralentit. À **mesurer** sur la
collection de test volumineuse, comme `06d` l'a fait sur `grande`.

### Les filtres se traduisent, ils ne se composent pas côté écran

`Filter` porte une colonne, un opérateur et une valeur (`06a`). L'adaptateur les rend en critères :
`eq` → `{champ: v}`, `ne` → `$ne`, `in` → `$in`, `matches` → `$regex`, `isNull` → `{champ: null}`.

**`matches` demande un échappement.** Une valeur tapée par l'utilisateur devient une expression
rationnelle : les caractères de la syntaxe y prennent un sens qu'il n'a pas voulu, et un motif
pathologique peut coûter un temps déraisonnable au serveur. Le filtre est donc échappé, et cherche
une sous-chaîne — ce que `06d` fait déjà avec `ILIKE` et son `%`.

### Un `_id` non textuel se lit quand même

Une clé peut être un `ObjectId`, un entier, une chaîne, ou un document composite. La grille affiche
le premier champ comme les autres ; c'est `18f` qui aura besoin de le renvoyer **tel quel** pour
désigner un document, et c'est là que la question se tranche.

## Done when

- [ ] La grille de `A5` affiche les documents d'une collection réelle.
- [ ] Un document dépourvu d'un champ affiche une cellule vide, pas une erreur.
- [ ] Les cinq opérateurs de filtre répondent, et `matches` est échappé — vérifié avec une valeur
      contenant `.*`.
- [ ] Le tri répond sur un champ absent de certains documents.
- [ ] Le coût d'une page lointaine est mesuré sur une collection volumineuse, et dit.
