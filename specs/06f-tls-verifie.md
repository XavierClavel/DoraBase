# 06f — Le TLS branché, et vérifié

## Goal

Faire que `verify-ca` et `verify-full` **authentifient** le serveur, au lieu de se comporter comme
`require`. Retirer la mention « TLS non vérifié » de `A2` — en la rendant fausse, pas en l'effaçant.

## Dépend de

`06b` (qui a laissé la réserve), `05a` (la déclaration), `16a` et `18b` (qui portent la même réserve).

## Scope

- Le choix de la pile TLS, et sa raison.
- Un champ « certificat d'autorité » dans la déclaration de `05a`.
- Les trois comportements distincts : `require`, `verify-ca`, `verify-full`.
- Le décor de test à certificat auto-signé, sans lequel rien de ceci ne se prouve.

## Not in this scope

- **Le certificat client** (authentification mutuelle). Aucun des trois moteurs ne le demande dans les
  déploiements visés, et il ajouterait deux champs à `05a`. À faire le jour où quelqu'un en a besoin.
- **SQLite** : un fichier local n'a pas de transport à chiffrer (`17a`).
- **Le TLS du tunnel SSH** : `06e` chiffre déjà, et un TLS dans un tunnel SSH est une décision de
  l'administrateur, pas de l'outil.

## Approche

### `rustls`, et l'argument pour `native-tls` était plus faible qu'il n'y paraissait

`REPRISE.md` enregistrait depuis `06b` que « `native-tls` reconnaît les autorités internes déjà
installées, argument sérieux en entreprise ». Deux faits, vérifiés dans les pilotes eux-mêmes, l'ont
affaibli :

1. **Le pilote MongoDB n'offre pas `native-tls`** — seulement `rustls-tls` ou `openssl-tls`. Sur
   macOS, « natif » y voudrait dire OpenSSL, qui **ne lit pas le Trousseau**. L'avantage disparaît
   pour un moteur sur trois.
2. **Ni `mysql_async` ni le pilote MongoDB n'acceptent un `ClientConfig` arbitraire.** Leur surface
   est un chemin de fichier CA et des drapeaux ; `rustls-platform-verifier`, qui lirait le Trousseau,
   n'est branchable que dans `tokio-postgres-rustls`.

Donc **aucun des deux camps ne donne le trousseau système partout**, et le seul mécanisme que les
trois pilotes partagent est un **chemin de fichier CA**. À partir de là, `rustls` gagne sur trois
points : aucune dépendance système (cohérent avec `rusqlite` en `bundled`), **un seul comportement**
sur macOS et en CI Linux — donc ce qui échoue en CI échoue chez l'utilisateur —, et il est déjà en
place pour MongoDB depuis `18b`.

**Ce que ce choix coûte, dit franchement** : `rustls` refuse TLS 1.0/1.1 et rejette des certificats
malformés qu'OpenSSL accepte. Contre un serveur ancien, cela se traduira par un échec de connexion là
où un autre client passe — et le message d'erreur devra le dire, sans quoi on cherchera un problème de
réseau.

### Un piège de feature qui vaut un test

Dans `mysql_async`, la feature `rustls-tls` **n'inclut pas `tls12`** : sans elle, seul TLS 1.3 est
proposé. Beaucoup de serveurs MySQL d'entreprise sont en 1.2, et l'échec ressemblerait à un problème
de certificat. Les features sont donc `["rustls-tls", "tls12", "ring"]`, et le décor de test doit
exercer une négociation en 1.2.

### Le champ « certificat d'autorité » est ajouté, contre la règle de `17a`

`17a` avait refusé d'ajouter un champ qui resterait vide pour six moteurs sur sept. Celui-ci sert à
**trois moteurs sur quatre** — tous sauf SQLite — et il n'a pas de substitut : c'est le seul mécanisme
commun aux trois pilotes. La règle de `17a` visait les champs sans usage général, pas ceux-là.

`ca_certificate: Option<String>`, avec `serde(default)` : une configuration écrite avant `06f` se lit
sans lui, ce qui donne « les racines publiques ». Pas de migration, comme en `12f` et `15a`.

### Les trois modes se distinguent, et c'est tout l'objet de cette spec

| Mode | Chiffre | Vérifie la chaîne | Vérifie le nom d'hôte |
| --- | --- | --- | --- |
| `disable` | non | — | — |
| `allow`, `prefer` | si le serveur l'offre | non | non |
| `require` | oui | **non** | non |
| `verify-ca` | oui | **oui** | non |
| `verify-full` | oui | **oui** | **oui** |

`require` chiffre sans authentifier : il n'empêche donc **pas** un intermédiaire. C'est ce que `06b`
appelait « l'erreur classique », et les trois lignes du bas sont ce que `A2` propose déjà dans son
sélecteur sans que rien ne les distingue.

### `verify-ca` n'est disponible que pour PostgreSQL, et c'est le coût du choix

Constaté en l'implémentant, pas prévu :

- **Le pilote MongoDB** n'a de champ `allow_invalid_hostnames` qu'avec la feature `openssl-tls`. En
  `rustls`, vérifier la chaîne implique de vérifier le nom.
- **`mysql_async`** expose bien `with_danger_skip_domain_validation`, et il est **silencieusement sans
  effet** : son vérificateur écrit `e.to_string().contains("NotValidForName")`, or l'affichage de
  `rustls` 0.23 dit « certificate not valid for name "localhost" ». Le mot n'y est pas, le bras ne se
  déclenche jamais. C'est un défaut du pilote, pas une limite du protocole.

**PostgreSQL est le seul des trois à accepter une `ClientConfig`** — le fait même qui avait décidé du
choix de `rustls`, qui mord ici dans l'autre sens. Le vérificateur que ce projet écrit filtre sur la
**variante** de l'erreur et non sur son affichage, donc `verify-ca` y fonctionne exactement.

Pour les deux autres, **`verify-ca` est refusé avec sa raison**. Les deux autres réponses étaient
mauvaises : le traiter comme `verify-full` serait silencieusement plus strict — or on choisit
`verify-ca` précisément parce que le nom ne correspond pas, et on lirait un échec de nom sans
comprendre que son réglage est ignoré ; le traiter comme `require` serait un cadenas qui ne protège
rien. Un refus qui nomme les deux voies est la seule réponse honnête.

### Sans décor auto-signé, rien de ceci n'est prouvé

**Un TLS qui accepte tout est pire qu'un TLS absent**, parce qu'il affiche un cadenas. Le décor doit
donc permettre d'échouer :

- une **autorité inconnue** — `verify-ca` doit refuser, et `require` accepter ;
- la même avec le fichier CA fourni — `verify-ca` doit accepter ;
- un **nom d'hôte qui ne correspond pas** — `verify-full` doit refuser là où `verify-ca` accepte.

Le troisième cas est celui qu'on oublie, et il se prouve sur PostgreSQL : `scripts/pg-test.sh`
engendre une autorité à nous et un certificat serveur dont le nom commun est
`pg-interne.exemple.test`. Les tests se connectent par `localhost`, donc la chaîne est **valide** dès
que l'autorité est déclarée et le nom ne correspond **jamais** — deux comportements distincts sur le
**même** serveur, avec la **même** autorité.

**Un cinquième cas, aussi nécessaire** : vérifier côté **serveur** que la session est réellement
chiffrée (`pg_stat_ssl`, `Ssl_cipher`). Demander le TLS et l'obtenir sont deux choses, et une
configuration qui retomberait en clair passerait tous les tests ci-dessus en affichant un cadenas.
Son pendant compte autant : `disable` doit **vraiment** ne pas chiffrer, sans quoi on ne saurait pas
si le réglage décide ou si tout est chiffré par hasard.

**PostgreSQL rejoint donc les autres décors** : il était le seul démarré à la main en local et par un
*service container* en CI — deux façons de faire qui divergeaient. `pg-test.sh` en fait une seule, et
c'est ce qui permet d'activer TLS des deux côtés.

### La mention de `A2` devient fausse, et disparaît pour cette raison

`tls_unverified` vaut aujourd'hui « le mode demande une vérification » ; il vaudra « le mode demande
une vérification **et** nous ne l'avons pas faite ». La mention laide de `08d` s'efface d'elle-même
quand la vérification a lieu — et elle **reste** pour un moteur dont le TLS n'est pas branché, ce qui
est le point : elle dit un fait, pas une échéance.

## Done when

- [x] Les cinq modes de `05a` produisent cinq comportements, et non trois.
- [x] `verify-ca` **refuse** un certificat signé par une autorité inconnue — vérifié sur PostgreSQL.
- [x] Le même serveur est accepté quand son autorité est fournie — vérifié.
- [x] `verify-full` **refuse** un nom d'hôte qui ne correspond pas, là où `verify-ca` accepte —
      vérifié sur le même serveur, avec la même autorité.
- [x] La session est **réellement** chiffrée, d'après le serveur — et `disable` ne l'est vraiment pas.
- [x] Une négociation en TLS 1.2 ou 1.3 aboutit : la feature `tls12` est bien là.
- [x] `tls_unverified` dit un **fait** — le chiffrement est demandé et le serveur n'est pas
      authentifié — et non une échéance du produit.
- [x] Un fichier d'autorité absent ou vide est refusé **avant** la connexion, en citant son chemin.
- [x] Une configuration écrite avant `06f` se lit sans le champ, et vaut « racines publiques ».
- [x] Les décors TLS se montent par un script, en local **et** en CI.
- [x] `verify-ca` est **refusé avec sa raison** pour MySQL et MongoDB, dont les pilotes ne savent pas
      l'exprimer — jamais silencieusement remplacé par un autre mode.
