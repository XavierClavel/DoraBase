# 05c — Stockage des identifiants

## Objectif

Ranger les secrets hors du fichier de configuration, derrière une interface unique,
avec le Trousseau en release signée et un fichier chiffré en développement.

**Un seul secret existe dans le handoff** : le mot de passe de base de données, saisi
en `A2`. L'interface est générique, mais rien n'est construit pour un second type —
voir « Hors périmètre ».

## Dépend de

`05a` (le modèle porte les références de secret), `05b` (la configuration, qui n'en
contient aucun).

## Périmètre

- L'interface de stockage : ranger, relire, supprimer un secret désigné par une
  référence stable.
- L'implémentation **Trousseau macOS**, pour les builds signés.
- L'implémentation **fichier chiffré local**, pour le développement.
- Le choix entre les deux **au démarrage**, selon la signature effective du bundle.
- Ce que l'UI affiche honnêtement selon le mécanisme réellement actif.

## Hors périmètre

- **Windows et Linux.** L'interface est là pour eux, ses implémentations viendront
  avec la cible. Le seul engagement de ce scope est qu'aucune API propre à macOS ne
  fuit hors de son implémentation.
- **La saisie du secret** — champ mot de passe, œil, bouton « Parcourir… » de la clé
  privée. → `08`.
- **L'usage du secret** pour ouvrir une connexion → `06`.
- **La gestion de clés SSH** : génération, agent, `ssh-add`. Le handoff ne prévoit
  qu'un **chemin** vers une clé existante, qui est de la configuration (`05a`), pas
  un secret.
- **La phrase de passe d'une clé SSH chiffrée.** Le handoff n'en montre aucun champ —
  vérifié, zéro occurrence dans le bundle. Une clé chiffrée est pourtant courante, et
  `06` s'y heurtera peut-être en ouvrant un tunnel ; ce sera alors un second secret,
  rangé par la même interface sans la modifier. **Ne rien construire pour l'instant** :
  ce serait inventer un champ que le design ne demande pas, l'erreur que ce projet
  évite depuis `02`.
- **Le badge « Trousseau » de `A2`** : son rendu appartient à `08`. Ce scope fournit
  l'information qu'il affiche.
- **Toute rotation, expiration ou politique de mot de passe** — hors handoff.

## Approche

### Pourquoi une interface plutôt que le Trousseau directement

Décision déjà prise, consignée dans `specs/README.md` § « À trancher » : les ACL du
Trousseau macOS sont liées à la **signature de code**, et le bundle est signé en
ad-hoc — signature qui change à chaque reconstruction. Un outil qui rangerait ses
secrets dans le Trousseau redemanderait l'autorisation à chaque build, et les
entrées d'un build seraient illisibles par le suivant.

L'abstraction est de toute façon nécessaire, Windows et Linux n'ayant pas de
Trousseau et étant des cibles gardées ouvertes. Elle découple donc ce scope de
l'achat d'un Developer ID, **sans le bloquer**.

### Détection au démarrage, pas configuration

Le mécanisme actif se **déduit** de la signature effective du bundle, il ne se règle
pas. Un réglage exposé serait un moyen de dégrader silencieusement la sécurité, et
une question que l'utilisateur n'a pas les moyens de trancher.

### Le fichier chiffré de développement

Il existe pour que le développement soit possible, pas pour protéger des secrets de
production. Deux conséquences assumées :

- **Sa clé est dérivée localement** et vit sur la même machine que le fichier. Un
  attaquant ayant accès à la session de l'utilisateur peut donc le déchiffrer. C'est
  le même niveau de protection que le fichier de configuration lui-même, et c'est
  acceptable pour du développement — pas pour une release, d'où la détection.
- **L'UI doit le dire.** Le badge vert « Trousseau » de `A2` serait un mensonge dans
  ce mode. Ce scope expose donc au front le mécanisme réellement actif, et `08`
  l'affiche honnêtement.

Un chiffrement authentifié — qui détecte l'altération et ne se contente pas de
brouiller — plutôt qu'un simple chiffrement : un fichier modifié doit échouer à la
lecture, pas rendre des octets faux.

### Ce qui ne doit jamais arriver

Trois propriétés à vérifier, pas à supposer :

1. **Aucun secret dans les journaux.** `tauri-plugin-log` est actif en développement
   (`01`) ; un secret dans une trace de débogage y resterait sur le disque.
2. **Aucun secret dans un message d'erreur** remonté à la webview. Une erreur de
   connexion cite l'hôte et le port, jamais le mot de passe employé.
3. **Aucun secret en clair dans le fichier de configuration**, déjà exigé par `05b`
   et revérifié ici depuis l'autre côté.

### Une remarque de périmètre, à ne pas confondre avec un manque

Ce scope ne chiffre pas la configuration elle-même. Les hôtes, ports et noms
d'utilisateur restent en clair — comme dans la plupart des clients de bases. Le
choix est délibéré : le secret est ce qui donne l'accès, et confondre « sensible »
et « secret » conduirait à chiffrer un fichier que l'utilisateur a de bonnes raisons
de pouvoir relire et versionner.

## Terminé quand

- L'interface est définie, avec deux implémentations, et le code appelant ignore
  laquelle est active.
- Un aller-retour ranger / relire / supprimer est couvert pour chaque
  implémentation.
- Le mécanisme est choisi au démarrage d'après la signature effective, vérifié dans
  les deux cas — signé et ad-hoc.
- Le fichier chiffré **refuse un contenu altéré** au lieu de rendre des octets faux,
  vérifié en modifiant délibérément un octet.
- **Aucun secret dans les journaux** : une session complète — écriture, lecture,
  échec de connexion — est passée au `grep` sur la sortie de journalisation.
- **Aucun secret dans un message d'erreur** remonté à la webview, vérifié sur un
  échec d'authentification réel.
- Aucune API propre à macOS hors de son implémentation : un `rg` le confirme.
- Le front peut afficher le mécanisme réellement actif, et le sait avant de rendre
  le badge de `A2`.
