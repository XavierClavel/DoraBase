# 06h — Le binaire du proxy, embarqué

## Objectif

Livrer `cloud-sql-proxy` **avec l'application**, pour qu'une connexion Cloud SQL marche sur
une machine où l'utilisateur n'a rien installé. C'est le renversement explicite d'un point
qu'`06g` avait mis hors périmètre.

## Dépend de

`06g` (`binaire::localiser`, et le fait que `ouvrir_avec` prenne un chemin en paramètre —
c'est cette couture qui rend ce scope petit).

## Périmètre

- Le binaire officiel embarqué dans le bundle, en **binaire externe** Tauri (« sidecar »).
- `binaire::localiser` cherche **l'embarqué d'abord**, et garde le `PATH` en repli.
- Une version **épinglée**, vérifiée par empreinte, récupérée par un script de build.
- La licence et l'attribution qui vont avec une redistribution.

## Hors périmètre

- **Les identifiants** — comment le proxy s'authentifie → `06i`. Ce scope ne fait que
  poser l'exécutable là où l'app le trouvera.
- **La mise à jour du proxy embarqué.** Épingler une version, c'est accepter de la relever
  à la main. Un canal de mise à jour séparé de celui de l'app est un scope à lui seul, et
  il n'a pas de demande.
- **Windows et Linux comme cibles de livraison.** Le bundle ne vise que macOS
  (`tauri.conf.json`, `minimumSystemVersion: 13.0`). Le mécanisme est par-triplet, donc il
  les accueillera sans refonte, mais rien n'est produit ni essayé pour eux.

  **Nuance apprise le 24 août 2026** (défaut n° 111) : les deux triplets **Linux** sont tout
  de même dans le verrou, et le script sait les télécharger. Non pour livrer, mais parce
  qu'un `externalBin` déclaré est exigé par *toute* compilation — voir « Le coût caché »
  ci-dessous. Sans eux, `cargo test` ne compile pas sur le runner Linux de la CI.
- **Le chemin du binaire en préférence** — toujours hors périmètre, pour la raison
  d'`06g` : ce serait une préférence de machine (`15`), pas un champ de connexion.

## Approche

### Un binaire externe Tauri, pas une ressource à la main

`bundle.externalBin` attend des fichiers nommés `cloud-sql-proxy-<triplet>` et n'en copie
**qu'un** dans le bundle, celui de la cible construite, en le renommant. C'est aussi le
seul chemin qui fait signer l'exécutable embarqué en même temps que l'app : un binaire
posé à la main dans `Resources` casse la notarisation, panne qui ne se voit qu'après
distribution — donc jamais en développement.

### L'embarqué d'abord, le `PATH` en repli

L'ordre n'est pas un détail : si le `PATH` gagnait, le comportement de l'app dépendrait de
ce que l'utilisateur a installé, et un proxy d'une autre version pourrait produire des
journaux que `sortie::est_pret` ne reconnaît pas. L'embarqué gagne donc, et le `PATH` ne
sert que là où il n'y a pas de bundle : `cargo test`, `cargo run`, et la machine de
développement. Ce repli est aussi ce qui garde les tests d'`06g` valables tels quels.

`localiser_dans` reste la fonction testable, `emplacements_par_defaut` gagne l'emplacement
du sidecar en tête de liste. Aucun autre appelant ne change.

### Le coût caché d'un `externalBin` : toute compilation en dépend

Déclarer un binaire externe ne concerne pas que le bundle. Le script de construction de Tauri
**vérifie sa présence à chaque compilation** : `cargo build`, `cargo test`, `cargo clippy` et
`pnpm domain:check` échouent tous sur « resource path … doesn't exist » bien avant qu'il soit
question de packaging.

Conséquence à assumer, et à ne pas découvrir : le téléchargement n'est pas une étape de
livraison mais une **dépendance de compilation**. Elle est câblée aux trois endroits qui
compilent — `beforeDevCommand`, `beforeBuildCommand`, et une étape explicite dans chacun des
deux jobs de CI, avant leurs commandes cargo. Y compris le job Linux, qui ne produit pourtant
aucun bundle.

C'est le prix du choix fait plus haut — un sidecar signé avec l'app plutôt qu'un fichier posé
à la main. Il est réel : un clone neuf ne compile pas sans un téléchargement de 40 Mo.

### Épinglé, vérifié, et pas dans Git

Le binaire pèse une trentaine de mégaoctets par architecture. Deux architectures commises,
puis une par relèvement de version, alourdiraient le dépôt de façon permanente et pour
rien : ce fichier est **reproductible depuis une URL et une empreinte**.

D'où un script de build qui télécharge la version épinglée, vérifie son SHA-256 et le
range dans `src-tauri/binaries/`, ignoré par Git. L'empreinte n'est pas une formalité :
c'est le seul contrôle qui distingue « le fichier attendu » de « ce que le réseau a bien
voulu rendre », et un exécutable embarqué signé avec l'app est exactement là où une
substitution coûterait le plus cher.

Le script échoue bruyamment si l'empreinte ne correspond pas, et ne laisse pas de fichier
partiel derrière lui — un demi-binaire nommé correctement serait pire que rien.

### La licence suit le binaire

Le proxy est sous Apache 2.0, donc redistribuable, à condition de joindre la licence et
les avis. Un `NOTICE` livré dans le bundle, et la version du proxy inscrite quelque part
de lisible — parce qu'un bogue du proxy se diagnostique par sa version, et qu'un binaire
embarqué ne se laisse pas interroger par `--version` depuis un terminal.

### Comment tester cela

- **Sans bundle** : l'ordre de recherche, avec des répertoires en paramètre — un faux
  sidecar et un faux `PATH`, et l'on vérifie lequel gagne. C'est le seul comportement
  neuf de ce scope côté code.
- **Le script** : empreinte correcte, empreinte fausse (échec, et rien laissé derrière).
- **Le bundle** : un `.app` construit, ouvert **depuis le Finder** sur une machine où
  `cloud-sql-proxy` n'est pas installé. C'est la seule vérification qui prouve le scope,
  et elle est manuelle — elle rejoint le § 0 de `REPRISE.md`, avec le point du `PATH`
  minimal qui n'a jamais été observé.

## Terminé quand

- Une connexion Cloud SQL s'ouvre depuis l'app packagée sur une machine sans
  `cloud-sql-proxy` installé, lancée depuis le Finder.
- Un `cloud-sql-proxy` présent dans le `PATH` **n'est pas** celui qui sert quand le
  sidecar existe, vérifié par un test sur l'ordre de recherche.
- Sans sidecar, tout `06g` passe encore — les tests existants ne sont pas retouchés.
- Le script refuse une empreinte qui ne correspond pas, et ne laisse aucun fichier.
- **Un clone neuf compile**, sur les deux systèmes de la CI, après la seule étape de
  téléchargement — vérifié par la CI elle-même, dont les deux jobs partent d'un dépôt vide.
- La licence Apache 2.0 et la version du proxy sont livrées dans le bundle.
- L'app packagée passe la notarisation avec le binaire embarqué — vérifié sur un vrai
  bundle, pas déduit.
- L'erreur « binaire introuvable » d'`06g` existe toujours et reste atteignable : elle est
  devenue improbable, pas impossible.
