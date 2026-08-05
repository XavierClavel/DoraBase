# 03 — Coquille : panneaux redimensionnables et bande d'onglets

## Objectif

Construire les deux mécaniques génériques que tous les écrans de travail (`09` à
`14`) partagent : des panneaux redimensionnables avec largeur persistée, et une
bande d'onglets réordonnable et fermable. Sans elles, chaque écran réinventerait
son propre redimensionnement.

## Dépend de

`01` (socle) et `02` (tokens, primitives).

## Périmètre

- `SplitPane` : primitive à deux zones (début/fin), séparées par une poignée de
  redimensionnement à la souris et au clavier, taille persistée en `localStorage`.
- `TabStrip` : bande d'onglets générique — icône, libellé, suffixe optionnel,
  bouton de fermeture, réordonnancement par glisser, état actif.
- Icône `i-term` (console) ajoutée à la barre de titre, à côté de celle des
  préférences déjà présente depuis `07`. Générique et inerte : aucun écran de
  travail n'existe encore pour la câbler.
- Entrées dans la galerie de développement pour les deux primitives.

## Hors périmètre

- **Le contenu réel des panneaux** — arbre de projets, grille, éditeur SQL. Chaque
  panneau reçoit ses enfants par `children`, sans rien connaître de leur nature.
  → `04`, `09`, `10`…
- **La pastille centrale de la barre de titre** (projet actif, sélecteur
  d'environnement, fil d'Ariane) — dépend du modèle de domaine (`05`) et n'existe
  dans le mockup qu'à partir de `A4`. La construire ici serait spéculatif : voir
  `AGENTS.md` sur les giga-specs et `REPRISE.md` § 9 sur les valeurs inventées.
- **Persistance de l'état des onglets** (lesquels sont ouverts, dans quel ordre)
  entre deux lancements de l'app. Le handoff ne dit rien de plus que « largeurs
  persistées par écran » (`README.md` l. 325-326) pour les panneaux ; les onglets,
  eux, ne sont pas dits persistants.
- **Navigation** : quel écran ouvre quel onglet, que fait un clic sur une ligne de
  l'arbre. `TabStrip` est un composant contrôlé — un écran lui fournit sa liste
  d'onglets et réagit aux callbacks, il ne décide rien lui-même.
- **Plus de deux zones à la fois.** Un panneau à trois zones (sidebar + centre +
  détail, `A4`/`A5`/`A6`) s'obtient en imbriquant deux `SplitPane` : la spec ne
  fournit pas de composant à N zones dédié, YAGNI tant qu'aucun écran n'en réclame
  un avec un comportement différent d'une imbrication.

## Approche

### Valeurs, relevées dans le mockup

Références de lignes dans `design/handoff/DoraBase.dc.html`, écran `A4`.

**Poignée** (l. 386) — largeur 5, fond `linear-gradient(90deg, rgba(35,32,28,.06),
transparent)` (sens inversé selon le côté du panneau qu'elle borde), pastille
centrale 3 × 26 rayon 2 en `rgba(35,32,28,.16)` — déjà tokenisé `--field`.
`.06` n'a pas de token : c'est un littéral local du dégradé, comme le veut la
convention établie en `02` pour les valeurs à usage unique.

**Bande d'onglets** (l. 381-385) — hauteur 34 (`--h-bar`), fond `--bar`
(`#F5F0E6`), filet bas `--divider`. Chaque onglet : `padding 0 12`, filet droit
`--divider`, `700 11.5px Nunito` si actif sinon `600 11.5px` en `--ink-2`.
Onglet actif : fond `--paper-bright` plus un `border-top 2px`.

**Deux couleurs indépendantes par onglet, à ne pas confondre** — relevé sur les
cinq onglets actifs du mockup (l. 389, 512, 806, 912, 1022). Le trait supérieur
suit la **famille** d'onglet, l'icône suit le **type d'objet** :

| Onglet | `border-top` | Icône |
| --- | --- | --- |
| schéma | `--accent` | `--accent-deep` |
| table | `--accent` | `--success` |
| console | `--violet` | `--violet-ink` |

Les fusionner en une seule valeur donnerait un trait vert sur les onglets de
table et un trait `--violet-ink` sur les consoles : aucun des deux n'existe dans
le mockup. Tout est déjà tokenisé, aucun ajout nécessaire.

Bouton de fermeture (`i-x` 12px, `--ink-5`) : visible sur l'onglet actif dans le
mockup ; aucun onglet inactif n'en montre. On retient cette lecture littérale
plutôt que d'inventer un survol qui révélerait la croix — cohérent avec
`REPRISE.md` § 9 sur les états non maquettés. À revoir si un écran réel le
contredit.

### Redimensionnement

Poignée `role="separator"` `aria-orientation="vertical"` `tabIndex={0}`, valeur
courante exposée par `aria-valuenow` (largeur en px), `aria-valuemin`/`-max` posés
par les bornes du panneau. Flèches gauche/droite ajustent par pas de 8px au
clavier ; glisser-déposer à la souris. Chaque `SplitPane` reçoit un `storageKey`,
une taille par défaut et des bornes min/max ; la taille effective est lue une
fois au montage puis écrite à chaque relâchement de la poignée.

### Bande d'onglets

`TabStrip` est purement présentationnel et contrôlé : liste d'onglets en props
(`id`, `icon`, `label`, `meta?`, `accentColor`), `activeId`, callbacks
`onSelect`/`onClose`/`onReorder`. Le réordonnancement se fait par glisser natif
HTML (`draggable`), sans bibliothèque : le besoin est simple et un onglet ne se
réordonne qu'au sein de sa propre bande.

## Terminé quand

- `SplitPane` redimensionne à la souris et au clavier, respecte ses bornes
  min/max, et retrouve sa taille après un rechargement (`localStorage`).
- Deux `SplitPane` imbriqués reproduisent la disposition à trois zones de `A4`
  sans code supplémentaire.
- `TabStrip` affiche l'état actif conforme au mockup (fond, `border-top` coloré,
  poids de police), réordonne par glisser, et déclenche `onClose` sur la croix.
- Le parcours clavier atteint la poignée et les onglets ; l'anneau de focus de
  `02` s'applique aux deux.
- L'icône console de la barre de titre est visible, focalisable, sans effet.
- Les deux primitives sont visibles dans la galerie de développement.
- Aucun littéral de couleur nouveau hors `tokens.json`, sauf le dégradé `.06` de
  la poignée, documenté en commentaire à l'endroit où il est utilisé.
