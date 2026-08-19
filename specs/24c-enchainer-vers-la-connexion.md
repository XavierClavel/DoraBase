# 24c — Enchaîner vers la première connexion

## Goal

Le projet créé, la modale enchaîne sur le formulaire de connexion, projet imposé. On peut s'en aller
sans déclarer de connexion, et l'écran le dit avant le clic.

## Scope

**Le formulaire d'`A2`, inchangé**, à une cellule près : le sélecteur « Projet » n'a plus de sens — il
proposerait de changer un choix que l'étape 1 vient de trancher, et son entrée « + Nouveau projet… »
rebouclerait vers l'étape qu'on quitte.

**À sa place, un constat** : l'étiquette « Projet » surmontant l'icône `bag` et le nom du projet, à la
hauteur du champ qu'il remplace pour que l'alignement en bas de la rangée d'identité tienne. **Pas un
`Chip`** : la conception UI le proposait et signalait elle-même le risque — un chip est un contrôle
partout ailleurs dans ce produit, et un chip inerte se lit comme un contrôle en panne. Du texte
étiqueté ne pose pas la question.

**« Annuler » devient « Plus tard ».** À cette étape, « Annuler » mentirait : le projet reste. Un bouton
ne doit pas nommer un défaissement qui n'a pas lieu — c'est la règle de `08j` prise par l'autre bout.

**Une ligne d'information sous le pied**, avant tout clic : « Le projet *Ventes* est créé. Vous pouvez
déclarer sa première connexion maintenant, ou plus tard depuis la sidebar. » Elle fait trois choses en
une phrase — elle confirme l'écriture de l'étape 1, elle rend « Plus tard » sans conséquence, et elle
nomme le chemin de retour.

**Un échec d'enregistrement dit que le projet est gardé** : « Le projet *Ventes* est créé ; la connexion
n'a pas été enregistrée. » Sans cette précision, l'utilisateur ferme, recommence par « Nouveau projet »,
et se heurte à « ce nom est déjà pris » — le défaut se produirait à coup sûr.

**Trois branches disparaissent d'`A2`** : la sentinelle `NOUVEAU_PROJET`, la rangée « Nom du nouveau
projet » que le handoff ne maquette pas, et le repli sur le trio par défaut de `23d` — le groupe
d'environnements est désormais alimenté par des environnements **réellement déclarés**.

## Not in this scope

- **Le formulaire lui-même** : `08b`–`08e`, `23d`. Ni le moteur, ni la grille, ni le panneau proxy, ni
  « Tester la connexion » ne changent.
- **Ce qui suit l'enregistrement** : `09` ouvre déjà la base.
- **Un bouton « Retour ».** Le projet est écrit ; revenir voudrait dire l'éditer, ce qui est `23e`.

## Approach

Un projet vide peut donc rester, et **rien ne le nettoie** — tranché par le commanditaire le 19 août
2026, après examen des trois réponses possibles. C'est la reconduction explicite de l'arbitrage de
`08f` : défaire la création à la suite d'un abandon supprimerait un projet pour un échec
de connexion, et détruirait un homonyme en cas de course. L'arbre le montre, `23g` lui fait dire
« aucune connexion déclarée en *dev* », et `08j` sait le retirer avec une confirmation qui compte
« 0 connexion, 0 mot de passe ».

**Le brouillon n'est pas persisté** si la fenêtre se ferme entre les deux étapes, et c'est une décision :
il contient un mot de passe, et `08e` pose que cette valeur quitte le JavaScript sans y revenir.
Restaurer un brouillon de connexion voudrait dire écrire un secret quelque part.

## Done when

- [x] Après création du projet, la modale montre le formulaire de connexion, projet imposé et affiché
- [x] La cellule « Projet » n'est pas un contrôle : ni `role`, ni curseur de pointeur, ni survol
- [x] Sa hauteur est celle du sélecteur qu'elle remplace, et la rangée d'identité reste alignée
- [x] « Plus tard » ferme, garde le projet, et l'arbre le montre avec sa phrase de `23g`
- [x] La ligne d'information nomme le projet créé et le chemin de retour
- [x] Un échec d'enregistrement dit que le projet est gardé
- [x] `NOUVEAU_PROJET`, la rangée « Nom du nouveau projet » et le repli sur le trio n'existent plus
