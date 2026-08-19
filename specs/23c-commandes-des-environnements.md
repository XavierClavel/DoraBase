# 23c — Les commandes des environnements

## Goal

Créer, renommer, recolorer, réordonner et supprimer un environnement d'un projet, depuis le front,
sans qu'aucun de ces gestes ne laisse une configuration incohérente.

## Scope

**Cinq commandes, une par geste**, plutôt qu'un `update_project` qui reçoit l'objet entier :

| Commande | Ce qu'elle garantit |
| --- | --- |
| `create_environment` | identifiant dérivé du libellé, unique dans le projet |
| `rename_environment` | le libellé change, **l'identifiant jamais** (`23a`) |
| `recolor_environment` | la couleur et le drapeau de production |
| `reorder_environments` | l'ordre d'affichage, qui est celui du sélecteur |
| `delete_environment` | voir `23f` : elle emporte les connexions, et le dit avant |

**Pourquoi cinq et non une.** Une commande qui reçoit la liste entière ne peut pas distinguer un
renommage d'une suppression suivie d'une création — or les deux ne font pas la même chose au trousseau.
La leçon est celle de `08i` : renommer un projet **déplace** ses mots de passe, et c'est le renommage
en tant que geste qui portait cette garantie.

**L'environnement actif suit.** Supprimer l'environnement actif rend actif le premier restant ; un
projet dont l'environnement actif ne désigne rien afficherait un arbre vide sans dire pourquoi.

**Un projet garde au moins un environnement.** Supprimer le dernier est refusé, avec sa raison : une
connexion appartient à un environnement (`23b`), donc un projet sans environnement ne peut plus rien
déclarer.

## Not in this scope

- **L'écran qui appelle ces commandes** : `23e`.
- **L'avertissement de suppression** : `23f`, qui décrit ce que `delete_environment` emporte.
- **Un environnement partagé entre projets** — chaque projet déclare les siens, y compris quand deux
  projets nomment le leur « prod ». Les mutualiser demanderait un référentiel global que rien ne
  réclame.

## Approach

Les cinq commandes passent par le même chemin que `08i` : lire la configuration, la modifier en
mémoire, valider le modèle, écrire atomiquement. La validation du modèle (`23a`) est ce qui refuse un
doublon d'identifiant — la commande ne le vérifie pas deux fois.

**`capabilities/default.json` ne bouge pas** : ce sont des commandes de l'application, pas des
permissions Tauri. Le garde de `tests/permissions.rs` reste vert sans modification, et c'est le signe
que cette spec n'ouvre aucune surface nouvelle vers le système.

## Done when

- [ ] Les cinq commandes existent, sont dans l'allowlist du front (`src/data/commandes.ts`) et testées
- [ ] Renommer conserve l'identifiant, et les mots de passe restent trouvables
- [ ] Supprimer l'environnement actif en désigne un autre
- [ ] Supprimer le dernier environnement est refusé avec sa raison
- [ ] Un identifiant en doublon est refusé par le modèle, pas par la commande
