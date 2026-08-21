# 06i — S'authentifier avec les identifiants du CLI gcloud

## Objectif

Ouvrir un proxy Cloud SQL **sans fichier de compte de service**, en réemployant
l'authentification que l'utilisateur a déjà faite avec `gcloud`. Et surtout : quand ça
échoue, le dire assez précisément pour que ce soit réparable.

## Dépend de

`06g` (le proxy lancé, son journal, `qualifier`), `06h` (le binaire embarqué — sans lui, il
resterait deux outils à installer au lieu d'un), `08k` (le champ « Compte de service » et le
libellé qui explique son vide).

## Périmètre

- Le cas « pas de fichier de compte de service » traité et **nommé** : les identifiants
  par défaut de l'application (ADC), écrits par `gcloud auth application-default login`.
- Un contrôle **avant** de lancer le proxy quand il n'y a aucun identifiant à trouver.
- Trois échecs d'authentification distincts, chacun portant sa réparation.
- Un libellé : celui d'`08k` sous « Compte de service » cite désormais la commande exacte.

## Hors périmètre

- **`--gcloud-auth`** (voir plus bas : écarté pour une raison, pas par oubli).
- **`--auto-iam-authn`, `--impersonate-service-account`, `--private-ip`** — déjà hors
  périmètre en `06g`, et ils le restent : chacun ajoute un champ à `A2`.
- **Installer `gcloud`.** L'app le nomme, elle ne l'installe pas — même règle qu'`06g`
  appliquait au proxy avant `06h`, et ici elle tient : le SDK gcloud est un installeur à
  lui seul, et l'app n'en a besoin qu'une fois, pour un login.
- **Choisir le compte ou le projet depuis l'app.** Ce serait une interface d'identité GCP.
  L'utilisateur choisit avec `gcloud`, l'app lit ce qui en résulte.

## Approche

### Rien à ajouter au lancement : c'est déjà le comportement

`06g` ne passe `--credentials-file` que lorsque `credentials_file_path` est renseigné.
Sans lui, le proxy prend les ADC : la variable `GOOGLE_APPLICATION_CREDENTIALS`, à défaut
le fichier bien connu que `gcloud` écrit (`~/.config/gcloud/application_default_credentials.json`).
Le champ optionnel de `ProxyCloudSql` porte déjà cette intention en commentaire.

Ce scope n'ajoute donc **aucun champ** et **aucun argument**. Tout son contenu est du
diagnostic — ce qui est le signe que la frontière d'`06g` était au bon endroit.

### `gcloud auth login` n'est pas `gcloud auth application-default login`

C'est la confusion centrale de ce scope, et elle est légitime : les deux commandes se
ressemblent, toutes deux ouvrent un navigateur, toutes deux disent « vous êtes
authentifié ». Mais la première n'alimente que le CLI lui-même ; seule la seconde écrit le
fichier que les bibliothèques clientes — donc le proxy — savent lire.

Conséquence sur la rédaction des messages : jamais « authentifiez-vous avec gcloud », qui
enverrait droit sur la mauvaise commande. Toujours la ligne complète, à copier.

S'y ajoute le projet de quota : des identifiants d'utilisateur sans projet de quota font
échouer l'appel à l'API Cloud SQL Admin. Deux commandes donc, pas une.

### Pourquoi `--gcloud-auth` est écarté

Le proxy sait déléguer à `gcloud` (`-g`), ce qui dispenserait du second login. Vérifié
présent en v2.2.0, donc l'option existe bien. Elle est pourtant le pire choix ici.

Elle exige `gcloud` **dans le `PATH` du processus proxy**. Or le `PATH` d'une app lancée
depuis le Finder est minimal, et `gcloud` vit dans `~/google-cloud-sdk/bin` ou sous
Homebrew. Il faudrait donc localiser `gcloud` comme `06g` localise le proxy, puis fabriquer
l'environnement de l'enfant. Autrement dit : `06h` supprime une dépendance au `PATH`, et
`--gcloud-auth` en réintroduirait une, plus fragile, pour économiser un login unique.

À reprendre si le second login se révèle un obstacle réel à l'usage. Pas avant.

### L'absence totale d'identifiants se voit sans lancer le proxy

Un des trois échecs se détecte à coût nul : ni `GOOGLE_APPLICATION_CREDENTIALS`, ni fichier
bien connu, ni chemin saisi. Le contrôle évite d'attendre le délai d'`06g` pour apprendre
ce qu'on savait déjà, et il rend le message le plus utile des trois au moment le plus tôt.

Deux règles pour qu'il ne nuise pas :

- Il porte **uniquement sur l'existence**, jamais sur le contenu du fichier. Même exigence
  qu'`06g` sur le compte de service et qu'`06e` sur la clé privée : ce qui n'est pas lu ne
  peut pas fuir dans un journal.
- Il ne parle que si **les deux** sources sont absentes. Une variable renseignée suffit, et
  un contrôle qui ne regarderait que le fichier refuserait une machine correctement
  configurée — un faux refus est plus coûteux qu'un diagnostic tardif.

### Les deux autres échecs viennent du proxy, et on ne les écrase pas

Droits manquants et API désactivée sont dans ce que le proxy écrit. On les **reconnaît**
pour ajouter la réparation — le rôle `roles/cloudsql.client`, ou l'activation de l'API —
et l'on garde le texte d'origine dans le message. Reconnaître pour enrichir, jamais pour
remplacer : une classification qui se trompe sur un message inconnu ne doit pas coûter le
diagnostic, comme `06g` l'a déjà posé pour la mort prématurée du processus.

### Comment tester cela

Sans compte GCP, ce qui couvre tout sauf le chemin heureux :

- **Le contrôle préalable** : `HOME` sur un répertoire temporaire (aucun ADC) → il parle ;
  plus `GOOGLE_APPLICATION_CREDENTIALS` renseignée → il se tait ; plus un chemin saisi →
  il se tait. Trois cas, aucune E/S réelle.
- **La classification** : un faux binaire qui écrit une ligne de 403, une d'API désactivée,
  une inconnue. La troisième doit rendre son texte intact.
- **La sentinelle** : un faux fichier d'ADC au contenu reconnaissable, et l'assurance qu'il
  n'apparaît dans aucun message ni journal — avec le contrôle positif, comme `06e`.
- **Le chemin heureux**, conditionné à une variable d'environnement, comme le reste de la
  famille : une vraie instance, atteinte avec les seuls ADC d'un `gcloud`.

## Terminé quand

- Une connexion Cloud SQL s'ouvre avec le champ « Compte de service » vide, sur une machine
  où seul `gcloud auth application-default login` a été fait.
- Aucun identifiant du tout produit une erreur **avant** le lancement du proxy, qui cite
  les deux commandes, et qui dit que `gcloud auth login` ne suffit pas.
- Droits manquants, API désactivée et absence d'identifiants donnent trois messages
  distincts, chacun couvert par un test.
- Un message d'échec inconnu du proxy remonte **intact**.
- Aucun contenu d'un fichier d'identifiants n'apparaît dans un message ni un journal,
  vérifié avec une sentinelle et un contrôle positif.
- `ProxyCloudSql` n'a gagné aucun champ, et `ouvrir_avec` aucun argument.
