# 17a — SQLite : un fichier, pas un serveur

## Goal

Ouvrir une base SQLite. C'est le seul moteur du projet qui n'a ni hôte, ni port, ni utilisateur, ni
mot de passe — et cette spec existe pour trancher ce que la déclaration de `05a` devient.

## Dépend de

`06a`, `05a`.

## Scope

- Ce que `EnvironmentVariant` porte pour SQLite, et ce qu'il laisse vide.
- L'ouverture d'un fichier, et le refus d'en créer un.
- `probe()` : la version de la bibliothèque, et la taille du fichier.
- Les échecs propres au fichier : absent, illisible, verrouillé, pas une base SQLite.

## Not in this scope

- **L'introspection, la lecture, l'écriture** → `17b`.
- **Le sélecteur de fichier de `A2`.** `08c` a déjà branché « Parcourir… » pour la clé SSH ; le
  rebrancher sur le champ « chemin » est un travail d'écran, à faire dans `08` quand ce moteur existe.
- **Le tunnel SSH.** Un fichier local n'a rien à traverser. Une variante SQLite qui déclarerait un
  tunnel est une déclaration incohérente, à refuser.

## Approche

### Le chemin va dans `default_database`, et rien n'est ajouté au modèle

`EnvironmentVariant` a cinq champs qui ne veulent rien dire pour SQLite : `host`, `port`, `username`,
`password`, `ssl_mode`. Trois options se présentaient :

1. **Ajouter un champ `path`** — il resterait vide pour six moteurs sur sept, et `A2` devrait
   décider lequel afficher.
2. **Faire de `EnvironmentVariant` une union** — une migration du fichier de configuration, et un
   `match` de plus dans chaque écran qui lit une variante.
3. **Employer `default_database` comme chemin.** C'est déjà « la base à ouvrir » ; pour SQLite, la
   base *est* un fichier. Aucun champ nouveau, aucune migration.

**La troisième est retenue**, et le commentaire du modèle doit le dire — sans quoi on lira
`default_database: "/Users/…/base.db"` comme une anomalie. Les cinq champs inutiles restent vides, et
`A2` les masque pour ce moteur : les afficher demanderait un port à qui n'en a pas.

### DoraBase n'écrit pas un fichier qui n'existe pas

`sqlite3_open` **crée** le fichier absent, silencieusement. C'est le comportement que veut un
programme qui possède sa base ; c'est le contraire de ce que veut un explorateur. Un chemin mal tapé
donnerait une base vide, l'arbre l'afficherait sans erreur, et l'utilisateur chercherait ses tables.

L'ouverture est donc en **lecture-écriture sans création**, et un fichier absent est une erreur qui
le dit. C'est la même famille de décision que le refus de `05b` d'écraser un fichier illisible.

### « Pas une base SQLite » se distingue de « illisible »

Un fichier qui existe mais n'a pas l'en-tête SQLite — un CSV, une archive, un fichier tronqué —
produit une erreur distincte d'un problème de permission. Les confondre enverrait chercher un droit
d'accès là où le chemin désigne autre chose. Quatre cas, comme en `06b`.

### Le verrou est une erreur normale, pas une panne

Un autre programme qui écrit détient le verrou : SQLite rend `SQLITE_BUSY`. Le message doit dire
**quoi faire** — attendre, ou fermer l'autre programme — et non « erreur de base de données ». Le
mode WAL réduit le cas sans le supprimer.

## Done when

- [ ] Une base SQLite s'ouvre depuis un chemin, et `probe()` rend la version et la taille.
- [ ] Un fichier **absent** est une erreur, et **aucun fichier n'est créé** — vérifié en listant le
      répertoire après l'échec.
- [ ] Un fichier qui n'est pas une base SQLite le dit, distinctement d'un problème de permission.
- [ ] Une variante SQLite déclarant un tunnel est refusée.
- [ ] Le commentaire de `default_database` explique son double rôle.
