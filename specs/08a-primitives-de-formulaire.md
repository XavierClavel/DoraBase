# 08a — Primitives de formulaire et de modale

## Objectif

Ajouter les quatre primitives que `A2` réclame et que `02` n'a pas livrées, pour que
`08b` n'ait plus qu'à assembler. Livrées avec leur entrée de galerie, donc vérifiables
sans écran.

## Dépend de

`02` (tokens, `Field`, `Toggle`, `Button`, `Badge`), `03` (rien directement, mais la
modale se superpose à la coquille).

## Périmètre

- **`Modal`** : voile, coquille, en-tête à pastille et croix, pied, fermeture par `esc`,
  piège de focus, restitution du focus à la fermeture.
- **`Select`** : le champ à chevron de `A2` — mode SSL, projet.
- **`CollapsiblePanel`** : l'encadré à chevron du panneau proxy de `A2`.
- **`RadioGroup`** : le groupe de boutons exclusifs — moteur, variante d'environnement.
- Les jetons manquants : `--veil` et `--veil-2` (les deux voiles superposés de `A2` et
  `A3`), `--danger-ink-3` (`#C6321E`, la ligne de cause du log de `A3`), et
  `--border-dashed` (le seul pointillé du handoff, sur le port local de `08c`).

## Hors périmètre

- **Popover et tooltip** : `A2` n'en a aucun. Ils reviennent en `10` (popover
  d'opérateur de filtre) et seront écrits là, contre l'écran qui les réclame.
- **L'assemblage de `A2`** → `08b`. Ce scope livre des briques et une galerie.
- **La sous-modale de `A3`** → `08d`. `Modal` doit pouvoir en porter une, mais son
  contenu et son comportement appartiennent à l'échec de connexion.
- **`Select` à liste déroulante custom.** Le mockup ne montre que l'état fermé. Un
  `<select>` natif habillé suffit, et hérite gratuitement du clavier et de
  l'accessibilité. Si un écran ultérieur exige une liste stylée, ce sera sa spec.
- **Toute animation.** Le handoff n'en spécifie aucune.

## Approche

### `RadioGroup` clôt la dette du `Chip` interactif

`REPRISE.md` § 9 laissait ouverte la forme du `Chip` interactif, à trancher « contre un
écran réel avant de construire `08` ». L'écran a répondu : **le sélecteur de moteur de
`A2` n'a pas de croix de suppression**. Monogramme, libellé, et fond accent quand actif.
C'est un groupe radio, pas un chip supprimable.

`RadioGroup` rend donc de vrais `<button>` frères dans un conteneur `role="radiogroup"`,
avec `aria-checked` — natifs au clavier, sans la gymnastique de `div[role=button]`. La
dette du `Chip` reste ouverte pour l'écran qui aura vraiment besoin d'une croix.

### Le piège de focus est la seule partie non triviale

Une modale qui laisse le focus s'échapper vers la fenêtre derrière est inutilisable au
clavier, et le handoff impose `esc`. Trois exigences, toutes vérifiables :

1. Au montage, le focus va au premier élément focalisable de la modale.
2. `Tab` depuis le dernier revient au premier ; `Shift+Tab` depuis le premier va au
   dernier.
3. Au démontage, le focus revient à l'élément qui l'avait avant l'ouverture.

Le troisième point est celui qu'on oublie : sans lui, fermer une modale au clavier
laisse le focus sur `<body>` et la navigation repart du haut de la page.

### Ce que jsdom ne peut pas dire

`04` a coûté quatre défauts de mise en page invisibles en test unitaire. La leçon
s'applique ici : **la superposition, la taille de la coquille et le centrage de la
sous-modale sont hors de portée de Vitest.** Ils vont dans `e2e/`, pas dans un test qui
mesurerait zéro.

Ce qui reste testable en Vitest : le focus, `esc`, `aria-checked`, l'état replié du
panneau, la valeur du `Select`.

### Les valeurs, prises du mockup

| Élément | Valeur |
| --- | --- |
| Voile | `rgba(35,32,28,.28)` |
| Coquille | 820 px, radius 14 px, `--paper`, bordure `1px rgba(35,32,28,.14)` |
| Ombre coquille | `0 30px 70px -18px rgba(35,32,28,.55)` |
| Position | alignée en haut, `padding-top: 34px` — **pas centrée verticalement** |
| En-tête | 44 px, fond blanc, pastille 24 px radius 8 px, titre 14.5 px Baloo 2 |
| Pied | 56 px, fond blanc |
| Bouton radio | 30 px, radius 9 px ; actif = fond accent, texte blanc, ombre `0 4px 10px -4px` |
| Bouton radio inactif | fond blanc, bordure `1px rgba(35,32,28,.14)`, texte `rgba(35,32,28,.7)` |
| Panneau repliable | radius 11 px, fond `--paper-alt`, en-tête 34 px |
| `Select` | comme `Field` 30 px, plus un chevron 13–14 px `rgba(35,32,28,.4)` à droite |

### Un trou du handoff, à ne pas combler par invention

Le mockup ne montre les boutons d'environnement que dans un seul état : `dev` et
`staging` inactifs, `prod` actif **et rouge**. Le rouge vient de « prod », pas de
« actif » — la prose du handoff le confirme en le décrivant comme une propriété de
prod. Mais **rien ne dit à quoi ressemble un `dev` actif.**

`RadioGroup` livre donc l'état actif générique (fond accent, comme le sélecteur de
moteur), et `08b` applique par-dessus l'habillage rouge propre à `prod`. La question
est consignée dans `specs/README.md` § « À trancher » plutôt que tranchée en douce.

## Terminé quand

- Les quatre primitives existent avec leur entrée de galerie.
- Le focus entre, tourne en boucle, et **revient à son origine** à la fermeture — les
  trois vérifiés séparément.
- `esc` ferme ; un clic sur le voile ferme ; un clic dans la coquille ne ferme pas.
- `RadioGroup` expose `role="radiogroup"` et `aria-checked`, et se pilote aux flèches.
- `CollapsiblePanel` replié n'a pas son contenu dans l'arbre d'accessibilité.
- Aucune couleur littérale hors `tokens.json`, garde-fou `tokens:check` vert.
- **`#DCD6CB` n'est pas ajouté** : voir la note de `08b` sur les feux.
- Les trois faits de mise en page que jsdom ne voit pas sont dans `e2e/`.
- Un sabotage de chacune des trois exigences de focus fait échouer un test distinct.
