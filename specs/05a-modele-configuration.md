# 05a — Modèle de configuration

## Objectif

Définir les types et les invariants de ce que l'utilisateur déclare : projets, bases,
et leurs déclinaisons par environnement. C'est la dépendance commune de tous les
écrans restants — la définir une fois évite que chaque écran invente sa forme.

## Dépend de

`01` (socle). Rien d'autre : ce scope n'a ni I/O, ni rendu.

## Périmètre

- Les types du modèle : `Project`, `Database`, `EnvironmentVariant`, `Environment`,
  `Engine`.
- **Les champs sont ceux que l'écran `A2` fait saisir** — voir
  `design/handoff/README.md` § A2 pour l'inventaire, que cette spec ne recopie pas
  (convention de `specs/README.md`). Répartition : le nom de la base et son moteur
  appartiennent à `Database` ; hôte, port, base par défaut, utilisateur, mode SSL,
  les deux bascules et toute la configuration de tunnel appartiennent à
  `EnvironmentVariant`, puisque le handoff pose « host/port/creds différents par
  env ». Seul le mot de passe n'est pas dans le modèle → `05c`.
- Les invariants, exprimés dans le code plutôt qu'en commentaire : une base
  appartient à un projet et existe en **1..n** variantes d'environnement ;
  l'environnement actif est une propriété du **projet**, pas de la base.
- Les fonctions pures qui opèrent dessus : résoudre la variante active d'une base,
  lister les bases d'un projet pour l'environnement courant, valider qu'un projet
  est cohérent.
- Le partage des types entre Rust et TypeScript, et ce qui garantit qu'ils ne
  divergent pas.

## Hors périmètre

- **Toute écriture ou lecture sur disque** → `05b`. Ce scope produit des types et
  des fonctions pures, testables sans système de fichiers.
- **Les identifiants** — mot de passe, clé privée SSH. Le modèle porte une
  *référence* vers un secret, jamais sa valeur. → `05c`.
- **La structure introspectée** — schéma, table, vue, fonction, index, comptages,
  tailles. Elle ne vient pas de l'utilisateur mais du catalogue de la base, et sa
  forme est dictée par chaque moteur. → `06`.
- **La connexion elle-même** : ouvrir un socket, tester, tunneler. → `06`.
- **Tout écran**. `08` saisira ces objets, `09` les affichera.
- **La palette `⌘K`, l'historique, les favoris de requête** : ils référenceront ce
  modèle sans en faire partie.

## Approche

### Ce que le handoff impose

`design/handoff/README.md` § « Modèle de données de l'UI » pose la hiérarchie et
trois règles qui ont valeur d'invariant :

```
Projet ── environnement actif : dev | staging | prod   ← global au projet
   └── Base (moteur PostgreSQL, MySQL, SQLite, MongoDB, Redis, Snowflake, BigQuery)
         └── variante par environnement (hôte, port, identifiants distincts)
```

- La sidebar liste des **projets**, pas des connexions.
- Une base existe en **1..n** environnements — jamais zéro.
- Basculer l'environnement recharge l'arbre et les onglets **sur la même cible
  logique**, autre serveur. C'est ce qui interdit de modéliser l'environnement
  comme une propriété de la base.

### Le typage porte les invariants

« 1..n variantes » n'est pas un commentaire mais un type : une liste non vide, avec
un constructeur qui refuse la liste vide. De même, l'environnement actif vit sur le
projet ; aucune signature ne permet de lire une variante sans dire *laquelle*.

L'intérêt est concret : `09` devra afficher un arbre où basculer l'environnement
change les serveurs sans changer l'arborescence. Si le type autorise une base sans
variante pour l'environnement courant, cet écran devra traiter un cas que le modèle
aurait dû rendre impossible.

### Où vivent les types, et pourquoi les deux côtés

Le modèle est défini **en Rust** et projeté en TypeScript. Raison : `05b` (écriture
atomique) et `05c` (Trousseau) sont nécessairement côté Rust, et un modèle défini
côté webview obligerait à le redéclarer là où il est réellement manipulé.

La projection est **générée**, jamais recopiée — même principe que `tokens.css` et
`sprite.svg` en `02`, avec un garde-fou en CI qui régénère et exige un diff vide.
Le choix de l'outil (`ts-rs`, `specta`, ou un générateur maison) se fait à
l'implémentation, sur un critère simple : qu'un champ ajouté en Rust et non
régénéré fasse **échouer la CI**, pas dériver en silence.

### Une ambiguïté du handoff à ne pas trancher ici

« Ouvrir en lecture seule » apparaît **trois fois** dans le handoff, et les trois ne
disent pas la même chose :

| Où | Ce que c'est |
| --- | --- |
| `A2`, bascule par base (l. 117) | un réglage de configuration, donc du modèle |
| `A10`, garde-fou global (l. 287) | « ouvrir les bases *prod* en lecture seule », une préférence |
| § Interactions (l. 335) | « passer en prod réapplique les garde-fous » |

Le modèle porte donc **le réglage saisi**, celui de `A2`, et rien de plus. L'état
effectif d'une base ouverte est une composition de ce réglage, de la préférence
globale et de l'environnement courant — donc une règle, pas une donnée.

Ce scope ne l'écrit pas : la préférence globale n'existe pas avant `15`, et c'est
`11` (édition inline) qui aura à faire respecter le résultat. La consigner ici évite
qu'elle soit découverte deux fois, et interdit surtout de dériver le réglage saisi
depuis l'environnement — ce serait perdre ce que l'utilisateur a demandé.

### Ce que ce scope ne décide pas

La forme de l'état d'arbre de `09` reste ouverte. Ce modèle décrit la
*configuration*, pas la vue : quels nœuds sont ouverts, ce qui est sélectionné, et
comment l'arbre est aplati pour la `Sidebar` de `04` appartiennent à l'écran.

**L'environnement actif d'un projet est-il persisté ?** Question ouverte, tranchée
en `05b` : elle porte sur le cycle de vie de la donnée, pas sur sa forme.

## Terminé quand

- Les types existent en Rust, avec les invariants portés par le typage : une base
  sans variante d'environnement ne se construit pas, et lire une variante exige de
  nommer l'environnement.
- Les fonctions pures — variante active, bases d'un projet pour un environnement,
  validation d'un projet — sont couvertes par des tests, y compris les cas
  d'échec (liste vide refusée, environnement absent).
- La projection TypeScript est générée et un `check` en CI échoue si elle a dérivé
  de la source Rust — vérifié en introduisant délibérément la divergence.
- Aucun secret n'apparaît dans le modèle : un `rg` sur les champs ne trouve que des
  références, jamais un mot de passe ni un chemin de clé lu.
- Les sept moteurs du handoff sont représentés, et un moteur inconnu ne compile pas.
