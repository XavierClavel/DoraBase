# 06j — Une seule voie d'authentification

## Objectif

Retirer le champ « Compte de service » de `A2`, et avec lui le `credentialsFilePath` du
modèle. Une connexion Cloud SQL ne décrit plus **avec quoi** s'authentifier : c'est la
machine qui le dit.

## Dépend de

`06i` (les identifiants par défaut de l'application, et le diagnostic de leur absence),
`08k` (le champ retiré), `05d` (le type persisté et sa chaîne de migration).

## Périmètre

- Le champ « Compte de service » disparaît de `A2`, avec son bouton « Parcourir… » et son
  sélecteur de fichier.
- `credentials_file_path` disparaît de `ProxyCloudSql`, du brouillon, et de la projection
  TypeScript.
- `06g` ne passe plus `--credentials-file`.
- Un cran de migration **v3 → v4** retire la clé des fichiers existants.

## Hors périmètre

- **L'authentification IAM de base de données** (`--auto-iam-authn`), qui rendrait le champ
  « Mot de passe » inutile en faisant du jeton IAM le mot de passe. C'est le sujet voisin,
  et il **ajoute** un champ là où ce scope en retire un. Toujours hors périmètre, comme
  depuis `06g`.
- **Le mot de passe.** Il reste nécessaire : le proxy authentifie auprès de l'**instance**,
  pas auprès de PostgreSQL. Une fois le tunnel ouvert, c'est une connexion ordinaire sur
  `127.0.0.1`, avec son rôle et son mot de passe.
- **Le port local.** Il n'a jamais été saisi : `A2` l'affiche en `<output>`, et `06g` rend
  celui que le proxy annonce. Rien à retirer.

## Approche

### Pourquoi retirer, et pas seulement masquer

Deux voies d'authentification exigent de choisir laquelle explique un échec. `06i` a écrit
ce diagnostic, et le champ le compliquait sans rien apporter : sur les trois sources
possibles, celle qui se saisissait était la moins employée, et la seule à devoir être
**persistée** — donc migrée, projetée en TypeScript, traduite entre `''` et `null`.

Un champ qui coûte une valeur au modèle, un cran de migration, une conversion dans les deux
sens et une branche de diagnostic doit gagner sa place. Celui-ci ne la gagnait pas.

### La voie n'est pas fermée pour autant

`GOOGLE_APPLICATION_CREDENTIALS` reste lue par le proxy, sans qu'on la lui passe. Une
machine sans `gcloud` — un poste verrouillé, un serveur de rebond — garde donc un chemin, et
il ne coûte ni champ, ni valeur persistée, ni ligne de migration. `06i` la compte déjà comme
une source, et son message la nomme : c'est ce qui fait la différence entre « retirer un
champ » et « retirer une possibilité ».

### Le cran v3 → v4 existe pour la sauvegarde, pas pour la lecture

`serde` ignore les clés inconnues : sans cran, un fichier v3 se lirait tel quel et la clé
disparaîtrait à la première écriture. Silencieusement, et sans que l'utilisateur ait où
retrouver le chemin qu'il avait désigné.

Le cran ne sert donc pas à savoir lire — il sert à ce que `migrer` **prenne la sauvegarde**
avant que la clé s'en aille, et à ce que la version du fichier dise la vérité sur le modèle
qu'il porte. C'est la même raison qui avait fait de `05d` un cran plutôt qu'un `#[serde(alias)]`.

Écrit comme `hisser_les_tunnels_vers_le_proxy` : sur du `serde_json::Value`, en descendant
l'arbre, sans connaître ce qui entoure un proxy. Et **borné aux objets étiquetés
`cloud-sql`** — retirer la clé partout où ce nom apparaît marcherait aujourd'hui et
deviendrait faux le jour où un autre objet la porte.

### Ce que deux tests de `06g` deviennent

`06g` vérifiait que `--credentials-file` était passé **et seulement quand il était donné**,
et une sentinelle vérifiait que le contenu du fichier n'apparaissait dans aucun message. Les
deux portaient sur une option qui n'existe plus.

Un seul test les remplace, et déplace la garantie : la ligne de commande du proxy est
**énumérée en entier** — instance, `--port`, `--address`, rien d'autre. Plutôt que de
vérifier qu'un secret ne fuit pas d'une ligne qui le porte, on vérifie que la ligne ne porte
rien dont un secret puisse fuir. Énumérer plutôt que nier est ce qui attraperait une option
d'authentification **future** — `--token`, `--json-credentials`, `-g` —, qu'une assertion
négative laisserait passer.

La sentinelle qui compte désormais est celle d'`06i`, sur le fichier d'identifiants par
défaut : c'est là que le secret est.

### Le libellé qui reste

Le champ disparaît, la phrase reste — « identifiants par défaut de l'application, installés
par `gcloud auth application-default login` » — mais elle n'est plus liée par
`aria-describedby` : ce lien existait pour qu'un champ **vide** ne se lise pas comme un
champ oublié, et sans champ cette raison tombe. Un texte informatif dans le flux est annoncé
à sa place.

## Terminé quand

- Le visage Cloud SQL de `A2` n'a qu'un champ, « Instance », et une phrase d'authentification.
- `ProxyCloudSql` n'a qu'un champ, vérifié en comptant les clés du JSON produit — un test qui
  n'observerait qu'une absence laisserait passer un champ ajouté ailleurs.
- Un fichier v3 portant un `credentialsFilePath` se lit, perd la clé, **garde le reste** —
  port local et instance — et laisse une sauvegarde qui contient encore le chemin.
- Le cran ne touche pas un `credentialsFilePath` porté par autre chose qu'un proxy Cloud SQL.
- Les deux crans du proxy se composent : un fichier v2 traverse le hissement puis le retrait.
- La ligne de commande du proxy est énumérée en entier, et ne porte aucune option
  d'identifiants.
- Le message d'absence d'identifiants nomme `GOOGLE_APPLICATION_CREDENTIALS`, et ne renvoie
  plus vers un champ qui n'existe pas.
