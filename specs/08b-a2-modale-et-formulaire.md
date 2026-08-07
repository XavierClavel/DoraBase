# 08b — A2 : la modale de nouvelle connexion

## Objectif

Assembler `A2` : coquille de modale, sélecteur de moteur, formulaire principal. Fidélité
au pixel, **aucun comportement** — les boutons du pied existent et ne font rien.

## Dépend de

`08a` (les quatre primitives), `05a` (les types `Engine`, `Environment`, `SslMode` :
les options des sélecteurs viennent du modèle, pas d'une liste recopiée dans l'écran).

## Périmètre

- La modale au-dessus de la coquille de `03`, la barre de titre ternie derrière.
- Le sélecteur de moteur : sept boutons, monogrammes colorés, ordre du handoff.
- Le formulaire : nom, projet, variante d'environnement, hôte, port, base par défaut,
  utilisateur, mot de passe, mode SSL, deux bascules.
- Le pied : « Tester la connexion », « Annuler », « Enregistrer & ouvrir ⌘↩ ».
- L'état du formulaire en local, contrôlé — la saisie se voit.

## Hors périmètre

- **Le panneau proxy / tunnel** → `08c`. Il a ses propres champs et son propre repli.
- **« Tester la connexion »** et le résultat inline → `08d`. Le bouton est présent et
  inerte, comme les boutons de `A1` l'ont été jusqu'à `08`.
- **« Enregistrer & ouvrir »** → `08e`. Idem : présent, inerte.
- **La validation des champs.** Aucun message d'erreur de saisie n'est maquetté. Ce qui
  vaut refus est décidé par `05a`, qui porte déjà les invariants, et se manifestera à
  l'enregistrement (`08e`).
- **Le champ mot de passe fonctionnel.** Le badge « Trousseau » et l'œil sont rendus ;
  ce qu'ils font relève de `08e` (écriture du secret) et de `05c`.
- **Les six moteurs autres que PostgreSQL.** Les boutons sont sélectionnables et le
  formulaire ne change pas : `06` n'a livré qu'un adaptateur. Un moteur sans adaptateur
  doit être **sélectionnable et le dire**, pas être masqué — masquer ferait croire que
  le produit ne les prévoit pas.

## Approche

### Le formulaire est une grille, pas une pile

Le mockup impose une grille 2 colonnes `gap 12px 18px`, avec deux rangées qui prennent
toute la largeur (`grid-column: 1/-1`) et des sous-grilles :

- Rangée 1, pleine largeur : `1fr 196px auto` — nom · projet · variante d'environnement,
  alignées en bas (`align-items: end`), parce que les libellés n'ont pas la même hauteur.
- Rangée hôte : sous-grille `1fr 84px` — le port est étroit et **collé** à l'hôte
  (gap 8 px, pas 18 px).
- Rangée SSL, pleine largeur : `1fr 1fr` — mode SSL à gauche, les deux bascules à droite
  alignées en bas avec `padding-bottom: 5px`.

Reproduire cela par des `flex` imbriqués donnerait des colonnes qui ne s'alignent pas
d'une rangée à l'autre. C'est précisément le genre d'écart que Vitest ne verra pas.

### Les valeurs techniques sont en JetBrains Mono, les autres en Nunito

Le handoff est explicite et le mockup le confirme champ par champ : hôte, port, base par
défaut, utilisateur, mot de passe et chemin de clé en **JetBrains Mono 12 px** ; nom de
la base, projet, mode SSL et libellés en **Nunito**. La règle n'est pas décorative — elle
distingue ce que l'utilisateur tape littéralement de ce qu'il choisit.

Le nom de la base est en Nunito `12.5px` alors que les valeurs techniques sont en 12 px.
Écart d'un demi-pixel, relevé sur le mockup, pas arrondi.

### Deux détails du sélecteur de moteur

**Snowflake et BigQuery n'ont pas de monogramme.** Les cinq premiers en ont un, coloré ;
les deux derniers portent leur seul libellé. Vérifié sur le mockup, où le `<span>` du
monogramme est absent de ces deux boutons. Ce n'est pas un oubli à combler.

**Le monogramme actif est en `opacity .85` sur fond accent**, pas dans sa couleur de
moteur : `Pg` blanc translucide quand PostgreSQL est choisi, `#31648F` sinon.

### L'habillage `prod` se superpose à l'état actif

`08a` livre l'état actif générique. Ici, `prod` reçoit son habillage propre : fond
`--danger-bg`, bordure **1.5 px** `--danger`, texte `--danger-ink`, icône warning, et
graisse 700 au lieu de 600. La bordure de 1.5 px change la boîte : sans
`box-sizing: border-box`, le bouton `prod` serait plus large de 1 px que ses voisins.

Le mockup ne montrant pas de `dev` actif (voir `08a`), l'implémentation applique l'état
accent générique et la question reste ouverte au § « À trancher » de `specs/README.md`.

### La barre de titre se ternit, mais les feux ne peuvent pas

Le mockup grise les trois feux en `#DCD6CB`, met le wordmark à `opacity .55` et applique
`filter: saturate(.6)` à la barre entière.

**Les feux sont hors de portée.** `tauri.conf.json` déclare
`titleBarStyle: "Overlay"` avec `hiddenTitle` : ce sont les vrais boutons de macOS, dessinés
par le système par-dessus notre fenêtre, et aucun CSS ne les atteint. macOS les ternit
lui-même quand la fenêtre perd le focus — ce qu'une modale **interne** ne provoque pas.

Trois façons de les griser, toutes refusées : dessiner nos propres feux (il faudrait alors
réimplémenter leur comportement, leur survol et leurs trois icônes, pour un gain
esthétique) ; passer la fenêtre en `decorations: false` (même problème, en pire) ;
désactiver la fenêtre le temps de la modale (elle cesserait d'être déplaçable et
fermable, ce qui est franchement hostile).

Ce qui est donc implémenté : `opacity .55` sur le wordmark et `saturate(.6)` sur la barre.
L'intention du mockup — « la fenêtre est bloquée » — passe par ces deux effets, qui
couvrent toute la barre sauf trois pastilles de 11 px. Écart consigné au § « À trancher »
de `specs/README.md`, avec les moyens envisagés et leur coût.

## Terminé quand

- Comparaison visuelle complète contre `A2` du mockup, sans écart relevé.
- Comparaison au pixel des fonds, du voile et du bouton accent, identique octet pour
  octet — la méthode de `07`. **Les trois feux sont exclus de la comparaison**, et la
  raison est écrite dans le test plutôt que déduite d'un masque muet.
- Les sept moteurs sont là, dans l'ordre du handoff, deux sans monogramme.
- La grille tient à 960×600 (minimum) et à 1600×900 : la modale de 820 px doit rester
  entièrement visible au minimum, ce qui est **à vérifier et non à supposer**.
- Parcours clavier complet, anneau de focus visible partout, `esc` ferme.
- Les options des trois sélecteurs viennent des types de `05a` : ajouter un `SslMode`
  en Rust doit le faire apparaître, sans toucher l'écran. Vérifié par test.
- Aucune couleur littérale hors `tokens.json`.
- Les faits de mise en page (grille alignée, largeur du port, modale visible à 960 px)
  sont dans `e2e/`.
