# 06e — Tunnel SSH

## Objectif

Ouvrir un tunnel SSH vers un bastion et y faire passer la connexion PostgreSQL, comme
le panneau « Proxy / tunnel » de `A2` le configure. Sans cela, ce panneau saisit des
valeurs qui ne servent à rien.

## Dépend de

`05a` (la configuration du tunnel), `05c` (la clé privée est un chemin, pas un
secret), `06b` (la connexion, qui refuse aujourd'hui une variante à tunnel).

## Périmètre

- Ouvrir un tunnel SSH vers un bastion, avec authentification par clé privée.
- Rediriger un port local vers l'hôte et le port de la base, à travers le bastion.
- Choisir un **port local libre** quand la configuration dit « auto ».
- Brancher `06b` dessus : une variante à tunnel se connecte au lieu d'être refusée.
- Fermer le tunnel proprement, et signaler sa chute.

## Hors périmètre

- **L'authentification par mot de passe SSH et par agent.** `A2` ne montre qu'un champ
  « Clé privée » avec un bouton « Parcourir… » : la clé est le seul moyen maquetté.
  L'agent serait pratique, mais ce serait ajouter ce que le design ne demande pas.
- **La phrase de passe d'une clé chiffrée.** Absente du handoff — vérifié, zéro
  occurrence. Si `russh` échoue sur une clé chiffrée, l'erreur doit le **dire
  clairement**, et la saisie viendra avec l'écran qui la réclame (voir `05c` § Hors
  périmètre).
- **La vérification de la clé d'hôte** (`known_hosts`) : voir la décision ci-dessous.
- **Les types de proxy autres que SSH.** `A2` a un sélecteur « Type » qui ne montre que
  `SSH`. `05a` le modélise en énumération d'un seul membre, donc extensible sans
  refonte.
- **Le multiplexage.** Un tunnel par variante d'environnement ; en partager un entre
  plusieurs bases du même bastion serait une optimisation qu'aucun écran ne réclame.
- **Le panneau de `A2`** → `08`.

## Approche

### `russh` plutôt que `ssh2`

`russh` (0.62.5) est en Rust pur ; `ssh2` lie `libssh2`, une bibliothèque C. Trois
raisons de préférer le premier : la compilation croisée reste simple, ce qui compte
pour les cibles Windows et Linux gardées ouvertes ; il est asynchrone, comme le
contrat de `06a` l'exige ; et il évite une dépendance système à installer sur la
machine de chaque utilisateur.

Contrepartie assumée : `russh` est plus jeune et son API bouge davantage. La version
est donc épinglée, et le tunnel est isolé derrière une interface étroite — un
changement d'implémentation ne doit toucher qu'un fichier.

### La vérification de la clé d'hôte, à trancher explicitement

Un tunnel SSH sans vérification de la clé d'hôte est vulnérable à un intermédiaire :
c'est précisément ce contre quoi un bastion est censé protéger. Mais le handoff ne
maquette **ni** un fichier `known_hosts`, **ni** l'invite « voulez-vous faire
confiance à cet hôte ». Implémenter la vérification sans écran pour la résoudre
rendrait toute première connexion impossible.

**Décision : la clé d'hôte est vérifiée contre le `~/.ssh/known_hosts` de
l'utilisateur, et un hôte inconnu fait échouer la connexion** avec une erreur qui dit
quoi faire — se connecter une fois en `ssh` pour l'enregistrer. C'est plus strict que
d'accepter aveuglément, plus utilisable que de n'avoir aucun moyen d'avancer, et cela
réutilise ce que l'utilisateur a déjà.

Ce point mérite d'être **remonté** : c'est un choix de sécurité que le design n'a pas
tranché, et un écran de confiance à la première connexion serait la vraie réponse. À
inscrire au § « À trancher » de `specs/README.md`.

### Le port local automatique

`A2` affiche « auto (63342) » dans un champ désactivé : le port est choisi par l'app,
et montré. Le choix se fait en demandant au système un port libre, puis en le libérant
juste avant de s'y lier — fenêtre de course théorique, sans conséquence pratique ici,
et à préférer à une plage codée en dur qui entrerait en conflit avec un autre outil.

Le port retenu est **rendu** pour que `A2` l'affiche, ce qui interdit de le garder
interne à l'implémentation.

### Une chute de tunnel n'est pas une erreur de base

Si le bastion tombe, la connexion PostgreSQL échoue avec une erreur réseau qui ne dit
rien du tunnel. L'erreur remontée doit distinguer les deux, sinon l'utilisateur
cherchera un problème de base là où le bastion est en cause — et le handoff insiste
là-dessus en `A3` : « tunnel aborted · pg connect skipped », deux lignes distinctes.

### Comment tester cela

Un vrai serveur SSH est nécessaire. Le job Linux de `06b` peut en fournir un en
service, avec une clé générée à la volée par le test : cela rend le chemin heureux
vérifiable en CI. Le chemin d'échec — clé refusée, hôte inconnu, bastion injoignable —
est testable sans serveur pour certains cas, et avec un serveur mal configuré pour les
autres.

## Terminé quand

- Un tunnel s'ouvre vers un serveur SSH de test et une connexion PostgreSQL passe à
  travers, contre une vraie base.
- Le port local est choisi automatiquement, **rendu** à l'appelant, et différent d'un
  port déjà occupé.
- Une clé refusée, un bastion injoignable et un hôte inconnu de `known_hosts`
  produisent trois erreurs **distinctes**, chacune couverte.
- Une chute du tunnel se distingue d'une erreur de base dans le message remonté.
- Une clé privée chiffrée produit une erreur qui **dit** que la phrase de passe n'est
  pas encore gérée, plutôt qu'un échec obscur.
- La fermeture libère le port local, vérifié en le réutilisant aussitôt.
- `06b` ne refuse plus une variante à tunnel.
- Aucune valeur de secret ni contenu de clé privée dans un message d'erreur ou un
  journal, vérifié avec une sentinelle et un contrôle positif.
