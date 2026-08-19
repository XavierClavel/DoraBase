# 24d — Deux gestes : « Nouveau projet » et « Nouvelle connexion »

## Goal

Créer un projet et déclarer une connexion deviennent deux gestes distincts, offerts là où l'on regarde
l'un et l'autre.

## Scope

| Geste | D'où il part | Où il mène |
| --- | --- | --- |
| **Nouveau projet** | `A1` : le bouton du hero et le pied de la sidebar ; `A4` : le pied de la sidebar | étape 1, puis 2 |
| **Nouvelle connexion** | `A4` : le pied de la sidebar, et le menu de la pastille projet | étape 2 seule, projet imposé par le contexte |

**Le pied de la sidebar de `A4` porte donc deux actions de création.** C'est déjà là que vit « Ajouter
une base », et la sidebar est l'endroit où l'on regarde ses projets.

**« Nouvelle connexion » sans aucun projet entre à l'étape 1**, avec la raison écrite : « Une connexion
appartient à un projet. Commençons par le projet. » Le parcours aboutit là où l'utilisateur voulait
aller ; il passe seulement par ce qui manquait. Aujourd'hui, `08e` désactive l'enregistrement et le
`Select` dit « Aucun projet » — le minimum défendable, en attendant cette décision.

**« Ajouter une base » devient « Ajouter une connexion »** — tranché le 19 août 2026. Depuis `23b`, ce
qu'on ajoute est une connexion : une base présente en dev et en prod en fait deux. Le mot juste aligne
le bouton sur le titre de la modale. **Écart au handoff assumé**, qui dit « base » ; il touche le pied
de la sidebar, le menu de la pastille projet, et les tests qui nomment ces contrôles.

**`⌘N` est « Nouveau projet », sur tous les écrans**, et `⇧⌘N` « Ajouter une connexion ».

Tranché par le commanditaire le 19 août 2026, contre la recommandation de la conception UX — qui
proposait de suivre la fréquence, `⌘N` devenant « Nouvelle connexion » sur `A4`. Un raccourci qui
change de sens selon l'écran demande de savoir sur quel écran on est **avant** de le presser ; la
fréquence ne rachète pas cette charge. Le geste le plus courant est le second raccourci, et c'est
assumé.

## Not in this scope

- **Les deux modales** : `24a` et `24c`.
- **Un écran de gestion des projets.** `A10` n'en montre pas, et `23e` couvre l'édition.
- **La suppression d'un projet** : `08j`, déjà livrée.
- **Un raccourci global de la barre de menus macOS.** Les raccourcis vivent dans la page, comme
  `⌘E` et `⌘↩` avant eux.

## Approach

Les deux gestes appellent la même modale, avec ou sans étape 1 : c'est le paramètre d'entrée qui décide,
et le stepper qui en découle (`24b`). Une seconde modale aurait deux formulaires de connexion à tenir.

## Done when

- [ ] `A1` et le pied de la sidebar de `A4` offrent « Nouveau projet »
- [ ] Le pied de la sidebar et le menu de la pastille offrent « Ajouter une connexion »
- [ ] « Nouvelle connexion » sans projet ouvre l'étape 1, avec sa raison écrite
- [ ] Aucun libellé ne dit plus « base » là où il s'agit d'une connexion
- [ ] `⌘N` ouvre « Nouveau projet » sur `A1` **et** sur `A4` ; `⇧⌘N` ouvre « Ajouter une connexion »
