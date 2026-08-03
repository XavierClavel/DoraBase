# 02 — Design system

## Objectif

Poser le socle visuel — tokens, polices, icônes, primitives — pour que chaque écran
suivant se contente de composer, sans jamais redécider une couleur ni une hauteur.
C'est la spec qui rend la fidélité au pixel tenable sur quinze écrans.

## Périmètre

- Le bundle de handoff versionné dans le repo, comme source de vérité durable.
- `tokens.json` : la transcription revue des tables du handoff.
- Génération de `tokens.css` et `tokens.ts` depuis `tokens.json`.
- Polices auto-hébergées : Baloo 2, Nunito, JetBrains Mono.
- Sprite d'icônes en trait + composant `<Icon>`.
- Primitives : bouton, champ, select, toggle, chip, badge, pastille.
- États dérivés : hover, focus clavier, désactivé.
- Galerie interne des primitives, en développement seulement.

## Hors périmètre

- Grille de données, arbre latéral, éditeur de code : ce sont des composants
  d'écran, pas des primitives. Respectivement `10`, `04`, `12`.
- Barre de titre et barre d'état → `03` et `07`.
- Thème « Nuit » et thème « Système » de l'écran A10. Les tokens sont nommés par
  rôle précisément pour les rendre possibles plus tard ; seul le thème « Cahier »
  est implémenté ici.
- Nuancier d'accent réglable par l'utilisateur → `15`.
- **Popover, tooltip, contrôle segmenté et stepper.** Aucun écran ne les utilise avant
  `08`, `09` et `10` : les construire ici figerait leur API sans le cas d'usage qui la
  contraint, donc obligerait à les refaire. Chacun rejoint la spec qui le réclame en
  premier — popover et tooltip en `10` (popover d'opérateur, tooltip de raccourcis
  d'édition), contrôle segmenté en `09` (Tables / Vues / Fonctions / Index), stepper en
  `10` (LIMIT).

## Approche

### Le handoff entre dans le repo

Le bundle est copié dans `design/handoff/` et versionné. Motif : il vit
actuellement dans `~/Downloads`, qui disparaîtra. Une spec qui pointe vers un
chemin hors du repo n'est pas relisable dans six mois.

### Une seule source de vérité, par génération et non par vérification

`tokens.json` transcrit les tables du handoff. Il est relu **une fois**, avec le
handoff ouvert à côté. Ensuite `tokens.css` et `tokens.ts` en sont **générés** par
`pnpm tokens:build`, et les fichiers générés sont commités.

La CI vérifie qu'ils sont à jour : `pnpm tokens:build && git diff --exit-code`.

Ce choix remplace l'idée d'un test qui comparerait `tokens.css` aux tables
markdown du handoff. Générer est plus robuste que vérifier : la dérive entre le CSS
et le TS devient structurellement impossible, l'effort de relecture se concentre
sur un seul fichier, et rien n'a besoin de parser du markdown.

### Tokens, nommés par rôle

Les **valeurs** sont dans le handoff (`design/handoff/README.md`, sections
« Design tokens »). Cette spec ne les recopie pas — ce serait une seconde source
de vérité, donc une dérive garantie. Elle fixe les **groupes et le nommage** :

| Groupe | Tokens |
| --- | --- |
| Surfaces | `canvas`, `paper`, `paper-alt`, `bar`, `field`, `muted`, `dark`, `dark-2` |
| Encre | `ink`, `ink-2`, `ink-3`, `ink-on-dark` |
| Traits | `border`, `border-field`, `divider`, `gridline` |
| Accent | `accent`, `accent-deep`, `accent-deeper` |
| Sémantique | `success`, `warn`, `danger`, `info`, `violet`, `gold` — déclinés en base, `-bg`, `-ink` **là où le handoff fournit la valeur** |
| Moteurs | `engine-pg`, `-my`, `-sq`, `-mg`, `-rd`, `-sf`, `-bq` — base et `-bg` |
| Syntaxe | `syn-keyword`, `-string`, `-number`, `-ident`, `-comment`, `-linenum` |
| JSON sur papier | `json-key`, `-string`, `-number`, `-punct` |
| Typographie | familles, tailles, graisses, interlignes, interlettrages |
| Espacement | `space-1` → `space-8`, sur l'échelle 3 · 5 · 6 · 7 · 9 · 11 · 14 · 16 |
| Rayons | `radius-badge`, `-control`, `-field`, `-panel`, `-window`, `-logo` ; suffixe `-2`/`-3` pour les valeurs secondaires d'un même rôle |
| Ombres | `shadow-window`, `-modal`, `-popover`, `-accent`, `-cell` |
| Hauteurs | ligne d'arbre, ligne de grille, petit bouton, bouton, champ, barre, barre de titre, barre d'état |

Trois tokens restent réglables à chaud, comme le prototype les expose :
`--accent`, `--rowh`, `--gridline`.

Quatre pièges de nommage, relevés à la relecture croisée :

- **`text-meta` vaut 10 px**, alors que la table du handoff écrit « 11 px (méta), 10 px
  (compteurs) ». C'est la prose des écrans qui a été suivie — « métadonnée mono 10 px » —
  et elle est plus précise que la table. Qui lirait la seule table prendrait `text-meta`
  en croyant obtenir 11 px : c'est `text-label` qu'il faut alors.
- **`radius-field` couvre trois rôles** du handoff : bouton, champ et carte. Le nom n'en
  retient qu'un, `radius-control` étant déjà pris par « petit contrôle ». Un rayon de
  bouton, c'est donc `radius-field`.
- **`text-title` est le titre de *modale*** (14,5 px). La barre de titre de la fenêtre
  utilise `text-wordmark` (13 px). Le mot « title » attirera la main au mauvais endroit en
  écrivant la `TitleBar` de `07`.
- **Deux interlettrages seulement sont tokenisés**, ceux des tables. La maquette en emploie
  sept valeurs distinctes (.2 à .7 et 2 px) : les micro-labels à 9 px et les valeurs mono
  espacées rencontreront donc des littéraux. C'est conforme au périmètre — on transcrit les
  tables, pas la maquette — mais mieux vaut le savoir avant d'écrire les composants que de
  le contourner en les écrivant.

**La transcription ne couvre que les tables « Design tokens » du handoff.** Sa section
« Écrans » contient d'autres valeurs littérales — teintes ambre de l'édition inline
(`#FDF6E8`, `#FBEFD6`, `#E9A82B`), rayons 2 et 3 px des poignées de redimensionnement,
dégradé radial du fond d'accueil, voile `rgba(35,32,28,.28)` des modales, `#DCD6CB` des
feux grisés. Chacune revient à la spec d'écran qui la réclame, qui **ajoutera son token**
plutôt que d'écrire un littéral. Ne pas les transcrire ici : elles n'ont de rôle que dans
leur contexte.

### Icônes : récupérées, pas redessinées

Le mockup contient déjà 47 symboles `i-*` plus le logo, écrits à la spec du
handoff (`viewBox 0 0 24 24`, `fill: none`, stroke 1.8–2.2, extrémités arrondies).
Les tracés sont extraits tels quels vers `src/design/icons/sprite.svg`.

Le composant `<Icon name size />` rend un `<use>` et hérite de la couleur par
`stroke: currentColor`. Le type `name` est dérivé du sprite, donc une icône
inexistante est une erreur de compilation.

### Polices

Baloo 2, Nunito et JetBrains Mono en woff2 dans `src/design/fonts/`, déclarées en
`@font-face` avec `font-display: block` — un rendu court en police de substitution
décalerait toute la grille dense. Sous-ensembles latin et latin-ext. Licence SIL
OFL, dont le texte est versionné à côté des fichiers.

Aucune requête réseau : la contrainte est déjà posée en `01` et vérifiée ici.

### Primitives et états

Chaque primitive est une fonction des tokens, jamais d'une valeur littérale. Les
variantes suivent celles observables dans les maquettes : bouton en accent, en
encre `#23201C`, secondaire bordé, fantôme ; tailles 23–25 px et 28–31 px.

Les états ne sont pas maquettés, le handoff dit de les dériver. On applique ses
règles telles quelles : hover de ligne à `rgba(35,32,28,.05)`, hover de bouton
secondaire à bordure renforcée sur fond `#FFFDF8`, focus clavier en anneau de 2 px
d'accent à 45 %. L'état désactivé reprend `muted` et `ink-3`.

### Galerie

`src/design/gallery/` rend toutes les primitives dans tous leurs états sur une
page unique, accessible en développement seulement. C'est l'outil qui permet de
juger une primitive isolément plutôt que de la découvrir au milieu d'un écran.

## Terminé quand

- `pnpm tokens:build` est idempotent, et la CI échoue si les fichiers générés ne
  sont pas à jour.
- Chaque valeur de couleur, taille, rayon et ombre des tables du handoff a son
  token, vérifié à la relecture croisée.
- Aucune valeur littérale de couleur ou d'espacement hors de `tokens.json`, hormis
  les cas que le handoff exprime lui-même en littéral local.
- Les 47 icônes et le logo sont dans le sprite et rendus par `<Icon>` ; un nom
  invalide ne compile pas.
- La galerie affiche toutes les primitives dans les états normal, survolé, focus
  et désactivé.
- Les polices s'affichent hors ligne, sans clignotement de substitution.
