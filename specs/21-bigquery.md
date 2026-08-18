# 21 — BigQuery

## Goal

Décrire ce qu'un adaptateur BigQuery demanderait, et **pourquoi il n'est pas livré**.

## Dépend de

`06a`, `20` (dont il partage le blocage).

## Scope

- Les deux écarts de BigQuery avec tout ce que le projet a livré.
- Ce qui empêche de le livrer.

## Not in this scope

- Toute implémentation, pour la raison de `20` : rien ne serait vérifiable.

## Approche

### Ce n'est pas un serveur, c'est une API HTTP

Les trois moteurs livrés parlent un protocole sur socket, et le tunnel SSH de `06e` sait les
traverser. BigQuery est une API REST authentifiée par jeton OAuth ou compte de service. Deux
conséquences :

- **Le tunnel ne s'applique pas**, comme pour SQLite (`17a`) mais pour la raison inverse : il n'y a
  pas d'hôte à joindre, il y a un service public.
- **La CSP du produit interdit le réseau sortant depuis le front** (`01`), donc l'appel vit
  entièrement côté Rust — ce qui est déjà le cas de tout accès aux données, mais qui devient ici la
  seule voie possible.

### Une requête coûte de l'argent, et c'est inédit

BigQuery facture les octets lus. Trois habitudes du produit deviennent dangereuses :

| Habitude | Conséquence sur BigQuery |
| --- | --- |
| `A4` déplie l'arbre et compte les objets | l'introspection est gratuite (`INFORMATION_SCHEMA`), donc sans risque |
| `A5` ouvre une table et lit 500 lignes | un `SELECT *` avec `LIMIT` **lit la table entière** sur un stockage en colonnes non partitionné |
| `A7` exécute la requête de l'utilisateur | à ses frais, sans plafond |

La troisième est son problème ; **la seconde est le nôtre**. Ouvrir une table dans `A5` doit passer
par un aperçu gratuit — l'API `tabledata.list` lit sans facturer — et non par un `SELECT`. Une
`LIMIT` qui protège l'IPC (`06a`) ne protège pas la facture.

Et un plafond d'octets par requête (`maximumBytesBilled`) devient un **garde-fou**, au même titre que
les quatre de `15d` : une préférence, activée par défaut.

### Ce qui empêche : le même manque que `20`

Aucun compte, aucun décor local. L'émulateur communautaire ne couvre pas `INFORMATION_SCHEMA`, donc
il ne permettrait pas de vérifier l'introspection — la moitié du travail.

## Done when

- [ ] `AnyEngine` refuse BigQuery avec une raison qui nomme le manque.
- [ ] Le point de facturation est consigné : c'est une décision de produit, pas d'implémentation.
- [ ] Aucune ligne d'adaptateur n'est écrite avant qu'un décor existe.
