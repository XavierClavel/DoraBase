# 26 — Renommer une connexion

## Objectif

Corriger le nom d'une connexion déclarée. Aujourd'hui c'est impossible : `08g` affiche le champ
« Nom de la base » **verrouillé**, et une faute de frappe à la déclaration est définitive — la seule
issue est de retirer la connexion et de la redéclarer, ce qui fait retaper le mot de passe.

## Dépend de

`05a` (l'identité), `05c` (les secrets), `08g` (le champ verrouillé, dont le verrou saute ici),
`08h` (le menu « … » de la ligne), `08i` (`renommer_projet` — la mécanique de migration existe déjà),
`09b` (le registre), `23b` (l'identité d'une connexion), `25a` (le palier d'environnement).

## Périmètre

- Une commande `rename_database`, qui n'existe pas.
- L'entrée « Renommer… » du menu « … » d'une ligne **connexion**, qui passe la ligne en édition.
- La migration du **secret** — un seul, contre un par base en `08i`.
- La fermeture de la connexion ouverte, dont la clé de registre change.
- Les **onglets ouverts** — tables et consoles — qui suivent le renommage au lieu de se fermer.
- L'infobulle du champ verrouillé de `A2`, qui cesse de dire « impossible » et dit **où** le faire.
- Le champ de saisie **sans assistance** : ce qu'on tape est un identifiant, pas une phrase.

## Hors périmètre

- **Renommer la base sur le serveur.** Un `ALTER DATABASE` n'est pas ce geste : le nom d'une
  connexion est une étiquette locale, voir § Approche. Cette spec ne touche à aucun serveur.
- **Changer l'environnement d'une connexion.** L'autre moitié de la clé, et le même travail de
  migration pour un geste que rien ne réclame à l'usage. Sa propre spec le jour où il est demandé.
- **Le double-clic sur la ligne.** Il renomme une console (`12f`), parce qu'un clic simple y ouvre un
  onglet. Sur une connexion, le clic simple **déplie** — un double-clic replierait puis déplierait,
  et le champ de renommage apparaîtrait sur une ligne en train de bouger. Le geste rapide est le clic
  droit, qui n'a pas ce défaut.
- **Renommer un schéma, une table.** Ce sont des objets du serveur, pas des déclarations.
- **Le clic droit, et la fermeture du menu quand on s'en va.** Deux corrections venues de l'usage de
  cette spec, mais qui portent sur le **menu de toutes les lignes** — pas sur le renommage : `27`.

## Approche

### Le nom d'une connexion est une clé, et ce n'est pas le nom de la base distante

`Database` porte `name` **et** `connection.default_database`. C'est ce second champ, et lui seul, qui
part dans la chaîne de connexion des cinq pilotes — vérifié : `name` n'apparaît dans aucun
`connect.rs`. Renommer une connexion ne peut donc **rien** casser côté serveur, et le commentaire de
`05a` — « le nom reste celui de la base distante, il n'y a pas d'étiquette libre » — décrivait une
convention de saisie, pas une contrainte du modèle.

Ce que `name` fait, en revanche : avec `projet` et `environnement`, il forme la clé du registre
(`09b`) et la référence du secret (`05c`). Renommer est donc une **migration**, pas l'écriture d'un
champ — exactement la conclusion de `08i` pour le projet.

### La mécanique de `08i` est reprise, pas réécrite

`renommer_projet` garantit déjà l'ordre qui compte : écrire le nouveau secret, **vérifier qu'il se
relit**, écrire la configuration, et supprimer l'original **en dernier** — un magasin qui tombe en
panne à mi-parcours ne peut alors rien faire perdre. Un échec retire ce qui a été posé et rend le
`bool` disant si les originaux sont intacts.

`renommer_connexion` applique le même ordre sur **un** secret. La liste de `08i` devient un
`Option` ; le rollback devient trivial. Le reste — la distinction *refusé* / *introuvable*, le
retour `Renommage` — est identique, et le type est réutilisé tel quel.

**Une seule différence de fond** : `08i` renommait *tous* les secrets d'un projet, donc pouvait
échouer à moitié. Ici il n'y en a qu'un : ou la migration a lieu, ou rien n'a bougé.

### Un secret absent n'annule pas le renommage

La règle de `08i`, et pour la même raison : un magasin qui **refuse** annule tout, un secret
simplement **introuvable** laisse passer. L'interrompre rendrait la connexion *irrenommable* —
celle dont le mot de passe a été effacé à la main serait la seule à ne plus pouvoir changer de nom.
La référence suit le nouveau nom, la connexion redemandera son mot de passe, et l'écran le **dit**.

### L'unicité est celle du couple `(environnement, nom)`, et le cœur la vérifie déjà

`ModelError::ConnexionEnDouble` existe depuis `23b` : deux connexions homonymes dans le même
environnement sont refusées, deux homonymes dans deux environnements sont le modèle même. La
commande valide le projet candidat avant d'écrire et laisse le refus remonter — **aucune règle n'est
réimplémentée** dans l'écran, la leçon de `23e`.

Renommer une connexion en son propre nom est accepté sans rien faire. `ChampDeRenommage` l'écarte
déjà côté écran ; le cœur le réaffirme, parce qu'une commande ne doit pas dépendre de la politesse
de son appelant.

### Les onglets suivent, ils ne se ferment pas

`08j` **ferme** les onglets d'une connexion retirée : leur déclaration a disparu. Ici elle existe
toujours, sous un autre nom — les fermer ferait perdre la place de l'utilisateur, et une modification
en attente non appliquée avec elle.

`idOnglet` compose `projet/base/env::schema.table` : le renommage réécrit donc **l'`id` de chaque
onglet de cette connexion**, `actif` compris, plus les trois tables indexées par cet identifiant —
les textes de console, les consoles ouvertes, les modifications en attente. C'est le travail que
`renommerLaConsole` fait déjà pour un nom de console ; la fonction est généralisée aux coordonnées
plutôt que dupliquée, sans quoi la seconde à être écrite serait celle qu'on oublie de corriger.

**Les consoles persistées suivent sans effort** : elles vivent *dans* `Database` (décision du
20 août 2026), donc le renommage les emporte. Seule leur identité d'onglet est à réécrire.

### La ligne se replie, et la sélection est relâchée

Les identités de l'arbre portent le nom de la connexion (`d:projet/env/base`) : après renommage,
celles de l'ancienne n'existent plus, donc la ligne se referme et la sélection tombe. Les réécrire
aurait gardé le surlignage — **et les schémas déjà chargés, sur une connexion que le cœur vient de
fermer**. Une ligne repliée dit la vérité ; un arbre qui montre le contenu d'une connexion fermée,
non. Un clic la redéplie, ce qui la rouvre.

### La connexion ouverte est fermée, et pas rouverte

Sa clé de registre n'existe plus. Elle se rouvrira en dépliant la connexion, ce qui est déjà le geste
d'ouverture — et ne pas la rouvrir d'office est l'arbitrage de `08g` : une erreur de connexion juste
après un renommage réussi se lirait comme un échec du renommage.

### Ce qu'il y a à dire se dit, et seulement quand il y a quelque chose à dire

Un renommage inline n'a pas de modale où loger un refus. Trois choses peuvent devoir être dites — un
nom refusé, un secret introuvable, un résidu dans le Trousseau — et les taire ferait découvrir la
troisième bien plus tard, sur un échec de connexion sans raison apparente.

Un dialogue de rapport, monté **seulement** s'il y a une de ces trois choses, sur le `Modal` de `08b`
— pas de nouveau composant, et pas de bandeau permanent pour un événement rare. Le succès muet est
le bon comportement : la ligne d'arbre porte déjà le nouveau nom, ce qui est la confirmation.

### Le champ de renommage ne corrige rien de ce qu'on y tape

WKWebView applique les réglages système : correction automatique, capitale initiale, correcteur
orthographique, complétion du navigateur. Ce qu'on tape ici est un **identifiant** — un nom de
connexion — et « analytics_v2 » corrigé s'enregistrait sans que personne l'ait tapé
(`DEFAUTS.md` n° 124). Les quatre attributs sont posés sur `ChampDeRenommage`, donc pour tous ses
appelants : aucun champ de ce produit n'attend de la prose.

### Le champ verrouillé de `A2` dit maintenant où aller

`08g` verrouille « Nom de la base » avec « c'est la clé ». Le geste existant désormais, laisser cette
phrase serait faux. Le champ **reste verrouillé** — la modale a un bouton « Enregistrer », et un
champ qui déclencherait une migration de secret au milieu d'un formulaire tampon serait le seul
contrôle de l'écran à s'appliquer sans lui — mais l'infobulle nomme le geste de l'arbre.

## Terminé quand

- [x] `rename_database` migre le secret, ferme la connexion, puis écrit la configuration — dans cet
      ordre, et un sabotage l'inversant fait échouer un test (trois, en fait : essayé).
- [x] Un magasin qui **refuse** annule le renommage et retire ce qui a été posé ; un secret
      **introuvable** ne bloque pas, et est rapporté à l'écran.
- [x] Un nom déjà pris **dans le même environnement** est refusé ; le même nom dans un autre
      environnement est accepté ; le même nom qu'avant ne fait rien.
- [x] Le secret **se relit sous le nouveau nom dans le vrai magasin chiffré**, pas dans une
      `HashMap` de test.
- [x] « Renommer… » passe la ligne en édition ; `Entrée` valide, `Échap` annule, le flou valide —
      les deux premiers en e2e, le troisième par les tests de `ChampDeRenommage`.
- [x] Un onglet de table et un onglet de console ouverts sur la connexion **restent ouverts**, sur
      la connexion renommée, et l'onglet actif le reste — mesuré sur l'état, pas sur l'écran.
- [x] Les tables indexées par identité d'onglet suivent : le texte d'une console ouverte survit,
      mesuré de bout en bout, et la fonction de réindexation — la même pour les modifications en
      attente et le mode édition — a son test propre.
- [x] Le dialogue de rapport n'est monté que s'il y a un refus, un secret absent ou un résidu.
- [x] Le champ de renommage n'hérite d'aucune assistance à la saisie — correction, capitale,
      correcteur, complétion.
- [ ] La connexion renommée survit à un redémarrage. **À l'œil** : rien n'automatise un
      redémarrage de l'app, et l'écriture de la configuration est ce qui est testé, pas sa
      relecture au lancement suivant. Voir `REPRISE.md` § 0.

## Ce que l'écriture a appris

**Ce que le premier usage a signalé tenait au menu, pas au renommage** : trois des quatre retours
portaient sur le « … » et son panneau, d'où la spec `27`. Le quatrième était la correction automatique
de macOS sur le champ de saisie (`DEFAUTS.md` n° 124), traitée ici.

**Un `Entrée` qui valide peut activer le premier bouton de la fenêtre qu'il ouvre.** Le refus montait
bien la modale de rapport, et le traitement par défaut du même `keydown` la refermait aussitôt par sa
croix — jamais lisible. `DEFAUTS.md` n° 120 ; corrigé par un `preventDefault()` dans
`ChampDeRenommage`, donc pour tous ses appelants. **Trouvé en e2e seulement** : jsdom ne rejoue pas
cette activation, et les huit tests unitaires du geste étaient verts.
