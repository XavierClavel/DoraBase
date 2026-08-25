# 08g — Modifier une connexion

## Objectif

Corriger les réglages d'une base déjà déclarée — hôte, port, base par défaut, utilisateur, mot de
passe, mode SSL, tunnel. Aujourd'hui c'est impossible : une seule faute de frappe sur le port
oblige à déclarer une seconde base.

## Dépend de

`05a` (le modèle), `05b` (la persistance), `05c` (les secrets), `08b`–`08e` (le formulaire de `A2`),
`09b` (le registre de connexions), `09c` (`ProjectPill`).

## Périmètre

- Une commande `update_variant`, qui n'existe pas.
- `A2` en **mode édition** : champs préremplis, titre et bouton adaptés.
- Le menu de la pastille projet, qui liste les bases et mène à leur modification.
- La fermeture de la connexion ouverte quand ses réglages changent.

## Hors périmètre

- **Supprimer une base ou un projet.** Destructif, et il faut décider du sort des secrets ; le
  handoff ne le maquette pas davantage. Sa propre spec.
- **Renommer une base, ou changer son environnement.** Voir § Approche : c'est la clé.
  **Le renommage a été rouvert par `26`** (25 août 2026), comme cette spec l'envisageait : le geste
  n'est pas ici mais sur la ligne d'arbre, et le champ de `A2` reste verrouillé — son infobulle y
  renvoie désormais au lieu de dire « supprimez et redéclarez ». L'environnement, lui, reste fermé.
- **Changer de moteur.** Tous les réglages en dépendent ; autant supprimer et redéclarer.
- **L'écran « Bases du projet » de `A10`.** C'est le vrai foyer de cette gestion — sa sidebar de
  préférences porte déjà cette entrée. Cette spec livre le chemin court en attendant `15`, et le
  dit.

## Approche

### Le nom et l'environnement ne sont pas modifiables, et ce n'est pas un oubli

`projet/base/environnement` est à la fois la clé du registre (`09b`) et la référence du secret
(`08e`) — une seule identité, décision de `05a`. En changer un élément demanderait de déplacer le
secret dans le magasin, de fermer la connexion ouverte sous l'ancienne clé, et de traiter le cas où
la nouvelle identité existe déjà. Trois effets de bord pour un renommage.

Les deux champs sont donc **affichés et verrouillés**, avec la raison en infobulle. Un champ
désactivé sans explication fait croire à un bug — la leçon de `09f`.

### Un mot de passe vide veut dire « inchangé »

Sinon corriger un port obligerait à retaper le mot de passe, et l'oublier l'effacerait. C'est la
convention universelle des formulaires d'identifiants, et le seul comportement qui ne détruit rien
par distraction.

Conséquence : **il faut un autre geste pour retirer un mot de passe**. Hors périmètre — le handoff
ne maquette pas de « supprimer le mot de passe », et l'inventer maintenant ajouterait un contrôle à
un formulaire déjà dense. Consigné.

### Modifier une base ouverte la ferme

Le registre garde une connexion vivante par clé (`09b`). Après un changement d'hôte, cette
connexion pointe encore l'ancien — l'arbre continuerait d'afficher les schémas de la base
précédente, et « Rafraîchir » ne changerait rien puisque la connexion, elle, n'a pas bougé.

`update_variant` ferme donc la connexion de cette clé. L'utilisateur la rouvre en dépliant la base,
ce qui est déjà le geste d'ouverture. Ne pas la réouvrir d'office : le nouveau réglage peut être
faux, et une erreur de connexion juste après un enregistrement réussi se lirait comme un échec de
l'enregistrement.

### Le point d'entrée existait déjà, inerte

`ProjectPill` porte un `onOpenProjects` depuis `09c`, que rien n'appelle, et le mockup dessine un
chevron sur la pastille — le design prévoit donc un menu déroulant, sans en montrer le contenu.

Ce menu liste les bases du projet actif, chacune avec son environnement, et mène à sa modification.
Le contenu est un trou du handoff : le minimum défendable est une liste, sans inventer d'actions que
rien ne réclame. `Popover` de `10a` le porte — pas de nouveau composant.

### Une commande distincte, pas un `save_database` plus large

`save_database` **ajoute** : il refuse une base qui existe déjà, et c'est ce qui protège d'un
écrasement par mégarde. Lui faire aussi la mise à jour effacerait cette garde. Même arbitrage
qu'en `08f` pour `create_project`.

`update_variant` fait l'inverse : elle **exige** que la base et la variante existent, et refuse de
créer quoi que ce soit.

## Terminé quand

- Depuis la pastille projet, on atteint la modification d'une base en deux clics.
- Les réglages sont préremplis avec les valeurs enregistrées, tunnel compris.
- Nom, environnement et moteur sont verrouillés, avec la raison en infobulle.
- Un mot de passe laissé vide n'écrase pas le secret ; un mot de passe saisi le remplace.
- `update_variant` refuse une base ou une variante inexistante, avec un message qui le dit.
- Modifier une base ouverte ferme sa connexion, vérifié sur le registre et non sur l'écran.
- Corriger le port d'une base injoignable la rend joignable après réouverture — le parcours
  complet, contre une vraie base.
- Aucune couleur littérale hors `tokens.json`.
