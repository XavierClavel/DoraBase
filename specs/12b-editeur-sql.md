# 12b — `A7` : l'éditeur SQL

## Goal

Une zone de saisie SQL avec coloration syntaxique, numéros de ligne et sélection — celle du mockup
`A7`.

## Scope

- **CodeMirror 6** comme éditeur, décision tranchée le 12 août 2026.
- La coloration adaptée aux jetons du handoff (`--syn-*`), pas au thème par défaut.
- Les numéros de ligne, la ligne courante, la sélection.
- Le texte piloté par l'écran : `12a` détient l'état, l'éditeur le reflète.
- `⌘↩` exécute (branché en `12c`), `⌥↩` exécute la sélection.

## Not in this scope

- **L'autocomplétion** → `12d`. CodeMirror la fournit, mais la *source* des suggestions est un autre
  sujet : elle vient du catalogue introspecté.
- **Le formatage** — dépendance à part.
- **Plusieurs curseurs, le pliage, la recherche.** CodeMirror les offre ; les activer sans que le
  handoff les montre serait ajouter de l'interface que rien ne demande.

## Approche

### CodeMirror 6, et pourquoi ce n'est pas une facilité

`01` justifiait le choix de Tauri par « les deux composants les plus coûteux — grille dense et
éditeur de code — déjà résolus par l'écosystème web ». C'est ce composant-là. Écrire un éditeur à la
main veut dire tenir le placement du curseur, la sélection au clavier, l'annulation, et la
composition des caractères accentués — quatre sujets où un éditeur maison se casse discrètement.

Monaco a été écarté : ~2 Mo pour une console de requêtes, et une surface conçue pour un IDE.

### Le thème est celui du handoff, pas celui de CodeMirror

Les six jetons `--syn-*` existent depuis `02` et servent déjà au bloc SQL de `11c`. Le thème de
l'éditeur les réemploie : un éditeur aux couleurs de CodeMirror à côté d'un bloc aux couleurs du
handoff se lirait comme deux applications.

**Écart assumé : le fond est sombre, là où le mockup montre un éditeur clair.** Les six jetons sont
faits pour un fond sombre — c'est ce que leurs valeurs disent, et c'est ainsi que `11c` les emploie.
Sur fond clair, ils seraient illisibles ; en inventer six clairs créerait un second jeu de jetons pour
un seul écran, ce que `02` interdit. L'écart porte sur le fond, pas sur les couleurs de syntaxe, qui
sont exactement celles du handoff.

### L'état du texte reste à l'écran, mais l'éditeur n'est pas « contrôlé »

CodeMirror gère son propre document, ce qui invite à lui laisser la vérité. Mais `12a` a besoin du
texte pour le garder par onglet, et `12f` pour l'enregistrer. L'écran détient donc l'état, et
l'éditeur le notifie — le même arbitrage qu'en `11b`, où deux propriétaires ont produit un défaut
réel.

**Ce que l'écran ne fait pas, c'est réinjecter le texte à chaque rendu.** Un éditeur contrôlé perd des
caractères : l'écran renvoie la valeur en retard d'un rendu, et l'éditeur, qui a déjà avancé, se voit
réécrire avec un texte plus ancien. Taper « select 1 » donnait « slc ». Deux gardes successives —
comparer au document, puis à la dernière valeur notifiée — n'y ont rien changé : la course est
structurelle.

L'éditeur reçoit donc son texte **au montage**, et un texte imposé de l'extérieur demande un
remontage — ce que la `key` par onglet de `12a` fait déjà, et ce que `12f` fera pour charger une
requête enregistrée.

## Done when

- [ ] Taper du texte le colore selon les jetons du handoff, vérifié sur les couleurs calculées.
- [ ] Les numéros de ligne suivent le contenu, et la gouttière ne se désaligne pas au défilement.
- [ ] Le texte saisi remonte à l'écran **sans perdre de caractères**, et un texte imposé au montage
      s'affiche.
- [ ] `⌘↩` et `⌥↩` répondent, et `⌘↩` n'insère pas de ligne — la carte par défaut de CodeMirror la
      lie à cela.
- [ ] Un caractère accentué composé (`option+e`, `e`) s'insère correctement.
- [ ] Comparaison visuelle contre `A7`.
