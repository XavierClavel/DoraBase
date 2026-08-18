# 13a — `A8` : la console MongoDB

## Goal

Une console pour MongoDB : le même écran que `A7`, avec l'éditeur et le résultat qu'un document
demande.

## Dépend de

**`18g` — exécuter une opération de collection**, et `18b` pour s'y connecter. Cette spec ne peut pas
être livrée avant eux : sans adaptateur, la console n'aurait rien à interroger. C'est la première
spec d'écran du projet à dépendre d'une spec de moteur, et le dire évite de la commencer par la
coquille. Elle n'attend pas `18` entier — `18c` à `18f` servent les autres écrans.

Puis `12a` (les onglets de console), `12b` (l'éditeur).

## Scope

- Un onglet de console **mongo**, distinct d'une console SQL. Le mockup l'étiquette
  `console mongo · mongosh` ; `18g` n'accepte pas du JavaScript mais une opération de collection,
  donc **le libellé doit dire ce que la console sait faire** plutôt que de nommer un interpréteur
  qui n'est pas là.
- L'éditeur en dialecte JavaScript, non SQL — la coloration change de grammaire.
- `db.collection.aggregate([…])` exécuté par le moteur, jamais composé par l'écran.
- La toolbar : « Exécuter », « explain() », « Formater ».

## Not in this scope

- **Le résultat en JSON dépliable** → `13b`.
- **« Schéma déduit »** dans la sidebar → `13c`.
- **Les commandes d'écriture** (`insertOne`, `updateMany`) : la confirmation de `12c` porte sur du
  SQL, et sa reconnaissance syntaxique ne transpose pas. Sa propre spec.

## Approche

### Une console mongo n'est pas une console SQL déguisée

L'union `Onglet` de `12a` gagne une troisième forme, ou son `OngletConsole` un dialecte. Le second
est plus juste : ce qui change est la **grammaire** de l'éditeur et la forme du résultat, pas la
nature de l'onglet. Un onglet mongo se ferme, se réordonne et garde son texte exactement comme un
onglet SQL.

### Le dialecte de l'éditeur suit le moteur de la base

CodeMirror charge `@codemirror/lang-javascript` au lieu de `lang-sql`. Le thème de `12b` ne change
pas : les jetons `--syn-*` décrivent des mots-clés, des chaînes et des nombres, qui existent dans les
deux grammaires.

### `explain()` remplace « Expliquer », et ce n'est pas qu'un libellé

MongoDB n'a pas d'`EXPLAIN` séparé : le plan s'obtient en appelant `.explain()` sur le pipeline. La
question de `12e` — expliquer sans exécuter — a sa réponse en `18g` : à la verbosité `queryPlanner`,
`explain()` n'exécute pas. L'écran affiche donc des coûts **estimés**, comme en `12e`.

## Done when

- [ ] `18b` et `18g` sont livrés. **Rien de cette spec ne commence avant.**
- [ ] Une console mongo et une console SQL cohabitent dans la même bande.
- [ ] L'éditeur colore du JavaScript, et le thème est celui du handoff.
- [ ] Le pipeline exécuté est celui qui est affiché.
