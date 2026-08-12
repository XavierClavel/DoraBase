# 12d — `A7` : l'autocomplétion

## Goal

Proposer les tables et colonnes de la base pendant la frappe, avec la liste du mockup — nom, type,
et le rappel « ↑↓ naviguer · ⇥ insérer ».

## Scope

- Les suggestions issues du **catalogue déjà introspecté**, pas d'une nouvelle requête.
- Trois natures : tables du schéma courant, colonnes d'une table nommée par un alias, mots-clés SQL.
- La navigation `↑↓`, l'insertion `⇥`, l'abandon `esc`.
- Le pied de liste qui dit d'où vient la suggestion — `users.country` dans le mockup.

## Not in this scope

- **Résoudre les alias par analyse syntaxique complète.** Voir § Approche : ce scope lit `from
  <table> <alias>` et `join <table> <alias>`, ce qui couvre le mockup et l'usage courant. Une
  sous-requête corrélée n'est pas résolue, et c'est dit.
- **Les fonctions et opérateurs du serveur.** `agg` apparaît dans le mockup ; les fonctions
  utilisateur demandent une introspection que `06c` ne fait pas.
- **L'autocomplétion inter-schémas.** Le schéma courant suffit à ce que le handoff montre.

## Approche

### Les suggestions viennent de ce qui est déjà chargé

L'arbre de `09d` a déjà les tables du schéma, et `06c` rend les colonnes d'une table. Interroger le
serveur à chaque frappe ajouterait une latence à l'endroit le plus sensible de l'écran — et
DoraBase a déjà ces données en mémoire.

Conséquence honnête : une table créée par un tiers depuis l'ouverture n'est pas proposée. « Rafraîchir »
la recharge, et c'est un compromis que la latence justifie.

### Les alias sont résolus par lecture, pas par analyse

Reconnaître `from orders o` puis proposer les colonnes d'`orders` après `o.` demande de trouver la
table associée à l'alias. Un analyseur SQL complet est hors de proportion ; une lecture des clauses
`from` et `join` du texte courant couvre ce que le mockup montre et l'écrasante majorité des
requêtes qu'on écrit à la main.

**La limite est nommée dans le code et ici** : sous-requêtes corrélées, CTE, alias définis après le
point d'usage. Dans ces cas, l'autocomplétion propose les tables du schéma plutôt que rien.

### Une suggestion fausse est pire qu'aucune suggestion

Proposer une colonne qui n'existe pas produit une requête en erreur que l'utilisateur croira
correcte. En cas de doute — alias inconnu, table non chargée — la liste **ne devine pas** : elle
propose les mots-clés et les tables, qui sont sûrs.

## Done when

- [ ] Après `o.` où `o` est l'alias d'`orders`, les colonnes d'`orders` sont proposées avec leur type.
- [ ] Le pied de liste dit d'où vient la suggestion.
- [ ] `↑↓` navigue, `⇥` insère, `esc` referme sans rien insérer.
- [ ] Un alias inconnu ne propose **aucune** colonne inventée.
- [ ] Aucune requête n'est envoyée au serveur pendant la frappe — vérifié.
