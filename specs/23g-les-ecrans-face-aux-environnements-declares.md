# 23g — Les écrans face aux environnements déclarés

## Goal

L'arbre, la barre de titre et les garde-fous d'écriture cessent de connaître trois environnements
codés en dur.

## Scope

**Le sélecteur de la barre de titre** liste les environnements du projet courant, dans leur ordre
déclaré, avec leurs libellés et leurs couleurs (`23a`). Un projet à cinq environnements en montre
cinq ; à un seul, le sélecteur reste affiché — le retirer ferait disparaître l'information « on est en
dev » au moment où elle compte le plus, sur un projet qui n'a que la production.

**Il devient actif.** Jusqu'ici, `onValueChange` était vide : changer d'environnement ne faisait rien.
Il écrit désormais l'environnement actif du projet, et l'arbre se recharge sur les connexions de cet
environnement (`23b`).

**L'arbre** liste les connexions de l'environnement actif. Un environnement sans connexion le dit —
« aucune connexion déclarée en *staging* » — plutôt que d'afficher un projet vide, qui se lit comme un
chargement en cours (le doute du défaut de `06d`).

**Les garde-fous d'écriture** (`11d`) et l'encart rouge de production s'accrochent au **drapeau**
`production` de la déclaration, jamais à son libellé. Un environnement nommé « live » et marqué
production est protégé ; un environnement nommé « prod » et non marqué ne l'est pas — et c'est
l'utilisateur qui a décidé.

## Not in this scope

- **L'édition des environnements** : `23e`.
- **Mémoriser l'environnement actif par fenêtre** plutôt que par projet : il est déjà persisté au
  projet (`05b`), et rien ne demande autre chose.
- **Une couleur de connexion propre**, indépendante de son environnement. La couleur *est* celle de
  l'environnement, ce qui est précisément ce qui la rend lisible.

## Approach

Un seul point de vérité : la déclaration d'environnement du projet. Les écrans la reçoivent au lieu de
l'importer depuis `environments.ts`, qui portait le trio en dur — ce fichier disparaît, sans quoi il
resterait une seconde source, celle qu'on oublie de corriger.

**Les décors de test et la démo suivent.** La démo déclare ses environnements comme un vrai projet, et
les tests qui écrivaient `environment: 'prod'` passent par la déclaration. C'est ce qui garantit
qu'aucun écran ne relit le trio en dur : s'il en restait un, un décor à quatre environnements le
mettrait en évidence — et le décor en aura quatre.

## Done when

- [ ] Le sélecteur liste les environnements du projet, dans l'ordre déclaré, avec leurs couleurs
- [ ] En changer recharge l'arbre sur les connexions de cet environnement, et le persiste
- [ ] Un environnement sans connexion se dit, plutôt que de laisser un projet vide
- [ ] Les garde-fous suivent le drapeau `production`, et un test le prouve sur un environnement nommé
      autrement que `prod`
- [ ] `environments.ts` et son trio en dur n'existent plus
- [ ] Le décor de démo déclare quatre environnements
