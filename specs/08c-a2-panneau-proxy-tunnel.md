# 08c — A2 : le panneau proxy / tunnel

## Objectif

Le bloc « Proxy / tunnel » de `A2` : repli, cinq champs, badge d'activation, et le port
local affiché. C'est le formulaire qui alimente le tunnel de `06e`.

## Dépend de

`08a` (`CollapsiblePanel`, `Select`), `08b` (la modale qui l'accueille), `05a` (le type
`Tunnel` : ses champs sont exactement ceux du panneau).

## Périmètre

- Le panneau replié / déplié, avec son chevron, son bouclier et son badge lavande.
- Les cinq champs : Type, Hôte du bastion, Port, Utilisateur, Clé privée.
- Le bouton « Parcourir… » qui ouvre un sélecteur de fichier.
- Le champ « Port local mappé », **désactivé**, en pointillés.
- L'état du panneau lié à `EnvironmentVariant.tunnel` : présent ou absent.

## Hors périmètre

- **L'ouverture réelle du tunnel** → `06e`, déjà fait. Ce scope saisit une configuration ;
  `08d` la fera ouvrir en testant la connexion.
- **Les types de proxy autres que SSH.** `05a` modélise `TunnelKind` en énumération d'un
  seul membre, et le mockup ne montre que « SSH ». Le `Select` a donc une seule option —
  rendu quand même, parce que le mockup le montre et parce qu'un second type viendra.
  *(`05d` a depuis retiré `TunnelKind` — devenu du code mort une fois `Proxy` introduite,
  étiquetée en interne sur `kind` — et lui a donné un second membre, `cloud-sql`. Le
  sélecteur de ce panneau n'en montre toujours qu'un : Cloud SQL n'est pas dans le
  handoff, et c'est `08k` qui lui donnera sa seconde option.)*
- **La phrase de passe d'une clé chiffrée.** Absente du handoff, hors périmètre de `06e`
  qui rend une erreur explicite. L'écran de saisie viendra avec la spec qui le maquette.
- **La validation du chemin de clé.** Le champ accepte ce qu'on y met ; `06e` refuse à
  l'ouverture, avec un message qui nomme le chemin et le panneau. C'est le bon endroit :
  un chemin peut devenir valable entre la saisie et la connexion.

## Approche

### Une grille de quatre colonnes, pas une répétition de la grille du dessus

Le panneau a sa propre grille : `130px 1fr 84px 1fr`, gap 10 px, padding 11 px. Type,
Hôte du bastion, Port, Utilisateur tiennent sur une seule rangée. La rangée suivante
prend toute la largeur avec une sous-grille `1fr 220px` : Clé privée puis Port local.

Rien de commun avec la grille `1fr 1fr` du formulaire principal. Les factoriser serait
une abstraction fausse.

### Les champs du panneau font 28 px, pas 30

Deux pixels de moins que ceux du formulaire principal, et un padding de 9 px au lieu de
10. Le handoff le dit et le mockup le confirme sur les cinq champs. C'est ce qui donne au
panneau son aspect « bloc secondaire », et l'aligner sur 30 px l'effacerait.

### Le port local est affiché, pas saisi

Champ **désactivé** : fond `--paper-dim`, bordure `1px dashed rgba(35,32,28,.2)`, texte
`rgba(35,32,28,.5)`, valeur « auto (63342) ». La bordure en pointillés est le seul
endroit du handoff qui en emploie une — elle mérite son propre jeton plutôt qu'une valeur
en dur.

Le nombre entre parenthèses est **le port réellement choisi**, que
`SshTunnel::port_local` rend déjà (`06e`). Tant qu'aucun tunnel n'est ouvert, le champ
affiche « auto » seul : inventer un numéro avant l'ouverture serait un mensonge, et
afficher « auto (0) » serait pire.

### « Parcourir… » a besoin d'une permission Tauri

Le sélecteur de fichier passe par le plugin `dialog`. `01` a réduit les permissions à
six, délibérément ; il en faut une septième, `dialog:allow-open`, et **elle seule** — pas
`dialog:default`, qui ouvrirait aussi la sauvegarde et les messages.

Le chemin retourné est mis dans le champ. Aucune lecture du fichier ici : `06e` le lit à
l'ouverture, et lire une clé privée pour « valider » la saisie ferait entrer de la
matière privée dans l'écran sans nécessité.

### Le badge « SSH activé » suit la présence du tunnel

Fond `#EEEAFA`, texte `--violet-ink`, 19 px de haut. Il n'apparaît que si
`EnvironmentVariant.tunnel` est renseigné. Le mockup ne montre pas le panneau replié ni
sans badge : l'état replié est donc rendu par `CollapsiblePanel` avec son en-tête seul,
et le badge disparaît — la seule lecture cohérente, faute de maquette.

`#EEEAFA` n'est pas encore un jeton. À ajouter, comme `08a` ajoute les deux autres.

## Terminé quand

- Comparaison visuelle du panneau déplié contre `A2`, sans écart.
- Les cinq champs font 28 px, vérifié par mesure et non par lecture du CSS.
- Le champ Port local est inaccessible au clavier et au pointeur, et le dit
  (`aria-disabled`), plutôt que d'être seulement grisé.
- « Parcourir… » ouvre un sélecteur et le chemin choisi arrive dans le champ, vérifié
  dans l'app réelle — le plugin `dialog` ne répond pas sous Vitest.
- La permission ajoutée est `dialog:allow-open` et rien d'autre, vérifié par un test qui
  compte les permissions et échouerait si l'on avait pris `dialog:default`.
- Replier le panneau retire son contenu de l'arbre d'accessibilité.
- Le badge suit la présence du tunnel dans les deux sens.
- Aucune couleur littérale hors `tokens.json` ; `#EEEAFA` et le pointillé tokenisés.
