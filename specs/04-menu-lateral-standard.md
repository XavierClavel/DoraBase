# 04 — Menu latéral standard (A5 → A9)

## Objectif

Construire les briques présentationnelles de la sidebar partagée par les cinq
écrans de travail `A5` à `A9` : barre de filtre, ligne d'arbre, section
contextuelle de colonnes, pied de console. `README.md` § « Menu latéral
standard » dit qu'ils partagent *exactement* le même composant — le construire
une fois évite cinq divergences.

## Dépend de

`01`, `02`, `03` (bande d'onglets et poignée déjà en place à côté).

## Périmètre

- `SidebarFilterBar` : loupe, texte (contrôlé), compteur `n/m` à droite.
- `TreeRow` : une ligne d'arbre — profondeur (0 à 3, mappée aux paliers
  d'indentation du mockup), chevron ouvert/fermé optionnel, icône colorée,
  libellé, poids, métadonnée ou badge de fin de ligne, état sélectionné.
- `ColumnRow` : une ligne de colonne dans la section contextuelle — glyphe de
  type (icône clé/FK ou lettre), libellé, métadonnée colorée selon l'état
  (normal, filtré, trié).
- Titre de section contextuelle (bandeau 18px, uppercase).
- `ConsoleFooterButton` : bouton 26px « + Nouvelle console ».
- `Sidebar` : assemblage de ces briques en colonne 212px, sans logique — les
  lignes lui arrivent déjà construites.
- Entrées dans la galerie de développement.

## Hors périmètre

- **La sidebar de `A4`.** Elle fait 252px, affiche toutes les bases du projet, et
  sa barre de filtre a un bouton `+` plutôt qu'un compteur — un composant
  différent, pas une variante. Elle appartient à la spec qui construit
  l'explorateur (`09`).
- **L'état de l'arbre** : quels nœuds sont ouverts, quelle ligne est
  sélectionnée, la traversée récursive d'un modèle projet/base/schéma/table.
  `Sidebar` reçoit une liste de `TreeRow` déjà aplatie et positionnée ; c'est
  l'écran consommateur (`10`, premier écran à utiliser cette sidebar) qui
  détient l'état et construit la liste à chaque rendu.
- **Les données réelles.** Aucun modèle de domaine n'existe encore (`05`).
  Toutes les valeurs utilisées ici (noms, tailles, comptages) sont des données
  de démonstration dans la galerie, jamais persistées.
- **Le pied "+ Ajouter une base"** de `A4` — appartient à `09`, pas au pied
  console de ce spec.

## Approche

### Valeurs, relevées dans le mockup A5

Références de lignes dans `design/handoff/DoraBase.dc.html`, autour de la
première occurrence de la sidebar 212px.

**Colonne** — largeur 212, fond `--paper-alt`, filet droit `--divider`,
`font: 600 11.5px Nunito`.

**Barre de filtre** — hauteur 34 (existe déjà : pas de nouveau token, à vérifier
contre `--h-bar` si la valeur coïncide), filet bas `--divider-2`, loupe 12px
`--ink-4`, texte tapé et compteur mono `10px` en `rgba(35,32,28,.35)` —
c'est `--ink-3`, déjà tokenisé, pas `--ink-5` (.3).

**Ligne d'arbre**, hauteur 22 (`--h-tree-row`), `padding: 0 8px` au palier 0,
puis `+14px` par palier (`22`, `36`, `52`) — indentation portée par le
`padding-left`, pas par un `margin` d'enfant, pour que le fond de sélection
reste plein-largeur. Chevron 11px `rgba(35,32,28,.45)`, soit `--ink-meta`
(le rôle déjà établi en `07` pour cette teinte précise — icônes de barre,
métadonnées), tourné 90° si ouvert. Icônes : sac à dos actif `--accent-deep`,
base par moteur (`--engine-*`), schéma `--accent-deep`, table `--success-base`
12px — même couleur, sélectionnée ou non. Ligne non sélectionnée : texte
`rgba(35,32,28,.75)`, une teinte absente des tokens actuels mais présente
**47 fois** dans le mockup (comptée), toujours sur du texte de ligne lisible
— au-dessus du seuil de fréquence retenu en `02` pour justifier un nouveau
token (`--ink-meta` avait été ajouté à 51 occurrences). Projets voisins
repliés : même texte `.75`, icônes ramenées à `--ink-meta`, badge `n bases`
`700 9.5px` en `--ink-3`.

**Ligne sélectionnée** — fond `color-mix(in oklab, var(--accent) 22%,
transparent)`, `box-shadow: inset 2px 0 0 var(--accent)`, texte `--ink` `700`.
Confirmé sur le mockup lui-même (ligne `orders` sélectionnée dans `A5`) :
correspond mot pour mot à la prose du `README.md`, contrairement à la sélection
qu'affiche la sidebar spécifique de `A4` (10 % de fond + filet gauche) — encore
un signe que ce sont deux composants distincts.

**Section contextuelle** — bandeau 18px, `700 9.5px` uppercase
`letter-spacing .6px` en `--ink-3` (.35, pas .3). Lignes de colonne 20px,
`padding: 0 8px 0 14px`, `500 11px` mono, texte `rgba(35,32,28,.7)` — une
seconde teinte hors tokens, **50 occurrences comptées**, distincte du `.75`
des lignes d'arbre malgré la proximité visuelle : deux littéraux voisins, pas
un seul réutilisé par erreur d'arrondi. Glyphe de type : icône 11px (clé
`--gold`, FK `--info-base`) ou lettre centrée `--ink-5` (.3, celui-ci exact).
Métadonnée à droite : `--ink-3` au repos, `--accent-deep` si la colonne est
filtrée (« filtré ») ou triée (« tri ↓ »). La ligne de résumé (« + n autres »)
retombe à `rgba(35,32,28,.5)` — **61 occurrences comptées**, troisième teinte
hors tokens, plus atténuée, cohérente avec son rôle de ligne non interactive.

Trois teintes d'encre à ajouter aux tokens (`.75`, `.7`, `.5`), nommées au
moment de l'implémentation plutôt qu'ici — cf. `plans/2026-08-05-04-*.md`.

**Pied console** — 26px, `700 11px` Nunito, icône `i-plus` 13px, texte
« + Nouvelle console », `--ink-2`.

### Composition

Chaque brique est un composant pur, sans état interne — même logique que les
primitives de `02`. `Sidebar` empile `SidebarFilterBar` puis une zone
défilante qui reçoit `children` (l'écran y place ses `TreeRow` et, en fin de
liste, le titre de section + ses `ColumnRow`), puis optionnellement
`ConsoleFooterButton`. Aucune récursion, aucun arbre de données typé : ce
serait deviner la forme qu'imposera `10`, alors qu'elle n'existe pas encore.

## Terminé quand

- Les cinq briques rendent, pixel pour pixel, les valeurs ci-dessus pour
  chacun de leurs états (ligne normale, sélectionnée, repliée ; colonne
  normale, filtrée, triée).
- `Sidebar` composé avec une dizaine de lignes de démonstration atteint 212px de
  large sans dépasser, comparé au mockup `A5`.
- Le survol de ligne utilise `--hover-row`, déjà tokenisé en `02` pour cet
  usage précis.
- Le parcours clavier atteint chaque `TreeRow` interactive et `ColumnRow`
  cliquable (tri/filtre), anneau de focus visible.
- Toutes les briques sont visibles dans la galerie de développement, avec leurs
  trois états de ligne d'arbre.
- Les trois teintes `.75`, `.7` et `.5` ont rejoint `tokens.json` sous un nom
  définitif ; plus aucun littéral de couleur hors fichier de tokens dans les
  briques de cette spec.
