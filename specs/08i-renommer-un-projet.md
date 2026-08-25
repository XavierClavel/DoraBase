# 08i — Renommer un projet

## Objectif

Corriger le nom d'un projet. Aujourd'hui c'est impossible : une faute de frappe au moment de la
création (`08f`) est définitive, et la seule issue est de tout redéclarer.

## Dépend de

`05a` (le modèle et sa clé d'identité), `05b` (la persistance), `05c` (les secrets), `08f` (la
création), `08h` (le menu « … » qui ouvre cette action), `09b` (le registre de connexions).

## Périmètre

- Une commande `rename_project`, qui n'existe pas.
- La **migration des secrets** du Trousseau, car le nom du projet est dans leur référence.
- La fermeture des connexions ouvertes du projet, dont la clé de registre change.
- Une modale d'un seul champ, ouverte par « Renommer… » dans le menu de `08h`.

## Hors périmètre

- **Renommer une base.** `08g` l'a déjà tranché et verrouillé : son nom fait partie de la clé, et le
  changer demande les mêmes trois effets de bord pour un enjeu moindre. Si cette spec les résout
  proprement pour le projet, `08g` pourra être rouvert — mais pas dans le même commit.
  **C'est fait, en `26`** (25 août 2026) : la mécanique de `renommer_projet` y est reprise sur un
  seul secret, et le geste vit sur la ligne d'arbre plutôt que dans un formulaire.
- **Changer l'environnement actif.** Le sélecteur « ENV » de la barre de titre le fait déjà.
- **Fusionner deux projets** en leur donnant le même nom : le nom reste unique, un doublon est
  refusé.

## Approche

### Le nom d'un projet n'est pas une étiquette, c'est une clé

`projet/base/environnement` identifie une connexion dans le registre (`09b`) **et** un secret dans
le Trousseau (`05c`) — une seule identité, décision de `05a`. Renommer un projet n'est donc pas une
écriture d'un champ : c'est une migration.

Trois effets, dans cet ordre, et l'ordre compte :

1. **Écrire les nouveaux secrets d'abord, sans rien supprimer.** Un secret par base et par
   environnement : écrire le nouveau, vérifier qu'il se relit. **Aucun original n'est effacé à ce
   stade** — une première version les supprimait au fur et à mesure, et un magasin tombant en panne
   d'écriture à mi-parcours rendait alors la restauration impossible : les originaux étaient partis,
   et on ne pouvait plus les réécrire. Deux mots de passe perdus dans le pire cas.
2. **Fermer les connexions ouvertes** du projet : leur clé de registre n'existe plus. Elles se
   rouvriront sous la nouvelle, à la demande.
3. **Écrire la configuration** — c'est elle qui rend le renommage visible, et elle ne doit devenir
   vraie qu'une fois les secrets en place.
4. **Supprimer les originaux en dernier.** Un échec ici ne compromet rien : le renommage a eu lieu,
   et il reste un doublon dans le magasin — bénin, et bien préférable à un secret perdu. Dit à
   l'utilisateur plutôt qu'omis.

### Un secret absent n'est pas un secret illisible, et la distinction décide du sort du renommage

Un magasin qui **refuse** annule tout : quelque chose ne fonctionne pas, et continuer produirait un
état inconnu. Un secret simplement **introuvable** — effacé à la main, ou jamais écrit — laisse le
renommage se poursuivre : l'interrompre rendrait le projet *irrenommable*, exactement le piège qui
rendrait une déclaration indélébile en `08j`. La référence suit le nouveau nom, la base redemandera
son mot de passe, et l'écran le **dit** plutôt que de le taire.

### Un échec en cours de route ne doit pas laisser un projet à moitié renommé

Si un secret ne peut être déplacé, l'opération s'arrête et **remet en place ceux déjà déplacés**.
Le projet garde son nom, l'utilisateur voit la raison. Un projet dont trois bases sur cinq ont
migré serait pire que le refus : deux bases inutilisables et rien pour le dire.

C'est la raison pour laquelle cette spec est séparée de `08h` — le point d'entrée est trivial, la
garantie ne l'est pas.

### Le nom doit rester unique, et le refus se dit dans la modale

Deux projets homonymes rendraient les clés ambiguës. Un nom déjà pris est refusé, avec la phrase
dans la modale plutôt que dans une alerte — même dispositif que le refus de connexion de `08d`.
Renommer un projet en son propre nom est accepté sans rien faire, plutôt que refusé comme doublon.

## Terminé quand

- [ ] `rename_project` déplace les secrets, ferme les connexions, puis écrit la configuration.
- [ ] Un magasin qui **refuse** annule le renommage, et ce qui a déjà été écrit est retiré ; un
      secret simplement **introuvable** ne bloque pas, et est rapporté à l'écran.
- [ ] Un nom déjà pris est refusé, et la modale le dit ; le même nom est accepté sans effet.
- [ ] Après renommage, le secret **se relit sous le nouveau nom dans le vrai magasin chiffré**, pas
      seulement dans une `HashMap` de test. Formulé « vérifié sur PostgreSQL réel » à l'écriture de
      cette spec, ce qui visait à côté : la connexion ne dépend pas du renommage, seul le secret
      retrouvé en dépend — et un renommage qui passe sur une simulation et échoue sur le magasin
      réel est un renommage qui ne marche pas.
- [ ] Le projet renommé survit à un redémarrage.
- [ ] Un sabotage inversant l'ordre écriture/migration fait échouer un test.
