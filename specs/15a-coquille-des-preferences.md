# 15a — `A10` : la coquille des préférences

## Goal

L'écran de préférences : sa modale, ses sept sections, et la persistance de ce qu'on y règle.

## Dépend de

`05b` (la configuration versionnée), `08a` (`Modal`).

## Scope

- La modale de préférences, sa sidebar de sections, son pied — « Réinitialiser », « Terminé ».
- Un modèle de préférences persisté, distinct des projets.
- Le numéro de version affiché — `DoraBase 0.4.2 (arm64)`.
- Les sections vides annoncent ce qu'elles porteront.

## Not in this scope

- **Apparence** → `15b`. **Grille** → `15c`. **Garde-fous** → `15d`.
- **Éditeur SQL, Connexions, Raccourcis** : trois sections du mockup dont le contenu n'a pas encore
  d'objet à régler. Elles existent et le disent.
- **La synchronisation entre postes.** Les préférences sont locales, comme la configuration.

## Approche

### Les préférences ne sont pas des projets

`05b` persiste `{ version, projects }`. Les préférences y ajoutent une section — pas un champ de
projet : un thème n'appartient pas à une base. Comme `12f`, le champ porte `serde(default)` : une
configuration écrite avant `15a` se lit sans préférences, ce qui donne les valeurs par défaut. Pas de
migration.

### « Les préférences s'appliquent immédiatement »

C'est la phrase du mockup, et elle engage : pas de bouton « Appliquer ». Chaque réglage écrit et prend
effet, ce qui interdit un formulaire tampon. « Terminé » ferme, il ne valide pas — et « Réinitialiser »
remet les valeurs par défaut, avec confirmation puisque c'est destructif pour les réglages.

### Une section sans contenu dit ce qu'elle portera

Trois des sept sections n'ont rien à régler aujourd'hui. Les cacher ferait croire à une interface plus
pauvre qu'elle ne sera ; les laisser vides ferait croire à un défaut. Elles annoncent leur objet — la
règle de `09f`, appliquée à une section plutôt qu'à un bouton.

## Done when

- [ ] La modale s'ouvre, ses sept sections sont listées, et la navigation change de panneau.
- [ ] Un réglage survit à un redémarrage.
- [ ] Une configuration écrite **avant** cette spec se lit encore, avec les valeurs par défaut.
- [ ] « Réinitialiser » demande confirmation et remet les défauts.
- [ ] Les sections sans contenu disent ce qu'elles porteront.
