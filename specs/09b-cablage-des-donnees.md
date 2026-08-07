# 09b — Le câblage des données

## Objectif

Faire enfin lire la configuration au démarrage, ouvrir les connexions, et exposer
l'introspection de `06c` au front. C'est la spec qui rend la boucle du produit complète :
saisir (`08e`), persister, relire, afficher.

## Dépend de

`05b` (`load_config`, écrite et jamais appelée), `06b`–`06e` (connexion, introspection,
tunnel), `08e` (l'écriture).

## Périmètre

- Appeler `load_config` au démarrage, et gérer ses quatre issues.
- Un registre de connexions ouvertes, côté Rust : une base ouverte reste ouverte.
- Les commandes d'introspection : schémas d'une base, objets d'un schéma, détail d'une
  table.
- L'état de chaque base — jamais tentée, connexion en cours, connectée, hors ligne — que
  `09d` affichera dans l'arbre.
- `reconnectOnStartup` : les bases qui le déclarent sont connectées au lancement.

## Hors périmètre

- **Tout rendu.** Ce scope livre des commandes et un état ; `09c` à `09f` les affichent.
- **La lecture de lignes** (`06d`) → `10`. `A4` liste des objets, il n'ouvre aucune table.
- **La création de projet.** Le trou n°4 du handoff reste ouvert : `08e` désactive
  l'enregistrement sans projet, et rien ici ne le change. C'est l'écran de création qui
  manque, et il n'est maquetté nulle part.
- **Le rafraîchissement automatique.** Le pied de la sidebar a un bouton « rafraîchir » ;
  ce scope livre la commande, `09d` le bouton. Aucun rafraîchissement périodique n'est
  maquetté, et en inventer un ferait requêter le catalogue d'un serveur de production en
  boucle.

## Approche

### L'arbre se lit sans réseau — décidé le 7 août 2026

La configuration ne demande aucune connexion : projets, bases et environnements sont sur
le disque. L'arbre de `09d` s'affiche donc **immédiatement**, et chaque base porte son
état à côté de son nom.

Une base injoignable reste **visible et marquée**, pas masquée ni bloquante. Deux raisons :
le handoff maquette un point d'état vert dans la pastille projet, ce qui suppose qu'un état
existe et se voit ; et attendre les connexions bloquerait l'écran jusqu'à 30 secondes sur
un seul hôte muet — le délai posé en `06e`.

Conséquence : les états sont **quatre**, pas deux. « Jamais tentée » n'est pas « hors
ligne », et les confondre afficherait en rouge une base qu'on n'a simplement pas ouverte.

### Un registre, parce qu'une connexion est un objet vivant

`PostgresAdapter` détient un client et, éventuellement, un tunnel SSH. Il ne peut pas
traverser l'IPC, et le recréer à chaque commande rouvrirait un tunnel par requête.

D'où un registre dans l'état Tauri : clé = projet / base / environnement — **la même que
la référence de secret de `08e`**, et ce n'est pas un hasard : c'est l'identité d'une
connexion. La réemployer évite deux conventions à garder cohérentes.

Fermeture explicite quand une base est refermée, et `PostgresAdapter::close` attend que le
port du tunnel soit rendu (`06e`, `08d`). Un registre qui fuit des tunnels est un registre
qui épuise les ports.

### La contrainte transverse s'applique aussi à l'introspection

Aucune commande ne rend « tout le catalogue ». Les schémas d'une base, les objets d'**un**
schéma, le détail d'**une** table : c'est exactement le découpage que `06c` livre, et il
correspond au dépliage de l'arbre. Une commande « tout l'arbre » serait plus simple à
appeler et ramènerait des milliers d'objets pour en afficher douze.

### Le mot de passe se relit, il ne se redemande pas

À l'ouverture, le secret vient du magasin par sa `SecretRef` (`05c`). `retrieve` rend
`Ok(None)` pour « aucun secret sous cette référence », qui est un état normal — SQLite sur
fichier. Une panne de magasin, elle, est une erreur : les confondre ferait tenter une
connexion sans mot de passe et afficher « authentification refusée » là où le vrai
problème est le Trousseau.

### Ce qui ne sera pas vérifiable automatiquement

Le démarrage complet — lire la configuration, rouvrir les connexions — demande l'app
réelle. Deux vérifications à l'œil s'ajoutent donc à celles déjà dues par `08c` et `08d` :
qu'une base enregistrée **réapparaisse après un redémarrage**, et qu'une base injoignable
soit marquée sans bloquer l'écran.

## Terminé quand

- `load_config` est appelée au démarrage et ses quatre issues sont traitées, la
  quarantaine comprise — un fichier illisible ne doit pas se présenter comme « aucun
  projet », ce qui inviterait à écrire par-dessus.
- Les quatre états de connexion sont distincts, et « jamais tentée » ne s'affiche pas
  comme « hors ligne ».
- Ouvrir deux fois la même base réemploie la connexion, vérifié par un compteur.
- Refermer une base libère son port de tunnel, vérifié en le réutilisant.
- Une base injoignable n'empêche pas les autres de s'ouvrir, vérifié avec un hôte muet.
- Un secret absent et une panne de magasin produisent deux messages distincts.
- Les commandes sont testées contre le PostgreSQL de test, et leurs types projetés.
- Aucun secret dans un journal ni un message, sentinelle et contrôle positif.
- Le redémarrage est vérifié dans l'app réelle, et rapporté comme observé.
