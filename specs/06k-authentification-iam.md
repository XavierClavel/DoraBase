# 06k — L'authentification IAM de base de données

## Objectif

Se connecter à une instance Cloud SQL dont les utilisateurs sont des **principaux IAM** et
non des rôles PostgreSQL à mot de passe. C'est `--auto-iam-authn`, mis hors périmètre depuis
`06g` et réclamé par le premier usage réel.

## Dépend de

`06g` (le proxy lancé), `06j` (le panneau Cloud SQL, qui n'avait plus qu'un champ), `05d`
(le type persisté).

## Périmètre

- Une bascule « Authentification IAM » dans le visage Cloud SQL de `A2`.
- `auto_iam_authn` sur `ProxyCloudSql`, et `--auto-iam-authn` passé au proxy.
- Le mot de passe : ce que l'application envoie quand il n'y en a pas.
- Ce que l'écran en dit **avant** l'échec.

## Hors périmètre

- **L'IP privée, l'usurpation de compte de service, Private Service Connect.** Toujours hors
  périmètre depuis `06g` : aucune demande, et chacune ajoute un champ.
- **Choisir le principal IAM depuis l'application.** L'utilisateur saisit son adresse dans le
  champ « Utilisateur », comme il saisirait un rôle. L'application ne liste pas les comptes.
- **`--login-token`**, qui sert au connecteur natif et non à ce chemin.

## Approche

### Ce que le mode change vraiment

Sans l'option, le proxy relaie le mot de passe tel quel : PostgreSQL voit un utilisateur qui
est une adresse, ne trouve pas de rôle à mot de passe correspondant, et refuse — « Cloud SQL
IAM user authentication failed ». L'échec ne dit pas *qu'il manque une option*, il dit que
l'authentification a échoué, ce qui envoie vérifier un mot de passe pourtant correct.

Avec l'option, le proxy obtient un jeton à partir des identifiants par défaut (`06i`) et le
présente à la place du mot de passe. Le champ « Mot de passe » de `A2` ne sert alors à rien.

### Un mot de passe **vide**, et non pas d'appel du tout

C'est le seul piège d'implémentation, et il est côté client : `tokio-postgres` échoue **avant
tout échange** quand le serveur réclame un mot de passe et qu'aucun n'a été configuré. Ne rien
donner produirait donc « password authentication required » — un message qui accuse le mot de
passe manquant là où ne rien avoir à donner est précisément le fonctionnement attendu.

L'application configure donc une chaîne **vide** quand le mode est actif et qu'aucun secret
n'est enregistré. C'est ce que fait `psql`, où l'on valide l'invite sans rien saisir.

Un secret enregistré, lui, **gagne** : le mot de passe vide est un repli, pas une règle, et
écraser ce qu'un utilisateur a délibérément enregistré serait décider à sa place.

### Un champ ajouté ne demande pas de cran de migration

`#[serde(default)]` suffit : un fichier écrit avant ce scope se lit, et `false` est la bonne
valeur pour une connexion qui n'utilisait pas IAM — elle ne perd rien.

C'est l'exacte symétrie de `06j`, et la raison mérite d'être dite parce que les deux cas se
ressemblent : un champ **retiré** exige un cran, parce qu'il fait disparaître une valeur que
l'utilisateur avait saisie et qu'il faut donc sauvegarder d'abord ; un champ **ajouté** ne
détruit rien.

### La phrase compte autant que la bascule

Une connexion IAM se saisit autrement : l'utilisateur est une adresse, le mot de passe ne sert
plus. Rien dans le formulaire ne le dit, et le découvrir par l'échec coûte un aller-retour
avec un message qui accuse le mauvais coupable.

Le libellé sous la bascule change donc avec elle, et dit les deux choses que l'écran seul ne
peut pas montrer : que l'identifiant est un principal IAM, et que le mot de passe n'est pas
utilisé. Même exigence qu'`06i` sur la commande `gcloud` — un écran doit porter ce qu'il faut
savoir *avant* l'échec, pas seulement l'expliquer après.

### Comment tester cela

- **Sans réseau** : l'option présente **et seulement** quand elle est demandée, avec le faux
  binaire mouchard de `06g` ; le mot de passe vide configuré, et pas inventé hors de ce mode ;
  un secret enregistré qui l'emporte ; la bascule et sa phrase, côté écran.
- **Avec une vraie instance**, conditionné à une variable comme le reste de la famille : le
  décor d'un compte IAM n'est pas celui d'un rôle à mot de passe, d'où
  `DORABASE_TEST_CLOUDSQL_IAM` en plus des variables de `06g`.

## Terminé quand

- Une connexion aboutit vers une instance en authentification IAM, avec une adresse pour
  utilisateur et aucun mot de passe.
- `--auto-iam-authn` n'est passé que lorsque la bascule est active — l'option change le mode
  d'authentification, et l'ajouter d'office ferait échouer un rôle ordinaire.
- Sans secret enregistré, la connexion configure un mot de passe **vide** en mode IAM, et
  **aucun** hors de ce mode.
- Un secret enregistré est envoyé tel quel, même en mode IAM.
- Le panneau dit, quand la bascule est active, que l'utilisateur est un principal IAM et que
  le mot de passe n'est pas utilisé.
- Un fichier de configuration écrit avant ce scope se lit sans migration, avec la bascule
  éteinte.
