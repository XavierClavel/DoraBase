# 20 — Snowflake

## Goal

Décrire ce qu'un adaptateur Snowflake demanderait, et **pourquoi il n'est pas livré**.

## Dépend de

`06a`, `06b` (la forme d'une connexion).

## Scope

- Ce que Snowflake ajoute qu'aucun moteur du projet n'avait.
- Ce qui empêche de le livrer aujourd'hui.

## Not in this scope

- Toute implémentation. Voir § Approche : elle ne serait pas vérifiable.

## Approche

### Le contrat lui va, l'authentification non

Snowflake est relationnel : `information_schema` y est standard, les colonnes sont déclarées, les
transactions existent. Le modèle de `06a` s'applique sans arbitrage — contrairement à MongoDB
(`18a`) et à Redis (`19a`).

Ce qui bloque est **l'authentification**. Snowflake demande un compte, un entrepôt, un rôle, et
souvent une paire de clés ou un jeton OAuth — quatre notions que `EnvironmentVariant` n'a pas et que
`05a` n'a pas prévues. Les faire entrer demanderait :

- un champ « compte » et un champ « entrepôt », vides pour six moteurs sur sept ;
- une authentification par clé, donc un second usage du Trousseau (`05c`) avec une forme différente ;
- un écran `A2` qui change de champs selon le moteur — ce que `17a` a déjà rencontré pour SQLite, et
  résolu en masquant les champs inutiles plutôt qu'en ajoutant.

### Ce qui empêche vraiment : rien de vérifiable

**Le projet n'a aucun compte Snowflake**, et il n'existe pas d'équivalent local. Or chaque moteur du
projet est vérifié contre un serveur réel : PostgreSQL 17.6 en conteneur, MongoDB 8 en jeu de
réplicas, un vrai bastion SSH. Un adaptateur Snowflake serait le premier morceau de code du projet
dont **aucun test ne dirait s'il fonctionne** — et un adaptateur de base de données non testé est
exactement le genre de code qui perd des données sans le dire.

C'est la raison de fond, et elle est plus forte que l'authentification : celle-ci se conçoit, l'autre
non.

### Ce qu'il faudrait pour lever le blocage

Dans cet ordre :

1. **Un compte de test** — un essai gratuit suffit, avec un entrepôt de la plus petite taille.
2. Une décision du commanditaire sur les identifiants : mot de passe, ou paire de clés.
3. Alors `20a` (connexion) et `20b` (introspection et lecture), sur le modèle de `16`.

## Done when

- [ ] `AnyEngine` refuse Snowflake avec une raison qui nomme le manque : aucun décor de test.
- [ ] Ce blocage est consigné au § « Ce qui attend une décision humaine » de `REPRISE.md`.
- [ ] Aucune ligne d'adaptateur n'est écrite avant qu'un décor existe.
