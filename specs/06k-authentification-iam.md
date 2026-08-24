# 06k — L'authentification IAM de base de données

## Objectif

Se connecter à une instance Cloud SQL dont les utilisateurs sont des **principaux IAM** et
non des rôles PostgreSQL à mot de passe. C'est `--auto-iam-authn`, mis hors périmètre depuis
`06g` et réclamé par le premier usage réel.

## Dépend de

`06g` (le proxy lancé), `06j` (le panneau Cloud SQL, qui n'avait plus qu'un champ), `05d`
(le type persisté).

## Périmètre

- `--auto-iam-authn` passé au proxy, **toujours**.
- Le mot de passe : ce que l'application envoie quand il n'y en a pas.
- Ce que l'écran en dit **avant** l'échec.

> **Révisé le jour même.** Ce scope a d'abord porté une bascule dans `A2` et un
> `auto_iam_authn` sur `ProxyCloudSql`. Les deux sont partis sur décision : le mode est
> désormais **toujours** actif — voir « Sans bascule » ci-dessous. Ce qui reste est le
> comportement, pas le choix.

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

### Sans bascule, et c'est une décision

Un interrupteur à deux positions dont une n'est jamais choisie coûte un champ persisté, une
conversion dans les deux sens, un état d'écran et deux chemins à tester — pour décrire un
choix que personne ne fait. Le seul usage connu du projet est en IAM.

Le jour où un rôle à mot de passe se présentera, c'est le **commentaire** du lancement qu'il
faudra venir contredire, à un endroit qui dit pourquoi il est là. C'est préférable à un
booléen oublié qu'il faudrait retrouver, et dont plus personne ne saurait dire s'il a jamais
valu autre chose que `true`.

Conséquence sur `A2` : la phrase du panneau ne dépend plus de rien, et deux champs du
formulaire sont **grisés** derrière un proxy Cloud SQL — le mot de passe, qui ne sert pas, et
le port, que l'application choisit. Voir « Ce que le proxy décide ».

### Ce que le proxy décide à la place de l'utilisateur

Le **port** est choisi à l'ouverture et lu sur ce que le proxy annonce (`06g`) : une valeur
saisie ne serait jamais employée. Le **mot de passe** ne sert pas, l'authentification étant
IAM. Les deux champs sont donc désactivés, et affichent respectivement « auto » et rien.

**Grisés plutôt que masqués.** Les faire disparaître dirait que la connexion n'a ni port ni
mot de passe, alors qu'elle a les deux — simplement, ce n'est plus l'utilisateur qui les
donne. C'est l'inverse du choix de `17a`, qui *masque* les cinq champs sans objet d'un moteur
de fichier : là, la connexion n'a réellement ni hôte ni port.

Chacun porte un `title` qui dit **pourquoi**, la leçon de `09f` : un champ désactivé sans
explication se lit comme un bug.

### Un champ ajouté ne demande pas de cran de migration

La question s'est posée le temps que le booléen existe, et sa réponse vaut d'être gardée :
`#[serde(default)]` aurait suffi. Un champ **retiré** exige un cran, parce qu'il fait
disparaître une valeur que l'utilisateur avait saisie et qu'il faut donc sauvegarder d'abord
(`06j`) ; un champ **ajouté** ne détruit rien.

Le booléen étant parti à son tour, `ProxyCloudSql` n'a pas bougé : la v4 reste la v4.

### La phrase compte autant que la bascule

Une connexion IAM se saisit autrement : l'utilisateur est une adresse, le mot de passe ne sert
plus. Rien dans le formulaire ne le dit, et le découvrir par l'échec coûte un aller-retour
avec un message qui accuse le mauvais coupable.

Le libellé sous la bascule change donc avec elle, et dit les deux choses que l'écran seul ne
peut pas montrer : que l'identifiant est un principal IAM, et que le mot de passe n'est pas
utilisé. Même exigence qu'`06i` sur la commande `gcloud` — un écran doit porter ce qu'il faut
savoir *avant* l'échec, pas seulement l'expliquer après.

### Comment tester cela

- **Sans réseau** : la ligne de commande **énumérée en entier**, l'option comprise — une
  assertion de présence laisserait passer sa disparition dans un `if` réintroduit ; le mot de
  passe vide configuré, et pas inventé hors de ce mode ; un secret enregistré qui l'emporte ;
  les deux champs grisés avec leur `title`, et laissés à l'utilisateur sans proxy Cloud SQL.
- **Avec une vraie instance**, conditionné à une variable comme le reste de la famille : le
  décor d'un compte IAM n'est pas celui d'un rôle à mot de passe, d'où
  `DORABASE_TEST_CLOUDSQL_IAM` en plus des variables de `06g`.

## Terminé quand

- Une connexion aboutit vers une instance en authentification IAM, avec une adresse pour
  utilisateur et aucun mot de passe.
- `--auto-iam-authn` est dans la ligne de commande, et l'énumération de celle-ci le prouve.
- Le port et le mot de passe de `A2` sont grisés derrière un proxy Cloud SQL, et **eux seuls** :
  un tunnel SSH les laisse à l'utilisateur.
- Sans secret enregistré, la connexion configure un mot de passe **vide** en mode IAM, et
  **aucun** hors de ce mode.
- Un secret enregistré est envoyé tel quel, même en mode IAM.
- Le panneau dit que l'utilisateur est un principal IAM et que le mot de passe n'est pas
  utilisé.
- Un fichier de configuration écrit avant ce scope se lit sans migration.
