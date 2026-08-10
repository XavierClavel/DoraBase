# 08h — Le menu « … » des lignes de l'arbre

## Objectif

Donner aux lignes **projet** et **base** de l'explorateur un menu d'actions, ouvert par un « … »
révélé au survol. Aujourd'hui la modification d'une base n'est atteignable que par la pastille de
la barre de titre (`08g`) — un chemin que rien n'annonce depuis l'arbre, là où l'utilisateur
regarde ses bases.

## Dépend de

`09a` (`TreeRow`), `09d` (le modèle d'arbre), `09e` (l'explorateur), `08g` (la modale d'édition et
son point d'entrée), `10a` (`Popover`).

## Périmètre

- Un bouton « … » sur les lignes **projet** et **base**, et sur elles seules.
- L'espace qu'il occupe est **réservé en permanence** : rien ne bouge au survol.
- Il paraît au survol de la ligne **et au focus clavier**, disparaît sinon.
- Le menu qu'il ouvre, avec une seule entrée branchée : « Modifier… » sur une base.
- Le placeholder des entrées à venir : « Renommer… » (`08i`) et « Supprimer… » (`08j`), désactivées
  avec leur raison — la règle de `09f`, et le défaut n° 36.

## Hors périmètre

- **Renommer** un projet : `08i`. La commande n'existe pas.
- **Supprimer** un projet ou une base : `08j`. Destructif, et il faut le sort des secrets.
- **Les lignes schéma et table.** Elles n'ont pas de configuration : ce qu'un menu y offrirait
  (copier le nom, ouvrir dans un onglet) n'est pas de la configuration, et relève de `A5`/`A10`.
- **Un menu contextuel au clic droit.** Le handoff ne le maquette pas, et un « … » visible enseigne
  son existence là où un clic droit se devine. À reconsidérer en `A10`.

## Approche

### L'espace est réservé, le bouton non

Réserver la place et n'y peindre le bouton qu'au survol : la ligne ne se réorganise pas sous le
curseur, et le méta de droite (compte de lignes, badge d'environnement) ne se déplace pas d'un
pixel quand la souris passe. Un bouton qui pousse ses voisins au survol fait bouger la cible qu'on
visait — le pire moment pour déplacer quelque chose.

**La gouttière est réservée sur toutes les lignes de l'arbre**, pas seulement sur celles qui portent
un menu. Ne la réserver que sur les lignes projet et base décalerait leurs badges par rapport aux
comptes de lignes des tables : un désalignement permanent pour éviter un mouvement passager, mauvais
échange.

Le méta reste donc **à gauche** de la gouttière et ne disparaît jamais. Une première rédaction de
cette spec faisait remplacer le méta par le « … » au survol ; c'était incompatible avec la
réservation d'espace — si le « … » prend la place du méta, il n'y a rien à réserver — et cela faisait
disparaître une information au moment précis où l'on désigne la ligne.

### Le survol seul ne suffit pas

Une action qui n'existe qu'au survol n'existe pas au clavier. Le bouton est donc aussi révélé
lorsqu'il **reçoit le focus** (`:focus-visible`), et il est dans l'ordre de tabulation de la ligne.
C'est la même exigence que les quatre états de connexion de `09d` : ce qui ne tient qu'à un canal
sensoriel n'est pas accessible.

### Le menu réutilise le `Popover`, sans nouveau composant

`Popover` (`10a`) porte déjà les trois fermetures, la bascule d'alignement et le rendu du panneau.
Un menu d'actions est un panneau de boutons : rien à réinventer.

**Attention au découpage.** La sidebar défile ; le panneau s'ouvre en absolu. C'est exactement le
défaut n° 35, où un `overflow: hidden` d'ancêtre rendait invisible un panneau que
`toBeVisible()` déclarait visible. Le test de cette spec interroge `elementFromPoint`, jamais
`toBeVisible()` seul.

### Les entrées à venir sont désactivées, pas absentes

« Renommer… » et « Supprimer… » figurent dans le menu, désactivées, avec leur raison en infobulle.
Les cacher ferait croire qu'elles n'existeront pas ; les laisser cliquables et inertes ferait
croire à un défaut — le n° 36, signalé à l'usage le 10 août 2026.

## Terminé quand

- [ ] Les lignes projet et base portent un « … » ; schéma et table, non.
- [ ] La position du méta de droite est **identique** avec et sans survol, mesurée.
- [ ] Le bouton paraît au survol et au focus clavier, et le menu s'ouvre aux deux.
- [ ] Le panneau ouvert est **réellement visible** — `elementFromPoint`, pas `toBeVisible()`.
- [ ] « Modifier… » sur une base ouvre la modale de `08g`, préremplie sur cette base.
- [ ] « Renommer… » et « Supprimer… » sont désactivées et disent pourquoi.
- [ ] Un sabotage retirant la réservation d'espace fait échouer le test de position.
