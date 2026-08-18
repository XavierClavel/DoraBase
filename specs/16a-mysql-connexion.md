# 16a — MySQL : la connexion, et les trois écarts avec PostgreSQL

## Goal

Ouvrir une connexion MySQL / MariaDB, répondre au test de connexion de `A2`, et trancher les trois
endroits où MySQL ne se comporte pas comme PostgreSQL.

## Dépend de

`06a` (le contrat), `05a` (la déclaration), `05c` (le mot de passe au Trousseau).

## Scope

- Le pilote et son inscription au socle.
- La connexion depuis `EnvironmentVariant`, tunnel SSH compris.
- `probe()` : latence et version — et **la distinction MySQL / MariaDB**.
- Les échecs distingués, comme `06b` et `18b` les distinguent.

## Not in this scope

- **L'introspection** → `16b`. **La lecture et l'écriture** → `16c`.
- **Le TLS vérifié**, non branché depuis `06b`. La même réserve tient.

## Approche

### « Base » et « schéma » sont le même mot chez MySQL

`information_schema.schemata` s'appelle un schéma, `CREATE DATABASE` crée la même chose : MySQL n'a
qu'un niveau là où PostgreSQL en a deux. C'est la question que `18a` a tranchée pour MongoDB, et la
réponse est la même — **le niveau « schéma » de l'arbre porte les bases du serveur**, la déclaration
de connexion porte le serveur. Aucun niveau replié, aucun `analytics › analytics › orders`.

### MariaDB n'est pas MySQL, et la version le dit

Les deux répondent au même protocole et divergent sur le catalogue : `information_schema` diffère,
et certaines requêtes de `16b` devront brancher. `probe()` rend donc la chaîne complète du serveur —
`10.11.6-MariaDB` ou `8.4.0` — plutôt qu'un numéro nu. Le mockup affiche « MySQL 8.4 » ; afficher
« MySQL » devant une MariaDB serait faux, et c'est le genre d'erreur qui fait chercher longtemps.

### Le fuseau des horodatages est une décision, pas un détail

MySQL rend un `DATETIME` **sans fuseau** et un `TIMESTAMP` converti dans le fuseau de la session.
Deux clients réglés différemment lisent donc des valeurs différentes de la même ligne. La session
force `time_zone = '+00:00'`, et `Value::Timestamp` porte l'instant UTC : c'est la seule lecture qui
ne dépende pas de qui regarde. **À dire à l'écran** le jour où une colonne `TIMESTAMP` s'affiche
décalée par rapport à un autre outil.

## Done when

- [ ] Une connexion s'ouvre contre un MySQL réel, et `probe()` rend latence et version.
- [ ] MariaDB et MySQL se distinguent dans la version rendue — vérifié contre les deux.
- [ ] Les quatre échecs portent des messages distincts, chacun avec sa manœuvre.
- [ ] Aucun message d'erreur ne contient le mot de passe — la propriété de `05c`, retestée.
- [ ] La connexion par tunnel fonctionne.
- [ ] Le fuseau de session est forcé, et un `TIMESTAMP` se relit identique quel que soit le fuseau
      de la machine — vérifié en changeant `TZ`.
