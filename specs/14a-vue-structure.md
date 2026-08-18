# 14a — `A9` : la vue Structure et le tableau des colonnes

## Goal

Faire répondre le segmenté « Données / Structure », et montrer les colonnes d'une table avec ce que
l'introspection en sait : type, nullité, défaut, clé, commentaire.

## Dépend de

`06c` (l'introspection, qui rend déjà tout cela), `09a` (`DataTable`), `10b` (la bande d'onglets et son
segmenté).

## Scope

- Le segmenté « Données / Structure », qui bascule au lieu d'être désactivé.
- Les trois comptes de l'en-tête : `18 colonnes · 4 index · 3 contraintes`.
- Le tableau des colonnes : six colonnes du mockup, et son filtre.
- La clé rendue lisible : `→ users.id` pour une étrangère, `identity` pour une primaire.

## Not in this scope

- **Index, contraintes et déclencheurs** → `14b`. Leurs comptes s'affichent ici, leurs tableaux non.
- **Le DDL** → `14c`.
- **Modifier la structure.** `A9` montre ; `ALTER TABLE` est un autre écran, et la console de `12c`
  l'accepte déjà avec sa confirmation.

## Approche

### Rien à demander de plus au moteur

`TableDetail` (`06c`) porte déjà colonnes, index, contraintes, déclencheurs et DDL. `A9` est une vue
sur une lecture que l'écran fait **déjà** pour le panneau droit de `09f` et la sidebar de `10c` : la
même donnée, un troisième lecteur. Aucune commande nouvelle, ce qui est rare pour un écran entier.

### Le segmenté cesse de mentir

`10b` l'affichait désactivé avec « Viendra avec A9 » — la règle de `09f`. Il bascule maintenant, et
c'est le dernier de ces boutons annoncés que le projet devait honorer.

### La clé se lit, elle ne se décode pas

`ColumnInfo.key` vaut `primary`, `foreign` ou rien, et une clé étrangère ne dit pas vers **quoi** elle
pointe. C'est `TableDetail.relations` qui le sait. Le tableau les rapproche : `→ users.id` demande de
croiser deux champs, ce que l'utilisateur ne devrait pas faire de tête.

Une contrainte `check` se rend « check ∈ 5 valeurs » plutôt que par son expression : le mockup le
montre ainsi, et une expression `check` tient rarement dans une cellule.

## Écarts au mockup, assumés

- **La vue active porte une pastille sombre.** `A5` affiche « Données » et « Structure » du même
  gris, ce qui tenait tant que la paire ne basculait pas. Maintenant qu'elle répond, deux libellés
  identiques ne diraient plus laquelle des deux vues est à l'écran. `A9` montre la pastille ; c'est
  ce sens qui gagne.
- **Le tableau des colonnes défile.** Le mockup pose `overflow: hidden` parce qu'il est figé à
  quatorze lignes. Une table de dix-huit colonnes pousserait les panneaux d'index hors de la
  fenêtre.
- **Une déduction se distingue d'un commentaire.** Le mockup met « → users.id » et « TTC, devise
  ci-contre » dans la même colonne, du même style. Le premier est déduit par DoraBase, le second
  écrit par quelqu'un ; les rendre identiques ferait passer l'un pour l'autre.
- **L'unicité d'un index se lit.** Le mockup ne la code que par la teinte d'une icône, or elle
  empêche des écritures : le résumé la dit — `unique btree(id)`.
- **Deux mentions du pied manquent** : `owner:` n'est pas dans `TableDetail`, et « DDL lue le … »
  demanderait d'horodater l'introspection. Dites absentes plutôt qu'inventées.

## Done when

- [ ] « Structure » bascule, et « Données » ramène la grille.
- [ ] Les trois comptes viennent de l'introspection, pas d'un recalcul.
- [ ] Une clé étrangère affiche sa cible ; une primaire, son mode.
- [ ] Le filtre porte sur le nom **et** le type — on cherche « les colonnes en `timestamptz` ».
- [ ] Aucune lecture supplémentaire n'est envoyée au moteur — vérifié.
- [ ] Comparaison visuelle contre `A9`.
