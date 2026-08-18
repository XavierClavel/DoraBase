# 18b — La connexion MongoDB

## Goal

Ouvrir une connexion MongoDB depuis une déclaration de `05a`, et répondre au test de connexion de
`A2` : latence et version du serveur.

## Dépend de

`18a`, `05a` (la déclaration), `05c` (le mot de passe au Trousseau).

## Scope

- Le pilote et son inscription au socle.
- L'URI construite depuis `EnvironmentVariant` — hôte, port, base par défaut, utilisateur.
- `probe()` : latence mesurée et version du serveur.
- La détection du **type de déploiement** : isolé, jeu de réplicas, cluster fragmenté.
- Les échecs distingués, comme `06b` les distingue : hôte injoignable, authentification refusée,
  base inconnue, TLS.

## Not in this scope

- **L'introspection** → `18c`. **La lecture** → `18e`.
- **Le tunnel SSH** : `06e` est générique — il ouvre un port local, et l'URI le vise. Rien à
  réécrire, mais à **vérifier** : un jeu de réplicas annonce ses membres par leurs noms d'hôte
  internes, et le pilote s'y reconnecte directement, hors du tunnel. Voir § Approche.
- **Le TLS vérifié**, non branché depuis `06b`. La même réserve tient, et la même mention laide.

## Approche

### Le pilote officiel, et `tokio` qu'il partage

`mongodb` (crate officielle) est asynchrone sur `tokio`, déjà imposé par `06a`. Il gère la découverte
de topologie et le pool de connexions, ce qu'aucune réimplémentation ne ferait mieux.

### Le type de déploiement est lu à la connexion, pas supposé

`18f` en dépend : sans jeu de réplicas, pas de transaction, donc pas d'`apply_updates` honnête. Le
constater à l'ouverture — par `hello` — permet à l'interface de le dire **avant** qu'on édite une
cellule, plutôt qu'au moment d'appliquer. C'est la même logique que « lecture seule » de `05a` :
un refus annoncé tôt vaut mieux qu'un échec tardif.

### Le tunnel et le jeu de réplicas ne s'entendent pas d'eux-mêmes

Un pilote qui découvre un jeu de réplicas reçoit la liste de ses membres, avec leurs noms d'hôte
**tels que le cluster les connaît**. Derrière un tunnel, ces noms ne résolvent pas depuis la machine
de l'utilisateur : la connexion s'ouvre puis se perd. La parade est `directConnection=true`, qui
désactive la découverte — au prix de perdre le basculement automatique, ce qui est sans conséquence
pour un outil de lecture.

**À vérifier contre un vrai jeu de réplicas**, pas à supposer : c'est le genre de défaut qui ne se
voit pas sur un `mongod` de test isolé.

### Les échecs se distinguent, parce que la manœuvre diffère

`A3` affiche un échec avec ses lignes de journal, et `06b` a établi la règle : un message qui dit
« connexion impossible » ne dit pas s'il faut corriger le mot de passe ou ouvrir un pare-feu. Quatre
cas au moins, chacun avec sa phrase.

## Done when

- [ ] Une connexion s'ouvre contre un MongoDB réel, et `probe()` rend une latence et une version.
- [ ] Le type de déploiement est rendu, et distingue l'isolé du jeu de réplicas — vérifié contre
      les deux.
- [ ] Les quatre échecs portent des messages distincts, chacun avec sa manœuvre.
- [ ] Aucun message d'erreur ne contient le mot de passe — la propriété de `05c`, retestée ici.
- [ ] La connexion par tunnel fonctionne contre un jeu de réplicas, pas seulement contre un
      `mongod` isolé.
