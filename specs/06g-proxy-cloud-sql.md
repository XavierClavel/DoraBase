# 06g — Proxy Cloud SQL

## Objectif

Faire passer une connexion PostgreSQL par le **Cloud SQL Auth Proxy**, pour une base
hébergée sur Cloud SQL. Sans cela, une instance sans IP publique — le cas normal — est
inatteignable, et `05d` décrit un proxy que rien n'ouvre.

## Dépend de

`05d` (`Proxy::CloudSql`), `06b` (la connexion, et son refus d'une variante à proxy sans
redirection), `06e` (le choix du port local, et la façon de signaler une chute).

## Périmètre

- Lancer `cloud-sql-proxy` en sous-processus, à l'écoute sur un port local libre.
- Attendre qu'il soit **réellement prêt** avant de tenter la connexion PostgreSQL.
- Un aiguillage unique entre les deux sortes de proxy, pour que `PostgresAdapter` n'ait
  pas deux champs et deux chemins.
- Signaler la mort du proxy comme telle, et non comme une erreur de base.
- Le tuer proprement à la fermeture, et rendre son port.

## Hors périmètre

- **Le connecteur natif**, qui parlerait à l'API Cloud SQL Admin et ouvrirait lui-même
  une session mTLS vers l'instance. Ce serait supprimer la dépendance au binaire, au prix
  d'une pile d'authentification GCP complète et d'une rotation de certificat éphémère
  toutes les heures. L'interface étroite posée ici est justement ce qui permettra de
  l'ajouter sans toucher au reste.
- **L'IP privée** (`--private-ip`), **l'authentification IAM automatique**
  (`--auto-iam-authn`), **l'usurpation de compte de service**, **Private Service
  Connect**. Quatre cas réels, aucun maquetté, et chacun ajoute un champ à `A2`. À
  reprendre quand un besoin les réclame — le modèle de `05d` les accueille sans refonte.
- **Installer le binaire pour l'utilisateur.** Télécharger un exécutable et le lancer est
  une décision de sécurité qui n'appartient pas à ce scope.
- **Le chemin du binaire en configuration.** Ce scope le cherche ; s'il faut un jour le
  saisir, ce sera une préférence de machine (`15`), pas un champ de connexion.
- **Le panneau de `A2`** → `08k`.

## Approche

### Le binaire, pas une bibliothèque

Le proxy officiel est en Go et n'existe pas en bibliothèque Rust. Le lancer en
sous-processus est donc le seul chemin court, et il a un avantage à peser : c'est du code
maintenu par Google qui gère l'IAM, l'IPv6, l'IP privée et la rotation des certificats —
tout ce que le connecteur natif devrait réimplémenter.

Contrepartie assumée : un processus enfant à surveiller et à tuer. C'est la difficulté
réelle de ce scope, et elle est concentrée dans les quatre points qui suivent.

### Trouver le binaire, et le dire quand il manque

Cherché dans le `PATH`, puis aux emplacements usuels d'une installation Homebrew. Absent,
l'erreur **nomme ce qu'il faut faire** — installer `cloud-sql-proxy` — plutôt que de
rendre le `No such file or directory` du système. C'est la même exigence que `06e`
applique à un hôte inconnu de `known_hosts` : un échec doit porter sa réparation.

### Attendre « ready for new connections », pas sonder le port

Le proxy écrit une ligne sur sa sortie d'erreur quand il accepte les connexions. On
attend **cette ligne**, avec un délai borné, et l'on collecte au passage ce qu'il écrit
avant — c'est là que se trouvent ses propres messages d'échec, autrement perdus.

Sonder le port en boucle serait plus simple et faux : un refus de connexion pendant le
démarrage est indistinguable d'un refus définitif, donc l'attente confondrait « pas
encore » et « jamais ». Elle réussirait aussi si un **autre** programme écoutait ce port.

Si le processus meurt avant d'être prêt, l'erreur remontée est **ce qu'il a écrit**, pas
« délai dépassé » : une instance mal nommée, un compte sans droit ou une API désactivée
donnent chacun un message précis, et l'écraser rendrait le diagnostic impossible.

### Un aiguillage unique, dans un seul endroit

`PostgresAdapter` ne doit pas gagner un second champ ni un second chemin. Un type
`ProxyOuvert` porte l'un ou l'autre et expose ce que l'adaptateur emploie déjà —
`port_local`, `etat`, `fermer` — de sorte que `connect_via` fasse **un** `match` sur
`Proxy` et rien de plus. `preparer` de `06b` continue de recevoir
`("127.0.0.1", port)` et n'apprend rien de neuf : c'est le signe que la frontière est
au bon endroit.

Corollaire : le paramètre `known_hosts` de `connect_via`, propre à SSH, n'a plus à être
exigé d'un appelant qui ouvre un proxy Cloud SQL.

### Le port local ne peut pas réemployer celui de `06e`, et le proxy dit le vrai

`06e` évite toute fenêtre de course en se liant au **port 0** et en lisant le port attribué
sur l'écouteur déjà en place. Ce chemin est fermé ici : c'est le sous-processus qui se lie,
et il ne peut pas hériter de notre `TcpListener`. Il faut donc choisir un port, le
**relâcher**, puis le passer en `--port` — exactement la fenêtre de course que `06e` avait
éliminée.

D'où la règle : **le port rendu à l'appelant est celui que le proxy annonce**, lu dans sa
sortie (« Listening on 127.0.0.1:… »), et non celui qu'on lui a demandé. Si un autre
programme a pris le port entre-temps, le proxy échoue et le dit ; il ne peut pas se lier
ailleurs à notre insu. La course reste possible, mais elle ne peut plus produire une
connexion vers le mauvais port — au pire un échec explicite, réessayable.

Un port **explicite** venant de `A2` est passé tel quel, et son occupation est une erreur
que l'utilisateur peut corriger — même traitement qu'en `06e`.

La surveillance non plus ne se réemploie pas : `06e` détecte la chute d'une session
SSH, ici c'est la **sortie d'un processus**, avec un code et une sortie d'erreur. Le
patron est le même (un état partagé, lu par `etat()` et par le test, jamais reconstitué
dans une fonction d'appoint — voir `REPRISE.md` § 6), l'implémentation diffère.

### Le tuer proprement, et le tuer quand même

`fermer()` tue le processus **et attend sa sortie** — même raison que
`SshTunnel::fermer` en `06e` : la demande de mort n'est pas synchrone, et rendre sans
attendre laisserait le port lié quelques instants. Le `Drop` demande la mort sans attendre,
en filet.

Un `SIGTERM` avant le coup de grâce serait plus courtois et coûterait une dépendance
`libc` — Rust n'a pas de signal portable. On s'en dispense, et c'est défendable ici : le
proxy est **sans état**, il ne fait que relayer des octets, et l'on ne le tue qu'au moment
où la connexion PostgreSQL se ferme de toute façon. Rien à vider, donc rien à perdre.

Un proxy orphelin est le pire défaut possible ici : il garde le port, et la connexion
suivante croira parler à sa propre instance en parlant à celle d'avant. Ça mérite un test
qui vérifie que le processus est bien mort, par son identifiant — pas seulement que le
port est libre.

### Comment tester cela

Trois niveaux, parce qu'une vraie instance Cloud SQL ne peut pas être une condition de la
CI :

- **Sans rien** : la recherche du binaire, l'absence de binaire, l'expiration de
  l'attente, la traduction des messages d'échec.
- **Avec un faux binaire** — un script qui écrit la ligne attendue puis relaie un port,
  ou qui meurt en écrivant une erreur : tout le pilotage du processus, y compris la mort
  prématurée et la tuerie, sans réseau et sans compte GCP. C'est là que porte l'essentiel
  du risque de ce scope.
- **Avec une vraie instance**, conditionné à une variable d'environnement, comme `06e`
  conditionne ses tests au serveur SSH Docker : le chemin heureux de bout en bout.

## Terminé quand

- Une connexion PostgreSQL passe par le proxy vers une vraie instance Cloud SQL, avec les
  identifiants par défaut de l'application puis avec un fichier de compte de service.
- Le binaire absent produit une erreur qui dit **comment l'installer**, distincte de
  toutes les autres.
- Le proxy qui meurt avant d'être prêt remonte **son propre message**, et un test le
  prouve avec un faux binaire qui écrit une erreur reconnaissable.
- Une instance mal nommée, un compte sans droit et un binaire absent produisent trois
  erreurs **distinctes**, chacune couverte.
- La mort du proxy après l'ouverture se distingue d'une erreur de base dans le message
  remonté — même exigence que `06e`, `A3` affichant deux lignes.
- Le port rendu est celui que le **proxy annonce**, pas celui qu'on lui a demandé —
  vérifié avec un faux binaire qui annonce délibérément un autre port que celui reçu.
- `fermer()` laisse le processus **mort**, vérifié en attendant sa sortie, et le port
  réutilisable aussitôt.
- Le `Drop` demande la mort aussi : vérifié en lâchant l'adaptateur sans appeler `fermer()`.
- `PostgresAdapter` n'a qu'un champ de proxy et un seul `match` — vérifié en lisant, et
  garanti par le fait qu'un troisième membre de `Proxy` ne compilerait qu'en un endroit.
- Aucun contenu de fichier de compte de service dans un message ni un journal, vérifié
  avec une sentinelle et un contrôle positif — comme `06e` le fait pour la clé privée.
