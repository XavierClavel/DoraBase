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

### L'état du texte reste à l'écran

CodeMirror gère son propre document, ce qui invite à lui laisser la vérité. Mais `12a` a besoin du
texte pour le garder par onglet, et `12f` pour l'enregistrer. L'écran détient donc l'état, et
l'éditeur le notifie — le même arbitrage qu'en `11b` pour les modifications en attente, où deux
propriétaires ont produit un défaut réel.

## Done when

- [ ] Taper du texte le colore selon les jetons du handoff, vérifié sur les couleurs calculées.
- [ ] Les numéros de ligne suivent le contenu, et la gouttière ne se désaligne pas au défilement.
- [ ] Le texte saisi remonte à l'écran, et un texte imposé par l'écran s'affiche.
- [ ] Un caractère accentué composé (`option+e`, `e`) s'insère correctement.
- [ ] Comparaison visuelle contre `A7`.
