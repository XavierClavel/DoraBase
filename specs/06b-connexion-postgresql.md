# 06b — Connexion PostgreSQL et test de connexion

## Objectif

Ouvrir une connexion PostgreSQL depuis la configuration de `05a` et le secret de
`05c`, et répondre au bouton « Tester la connexion » de `A2`. Premier contact réel
avec une base : c'est ici que s'installe aussi l'infrastructure qui rend les tests
possibles.

## Dépend de

`06a` (le contrat), `05a` (où se connecter), `05c` (avec quel secret).

## Périmètre

- L'adaptateur PostgreSQL, réduit à l'ouverture et la fermeture d'une connexion.
- Les **six modes SSL** de `05a`, et ce qu'ils changent réellement.
- Le **test de connexion** de `A2` : latence et version du serveur.
- La traduction des échecs en erreurs de `06a`, avec leur `SQLSTATE`.
- **L'infrastructure de test contre une vraie base**, et le job de CI qui la fournit.

## Hors périmètre

- **L'introspection** → `06c`. **La lecture de lignes** → `06d`. **Le tunnel SSH** →
  `06e` ; une variante d'environnement qui en déclare un est refusée ici, avec une
  erreur explicite, plutôt que connectée en ignorant le tunnel — se connecter en
  direct alors que l'utilisateur a demandé un bastion serait contourner sa consigne
  de sécurité.
- **Le regroupement de connexions.** Une connexion par variante d'environnement
  suffit aux écrans du handoff. À reconsidérer si `12` (console) exige des requêtes
  concurrentes, pas avant.
- **La modale `A2` et la sous-modale `A3`** → `08`. Ce scope rend un résultat de
  test, il n'affiche rien.
- **La reconnexion automatique.** `05a` porte le réglage « se reconnecter au
  démarrage » ; l'appliquer demande de savoir quels onglets rouvrir, ce qui
  appartient à `09`.
- **Les six autres moteurs** → `16`→`21`.

## Approche

### Ce que le test de connexion doit rendre

`A2` affiche « Connecté en 240 ms · PostgreSQL 16.2 » : une **durée** et une
**version**. `A3` affiche, en cas d'échec, des lignes de journal techniques. Le
résultat du test est donc soit la paire durée-version, soit une erreur de `06a` —
et rien d'autre. En particulier, pas de booléen : « ça marche » sans la latence ni
la version ne remplirait pas l'écran.

La durée mesurée est celle de la **connexion établie et interrogeable**, pas du seul
socket : elle inclut donc l'aller-retour qui lit la version. C'est ce que
l'utilisateur perçoit, et ce que le nombre affiché doit signifier.

### Les modes SSL ne sont pas décoratifs

`05a` porte six modes (`disable` à `verify-full`). Deux d'entre eux — `verify-ca` et
`verify-full` — **vérifient** le certificat du serveur ; les autres non. Confondre
`require` et `verify-full` est l'erreur classique : `require` chiffre sans
authentifier, donc n'empêche pas un intermédiaire. Le mode demandé doit être
appliqué tel quel, et un test doit distinguer au moins un mode vérifiant d'un mode
non vérifiant — sans quoi rien ne prouve que le réglage a un effet.

### L'infrastructure de test, et pourquoi elle change la CI

Un adaptateur non testé contre une vraie base ne vaut rien : les catalogues, les
codes d'erreur et les modes SSL ne se devinent pas. Or la CI tourne sur
`macos-latest`, où les *service containers* de GitHub Actions ne sont pas
disponibles.

**Décision : un second job `ubuntu-latest`** avec un service PostgreSQL, qui ne lance
que les tests moteur. Le job macOS garde le build du `.app` et les tests d'interface.
Les deux tournent en parallèle, donc la CI ne rallonge pas.

Les tests exigeant une base sont derrière une **feature cargo** (`db-tests`) plutôt
que `#[ignore]` : une feature les rend *absents* du job macOS au lieu de silencieux,
et le compte de tests ignorés ne devient pas une poubelle où se cachent des tests
oubliés — c'est déjà le cas du Trousseau en `05c`, et deux poubelles vaudraient
moins qu'une.

En local, PostgreSQL 17 est installé et Docker fonctionne : les deux voies marchent.
L'adresse de la base de test vient d'une variable d'environnement, avec un défaut
raisonnable, jamais d'un chemin codé en dur.

### Ce qu'un échec doit dire, et taire

PostgreSQL rend un `SQLSTATE` — `28P01` pour un mot de passe refusé, `3D000` pour une
base inconnue. Ce code est repris tel quel : c'est lui qui permet à `08` de distinguer
« mauvais mot de passe » de « hôte injoignable » sans analyser une chaîne traduite.

Le message, lui, ne doit contenir **ni mot de passe, ni chaîne de connexion
complète** — une chaîne de connexion porte le mot de passe. Propriété acquise en
`05c`, à revérifier ici depuis l'autre côté, sur un échec d'authentification réel.

## Terminé quand

- Une connexion s'ouvre contre une vraie base et se ferme proprement.
- Le test de connexion rend une durée plausible et la version réelle du serveur,
  vérifié contre la version que la base annonce par ailleurs.
- Les six modes SSL sont acceptés, et un test distingue le comportement d'un mode
  vérifiant de celui d'un mode non vérifiant.
- Une variante déclarant un tunnel est **refusée** avec une erreur explicite, pas
  connectée en direct.
- Les échecs portent leur `SQLSTATE` : mot de passe refusé, base inconnue, hôte
  injoignable ont chacun un test.
- **Aucun secret dans un message d'erreur**, vérifié sur un échec d'authentification
  réel avec une sentinelle et un contrôle positif.
- Le job de CI Linux est vert, et le job macOS **ne compile pas** les tests exigeant
  une base — vérifié en constatant que son compte de tests ne les inclut pas.
