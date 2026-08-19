# 24b — Le stepper informatif

## Goal

Une bande à deux entrées qui dit où l'on est dans le parcours de création. **Informative** : rien n'y
est cliquable, et elle n'en a pas l'air.

## Scope

**Deux entrées, numérotées** : « 1 · PROJET », « 2 · CONNEXION ». Pas de barre de progression, pas de
pourcentage.

**Trois états par entrée**, et l'état ne vit jamais dans la seule couleur :

| État | Pastille | Libellé |
| --- | --- | --- |
| à faire | fond `--muted`, encre `--ink-3`, le chiffre | `--ink-3` |
| en cours | fond `--accent`, encre `--ink-on-accent`, le chiffre | `--ink` |
| faite | fond `--success-bg`, la coche `check` | `--ink-2` |

**Ce qui rend l'absence de navigation lisible** est un ensemble d'absences, non un attribut :

- **Ni `<button>`, ni `<button disabled>`.** Un bouton désactivé dit « cliquable, mais pas
  maintenant », ce qui est faux ici. C'est un `<ol>` de `<li>`.
- **Pas de `cursor: pointer`, pas de `:hover`, pas d'anneau de focus, pas dans l'ordre de tabulation.**
  Ce sont les quatre marques que ce produit pose sur ce qui se clique ; leur absence est le message.
- **Pas de `role="tablist"`.** Un `tablist` promet la navigation aux flèches — la leçon du défaut
  n° 52, où un rôle ARIA annonçait une convention que le code ne tenait pas. Un `<ol>` promet un ordre,
  et rien d'autre.
- `aria-current="step"` sur l'entrée courante, et une phrase masquée par entrée : « Étape 1 sur 2,
  faite ». Un daltonien lit la coche ; une voix lit la phrase.

**Elle appartient à la grammaire des bandes du produit** : 34 px de contenu comme `--h-bar`, fond
`--bar`, filet bas `--divider` — les mesures de `TabStrip`, apparieés partout ailleurs. Aucun
`overflow` déclaré : le pixel du filet en `content-box` deviendrait sinon une barre de défilement
fantôme (défaut n° 69).

**Sa place** : premier enfant du corps de `Modal`, sous l'en-tête. Pas dans l'en-tête, qui porte déjà
la pastille, le titre — nom accessible de la boîte de dialogue — et la croix.

## Not in this scope

- **Toute navigation**, y compris un « Retour ». Le projet est écrit à la fin de l'étape 1 : revenir
  voudrait dire renommer un projet existant, ce qui est le geste de `23e`.
- **Une variante verticale.** Deux entrées dépenseraient 60 à 90 px de la dimension la plus rare pour
  en économiser 30 de la plus abondante. La question se reposera au-delà de quatre étapes.
- **Un réemploi hors de ce parcours.** Une propriété de `Modal` (`banner?`) serait une abstraction
  faite d'avance ; elle se justifiera au deuxième appelant.

## Approach

La bande est rendue par l'écran, dans le corps de la modale, et non par `Modal`. `Modal.body` porte
`padding: 0` — décision déjà documentée, précisément pour qu'un écran pose ses propres marges — donc la
bande peut être pleine largeur, filet compris, sans changer l'API de la primitive.

**Elle est absente quand on entre directement à l'étape 2** (ajouter une connexion à un projet
existant). Afficher « 1 · PROJET ✓ » affirmerait une étape que l'utilisateur ne vient pas de faire, et
laisserait croire que cette modale a créé le projet. Un stepper à une seule étape utile est un ornement
qui désinforme.

## Done when

- [x] La bande fait 35 px rendus, pleine largeur, collée à l'en-tête, sans jour entre les deux
- [x] Elle contient exactement deux entrées, et **aucun** `button`, `a`, `[role=button]` ni `[tabindex]`
- [x] Le curseur y est `auto`, et aucune règle de survol ne s'y applique
- [x] Une seule entrée porte `aria-current="step"`, et son texte accessible dit « Étape 2 sur 2 »
- [x] Le conteneur a le rôle `list`, non `tablist`
- [x] Elle est absente quand la modale est ouverte pour un projet existant
