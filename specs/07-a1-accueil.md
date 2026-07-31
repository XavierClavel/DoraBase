# 07 — A1, première ouverture

## Objectif

Reproduire l'écran d'accueil : ce que voit l'utilisateur au premier lancement,
quand aucun projet n'existe. C'est le premier écran réel, donc la première
validation que le socle de fidélité de `02` tient face au mockup.

## Dépend de

`01` (socle) et `02` (tokens, polices, icônes, primitives).

## Périmètre

- `TitleBar` dans sa forme minimale : logo, wordmark, icône préférences.
- `StatusBar` : compteur de projets, rappel de la palette, version de l'app.
- Sidebar 236 px avec son en-tête, son état vide et son bouton de pied.
- Zone centrale : dégradé radial, logo, titre, sous-titre, bouton principal.
- `⌘N` capté au niveau de la fenêtre, branché sur le même callback que les deux
  boutons.
- Captures de référence Playwright, qui deviennent le garde-fou anti-régression.

## Hors périmètre

- **La création de projet elle-même** → `08`. Ici le callback est vide : les
  boutons sont vrais, focalisables, cliquables, et ne déclenchent rien.
- Palette de commandes `⌘K`. La barre d'état la mentionne parce que le design le
  demande ; c'est du texte statique à ce stade.
- Écran de préférences → `15`. L'icône de la barre de titre est présente et inerte.
- Sidebar peuplée, arbre, onglets : cet écran n'a par définition aucun projet.

## Approche

### Le chrome de fenêtre du mockup n'est pas l'app

Les feux tricolores, l'ombre portée et le rayon de 14 px de la maquette sont la
mise en scène du handoff. En vrai, macOS fournit la fenêtre et ses feux ; on
dessine seulement l'intérieur. La barre de titre réserve la place à gauche pour ne
pas les recouvrir. Décision déjà prise en `01`, rappelée ici parce que c'est le
premier écran où elle se voit.

### Valeurs, relevées dans le mockup

Le mockup est l'autorité, pas la description prose du handoff — voir les écarts
plus bas. Références de lignes dans `design/handoff/DoraBase.dc.html`.

**Barre de titre** (l. 117-128) — hauteur 40, `padding 0 12`, gap 12, fond
`linear-gradient(#FFFDF8, #F5F0E6)`, filet bas `1px rgba(35,32,28,.1)`. Logo 24 px
rayon 6, wordmark `700 14px Baloo 2` `letter-spacing .1px`, gap 7. À droite, la
seule icône `i-gear` à 15 px, stroke 1.8, dans une boîte 26 × 24,
`rgba(35,32,28,.45)`. **Pas d'icône console sur cet écran.**

**Sidebar** (l. 130-140) — largeur 236, fond `paper-alt`, filet droit
`1px rgba(35,32,28,.1)`.

- En-tête : hauteur 32, `padding 0 10`, gap 6, filet bas `rgba(35,32,28,.08)`,
  `700 10.5px Nunito`, `letter-spacing .7px`, capitales, `rgba(35,32,28,.45)`,
  icône `i-bag` 13 px stroke 2.
- État vide, centré, gap 10, `padding 0 26` : carré 46 × 46 rayon 14, bordure
  `2px dashed rgba(35,32,28,.18)`, icône `i-db` 20 px stroke 1.8 en
  `rgba(35,32,28,.3)` ; « Aucun projet » `600 12px` `rgba(35,32,28,.55)` ; puis
  « Un projet regroupe plusieurs bases ; chacune se décline par environnement. »
  en `400 11.5px/1.5` `rgba(35,32,28,.4)`.
- Pied : `padding 8`, filet haut `rgba(35,32,28,.08)`, bouton pleine largeur
  hauteur 28 rayon 8, fond accent, `700 12px`, icône `i-plus` 14 px stroke 2.2,
  « Nouveau projet ».

**Zone centrale** (l. 141-151) — fond
`radial-gradient(120% 90% at 50% 0%, #FFFDF8, #F8F3E9)`, bloc centré de 640 px,
gap 14 : logo 72 px rayon **17**, ombre `0 12px 26px -10px rgba(35,32,28,.4)` ;
« Prêt à explorer&nbsp;? » en `700 27px/1.15 Baloo 2` — l'espace insécable avant le
point d'interrogation fait partie du texte ; sous-titre `400 13.5px/1.5`
`rgba(35,32,28,.55)`, `max-width 420`. Bouton unique, `margin-top 6`, hauteur 34,
`padding 0 16`, rayon 10, fond `#23201C`, texte `#FBF7EF`, gap 8, `700 12.5px`,
icône `i-plus` 15 px stroke 2.2, puis `⌘N` en `600 11px JetBrains Mono` opacité .5.

**Barre d'état** (l. 153) — hauteur 26, `padding 0 12`, gap 14, fond `bar`, filet
haut `rgba(35,32,28,.1)`, `500 11px JetBrains Mono` `rgba(35,32,28,.45)` :
`0 projet` · `·` · `⌘K palette`, puis à droite `DoraBase <version>`.

### Données affichées

Le handoff pose que toutes les données des maquettes sont fictives et doivent être
remplacées par les vraies. On applique la règle aux deux chaînes concernées : le
compteur de projets est calculé, donc `0 projet` ici ; la version est injectée à la
compilation depuis `package.json`, dont `tauri.conf.json` hérite, et ne sera donc pas
`0.4.2`. C'est le seul écart de contenu assumé avec la maquette.

### Câblage

Un unique `onNewProject` remonté à `App`, partagé par les deux boutons et par le
raccourci `⌘N` écouté au niveau de la fenêtre. En `08`, il suffira de le remplir.
Les deux boutons sont de vrais `<button>`, focalisables au clavier, avec l'anneau
de focus défini en `02`.

### Écarts relevés dans le handoff

La prose du `README.md` et le mockup divergent sur quatre points. Le mockup fait
foi, puisque la fidélité se mesure contre lui.

| Point | Prose | Mockup | Retenu |
| --- | --- | --- | --- |
| Logo de barre de titre | 22 px | 24 px | 24 px |
| Wordmark de barre de titre | 13 px | 14 px | 14 px |
| Rayon du logo hero | 20 px | 17 px | 17 px |
| Hauteur du corps | 722 px | 748 px | ni l'un ni l'autre : le corps flexe |

## Terminé quand

- L'app se lance sur A1 et la comparaison côte à côte avec le mockup à 1360 px de
  large ne montre aucun écart, hormis la version dans la barre d'état.
- Les feux tricolores du système sont visibles et non recouverts.
- La fenêtre se redimensionne proprement : les barres gardent 40 et 26 px, la
  sidebar garde 236 px, le bloc central reste centré.
- `⌘N` et les deux boutons appellent le même callback, vérifié par un test Vitest.
- Le parcours au clavier atteint les deux boutons et l'anneau de focus est visible.
- Les captures Playwright de référence sont commitées et la CI les vérifie.
