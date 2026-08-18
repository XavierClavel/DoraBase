# 15b — `A10` : l'apparence

## Goal

Le thème — Cahier, Nuit, Système — et la couleur d'accent.

## Dépend de

`15a`, `02` (les jetons).

## Scope

- Trois thèmes : clair (« Cahier »), sombre (« Nuit »), et « Système » qui suit l'OS.
- La couleur d'accent, choisie dans une palette fermée.
- L'application **immédiate**, sans rechargement.

## Not in this scope

- **Un thème personnalisé.** Choisir chaque jeton est un éditeur de thème, pas une préférence.
- **Le thème sombre lui-même.** Voir § Approche : cette spec livre le **mécanisme** et le réglage ;
  les valeurs sombres des cent jetons sont un travail de design qui n'a pas eu lieu.

## Approche

### Le mécanisme d'abord, les valeurs ensuite

`02` a produit `tokens.css` depuis `tokens.json` : une centaine de jetons, tous clairs. Un thème
sombre demande une seconde valeur pour chacun — un travail de design, pas d'implémentation, et le
handoff ne le fournit pas.

Cette spec livre donc : le réglage, sa persistance, l'attribut `data-theme` sur la racine, et la
bascule automatique sur `prefers-color-scheme` pour « Système ». **« Nuit » restera visuellement
incomplet** tant que les valeurs sombres n'existent pas, et l'écran le dit plutôt que de laisser
découvrir un écran à moitié illisible.

C'est le seul endroit du projet où une préférence est livrée avant ce qu'elle règle, et c'est assumé :
l'alternative — cacher le réglage — cacherait aussi la raison de son absence.

### L'accent est une palette fermée

Un sélecteur de couleur libre permet un accent illisible sur le fond du produit. Le mockup montre six
pastilles ; la palette est donc fermée, et chaque entrée vient de `tokens.json`.

**L'accent teinte aussi la connexion active**, dit le mockup. C'est une conséquence à vérifier : le
point de la pastille projet et le liseré de l'onglet actif emploient `--accent`.

## Done when

- [ ] Les trois thèmes se choisissent, et le réglage survit à un redémarrage.
- [ ] « Système » suit `prefers-color-scheme`, sans rechargement.
- [ ] L'écran dit que « Nuit » est incomplet tant que les jetons sombres n'existent pas.
- [ ] Changer l'accent change le point de la pastille projet — mesuré.
- [ ] Aucune couleur littérale hors `tokens.json`.
