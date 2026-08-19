# 23b — Une connexion, un environnement

## Goal

Une connexion déclarée appartient à **un** environnement du projet. Les variantes disparaissent : une
base présente en dev et en prod est deux connexions, pas une base à deux visages.

## Scope

**Le modèle.** `Database` perd `variants: Vec<EnvironmentVariant>` et gagne :

```
Database { name, engine, environment: EnvironmentId, connection: ConnectionSettings }
```

`ConnectionSettings` porte ce qu'une variante portait — hôte, port, base par défaut, utilisateur,
mode SSL, tunnel, lecture seule, reconnexion — sans le champ `environment`, qui monte d'un cran.

**Ce que ça change à l'écran.** L'arbre liste les connexions de l'environnement **actif** du projet.
Une base déclarée en dev et en prod y apparaît une fois par environnement, jamais les deux ensemble.
Basculer d'environnement change donc la liste des bases, et non l'hôte d'une même base.

**Le nom d'une connexion n'est plus unique dans un projet** — il l'est dans un couple
`(environnement, nom)`. C'est la contrainte d'unicité qui remplace l'ancienne, et elle est ce qui
permet à `analytics` d'exister deux fois.

**La migration.** Une base à trois variantes devient **trois connexions** de même nom, une par
environnement. Aucun mot de passe ne bouge : la référence du trousseau contenait déjà l'identifiant
d'environnement (`08e`), et elle reste identique — c'est la raison pour laquelle cette migration ne
touche pas au trousseau.

## Not in this scope

- **Les déclarations d'environnement du projet** : `23a`, dont celle-ci dépend.
- **Le formulaire de création** : `23d`.
- **Le regroupement visuel de l'arbre** : `23g`. Ici, seul le modèle et sa migration.
- **Rassembler deux connexions homonymes sous un même nœud** — un « même objet vu dans deux
  environnements ». C'est précisément le modèle que la décision du 19 août 2026 écarte ; le
  reconstruire dans l'arbre reviendrait à le remettre par la fenêtre.

## Approach

**La migration duplique, elle ne choisit pas.** Une base à trois variantes pourrait devenir une seule
connexion — celle de l'environnement actif — mais cela **perdrait** deux déclarations que
l'utilisateur avait faites, et leurs mots de passe deviendraient orphelins dans le trousseau. Trois
connexions sont plus verbeuses et ne perdent rien : c'est la même règle que `08j`, où supprimer une
déclaration ne touche jamais à la base distante.

**Le nom de connexion reste le nom de la base distante.** Il n'y a pas d'étiquette libre : deux
connexions homonymes se distinguent par leur environnement, qui est affiché. Une étiquette
personnalisable serait un champ de plus à tenir, et le handoff n'en montre aucun.

## Done when

- [ ] Une connexion porte un environnement et un seul jeu de paramètres
- [ ] Deux connexions de même nom coexistent dans un projet si leurs environnements diffèrent
- [ ] Deux connexions de même nom **et** même environnement sont refusées
- [ ] Une base à trois variantes se migre en trois connexions, et un test lit les trois mots de passe
      d'origine dans le trousseau
- [ ] L'arbre ne montre que les connexions de l'environnement actif
