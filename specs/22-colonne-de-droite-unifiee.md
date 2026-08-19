# 22 — La colonne de droite unifiée, et le couple de vues dans son en-tête

## Goal

Le couple « Données / Structure » quitte la bande d'onglets pour l'en-tête de la colonne de droite,
où il reste visible en permanence. Cette colonne devient le seul endroit où l'on regarde *le détail*
de ce que le centre affiche : la ligne sélectionnée en vue Données, le DDL en vue Structure.

## Scope

**Un en-tête de colonne, permanent.** Il porte le couple de vues à gauche, et les flèches de
navigation entre lignes à droite quand elles ont un sens. Il appartient au **cadre** de la colonne,
pas à son contenu : basculer de vue ou éditer ne le fait pas disparaître.

**Le corps de la colonne, trois cas et rien de plus :**

| Vue | Ce que montre le corps |
| --- | --- |
| Structure | le DDL de la table, avec sa réserve et ses actions (`14c`) |
| Données, une ligne sélectionnée | le détail de la ligne — Champs, JSON, Liens (`10f`) |
| Données, rien de sélectionné | **rien** |

**Trois retraits.**

1. Le couple disparaît de la bande d'onglets, avec la propriété `vue`/`onVueChange` de
   `WorkbenchTabs` — un composant ne garde pas une entrée devenue sans objet.
2. « Ligne 5 · id 041ff6ac… » disparaît de l'en-tête. Le rang est déjà dans la gouttière `#` de la
   grille, sur la ligne surlignée ; l'identifiant est la première valeur du corps juste dessous. La
   ligne répétait donc deux informations visibles à trois centimètres, et son identifiant long
   poussait les flèches hors de l'en-tête.
3. `StructureView` perd sa colonne de DDL : la structure rejoint le partage au lieu d'occuper toute
   la largeur du centre.

**La vue Structure passe dans le partage.** Elle était rendue seule, comme une console, parce
qu'elle portait son propre DDL à droite. Ce DDL étant maintenant dans la colonne commune, la
structure devient un centre ordinaire — et sa largeur se règle avec la même poignée que la grille.

## Not in this scope

- **Les consoles gardent toute la largeur.** Une console n'a ni ligne sélectionnée ni structure : la
  colonne de droite lui proposerait deux vues d'un objet qui n'existe pas. Décision de `12a`,
  inchangée.
- **La vue A4** (aucune table ouverte) garde son panneau de détail d'objet, sans couple de vues :
  il n'y a pas de table dont on basculerait la structure.
- **Le panneau des modifications en attente** (`11c`) continue de prendre le corps de la colonne en
  vue Données — mais **sous** l'en-tête désormais, donc sans faire disparaître le couple.
- La largeur du DDL. Le mockup d'`A9` lui donnait 393 px ; il hérite des 296 px de la colonne, et de
  sa poignée. Un écart au handoff, assumé ici, et le prix de l'unification.

## Approach

Un cadre `ColonneDroite` rend l'en-tête et délègue le corps. Il reçoit la vue courante et de quoi la
changer ; les flèches restent optionnelles, et n'apparaissent qu'avec un rang et un total.

`RowPanel` perd son `<header>` entier — pas seulement son titre : ses flèches remontent dans le
cadre, faute de quoi la colonne afficherait deux barres de chrome empilées là où la capture n'en
montre qu'une.

Le DDL sort de `StructureView` dans un `DdlPanel` autonome, qui reçoit le `TableDetail` et
l'ouverture dans la console. Aucune lecture nouvelle : c'est le `detail` que la sidebar, le centre et
la colonne lisent déjà.

## Done when

- [x] La bande d'onglets ne porte plus le couple, et `WorkbenchTabs` n'en a plus la propriété
- [x] Le couple est dans l'en-tête de la colonne de droite, et y reste en basculant de vue, en
      sélectionnant une ligne, et en éditant
- [x] L'en-tête ne porte plus ni rang ni identifiant ; les flèches restent atteignables
- [x] En vue Structure, la colonne montre le DDL ; le centre montre les colonnes, index et
      contraintes sur toute sa largeur, dans le partage
- [x] En vue Données sans sélection, le corps est vide
- [x] Une console n'a pas de colonne de droite
- [x] Une mesure vérifie que l'en-tête survit aux trois basculements, et que le DDL n'est plus dans
      le centre
