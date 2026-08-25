# 25a — L'environnement, un nœud de l'arbre

## Goal

Les environnements d'un projet cessent d'être un point de vue qu'un sélecteur change : ils
deviennent un **palier de l'arbre**. Projet → environnement → connexion → console|schéma → objet.
Tous les environnements déclarés sont listés, chacun dépliable indépendamment.

## Scope

**Le palier.** L'arbre passe de quatre niveaux à cinq. Un nœud d'environnement porte, dans cet
ordre : une icône **teintée** de sa couleur déclarée, son libellé, le compte de connexions quand il
est replié (`3 connexions`, en `caps`), et le badge `PROD` quand son drapeau `production` est levé.

**Deux canaux pour deux informations.** La couleur déclarée voyage par `iconColor` ; le drapeau
`production` par un `Badge tone="danger"`. On n'emploie **pas** la correspondance
`EnvironmentColor → BadgeTone` qui existe presque : un environnement marqué production et coloré en
vert porterait un badge vert, et le travail de `23g` — « les garde-fous s'accrochent au drapeau,
jamais au libellé » — serait annulé à l'écran. Le badge d'alerte doit alerter.

**Une icône teintée, pas une pastille pleine.** Le disque de 7 px de l'ancien sélecteur y était la
vignette de valeur d'un champ. Dans l'arbre, tous les paliers portent une icône de 13 px en tête de
ligne : un disque plein casserait la colonne d'icônes que l'indentation aligne, et n'aurait que la
couleur pour dire ce qu'il dit — ce que `09d` refuse pour ses quatre états de connexion.

**Le glyphe est `pin`, et ce n'était pas le premier choix.** `srv` — deux baies empilées — dit mieux
ce qu'est un environnement, et c'est sur cette base qu'il avait été retenu. À l'écran, à 13 px, il ne
se distinguait pas du `db` de la connexion **juste en dessous** : deux paliers voisins, une seule
silhouette à bandes horizontales. La goutte de `pin` n'a de voisin nulle part dans l'arbre. Une icône
qui dit juste et qu'on confond n'apprend rien (défaut n° 119).

**Les identités de nœud portent l'environnement.** `idBase`, `idSchema`, `idObjet` et `idConsole` ne
le portaient pas, et `idConsole` le justifiait ainsi : « l'arbre ne montre jamais que les connexions
de l'environnement actif ». **Cette prémisse tombe.** Deux connexions homonymes de deux
environnements seront désormais listées ensemble ; sans l'identifiant dans la clé, elles partagent
leur dépliage, leur sélection, leur clé de rendu React et — le plus grave — leur entrée dans
`charge.schemas`, ce qui affiche la structure d'un serveur sous la ligne d'un autre.

**Un environnement sans connexion le dit** — « aucune connexion déclarée en *staging* » — plutôt que
de laisser une ligne vide, qui se lit comme un chargement en cours. C'est la règle de `23g`,
appliquée au palier qui la rend enfin nécessaire.

**Ce que la ligne projet perd.** Son badge d'environnement disparaît : il appelait un trio en dur
(`prod`/`staging`/`dev`) que `23g` s'était engagée à effacer et qui avait survécu là, et il n'y a
plus d'environnement actif à nommer. L'agréger en « ce projet contient une production » serait
inventer un état composite, ce que `09c` a déjà refusé pour le point de la pastille. Sa méta passe de
`n bases` à `n connexions` : depuis `23b`, la connexion est l'unité.

## Not in this scope

- **La barre de titre** : `25b`.
- **Un menu « … » sur la ligne d'environnement.** Ce palier rend les environnements *visibles et
  navigables* ; les modifier reste l'affaire de `23e`, atteignable depuis le « … » du projet. Un nœud
  sans menu n'est pas une anomalie — les schémas et les objets n'en ont pas. Relier les commandes de
  `23c` à la ligne qui les désigne est une amélioration réelle, et une spec à part.
- **Le retrait de `activeEnvironment` du modèle** : `25c`. Ici, on cesse de le lire.
- **Réordonner les environnements** (`23c`) : aucun geste de ligne évident dans un arbre, cela reste
  l'affaire de l'écran d'édition de projet (`23e`).
- **Persister les nœuds dépliés.** L'ensemble vit en mémoire dans `useArbre`, comme aujourd'hui.
- **Le désalignement des consoles**, feuilles sans chevron voisines de schémas qui en ont : 16 px
  d'écart entre frères, **déjà présent**, que ce chantier déplace de 36/52 à 52/68 sans l'aggraver.

## Approach

**Le 5e palier vaut 68 px, et il se dérive du mockup.** `TreeRow` affirme qu'« aucune formule ne
reproduit » sa table `['8px','22px','36px','52px']`, et c'est vrai de `8 + depth·14`. Mais les écarts
d'**abscisse d'icône** du mockup valent 14, 14, **0** : le « +16 » du dernier palier est exactement
`chevron (11) + gap (5)`, la gouttière qu'une feuille n'occupe pas. Le mockup a donc deux cadences —
`+14` entre deux nœuds dépliables, `+16` vers une feuille. Le pas 3 → 4 va d'un schéma à un objet,
donc `+16`. Les quatre premières valeurs ne bougent pas.

**La colonne suit, parce que c'est le budget de libellé qui est la propriété mesurée.** À 252 px de
contenu, un objet au palier 4 ne dispose plus que de 107 px de nom là où le mockup en donnait 123 à
son palier le plus profond. La colonne de galerie passe donc à **268 px** de contenu, et le plancher
du `SplitPane` des écrans de travail de 180 à **196 px** — à 180, un palier 4 laisse cinq caractères,
formellement correct et illisible. Écart au handoff assumé : le mockup n'a pas l'arbre à cinq paliers
dont son chiffre mesurait la colonne.

**La table d'indentation des lignes de message disparaît au profit d'`INDENT`.** Trois règles CSS
recopiaient les mêmes 36 et 52 pour les `.message`. Un palier de retard entre les deux tables se lit
comme un message mal aligné, et personne n'y pense en ajoutant un palier — c'est exactement ce qui
serait arrivé ici. `INDENT` est exportée, et `enfantsDe` dérive la profondeur des préfixes
d'identité (`e:` → 2, `d:` → 3, `s:` → 4) au lieu d'un booléen.

**Aucune extension de `TreeRow` hormis la profondeur.** Les trois emplacements nécessaires existent
déjà — `icon`+`iconColor`, `meta`+`metaVariant`, `trailing`. Ajouter un `dot` ou un `tint` figerait
une API pour un seul appelant.

**Trois défauts préexistants sont corrigés, parce que deux environnements dépliés les rendent
francs :** `viseeParLId` ignore l'environnement alors que l'identité d'onglet le porte — retirer
`analytics` en prod fermait les onglets d'`analytics` en dev et faussait le compte que la
confirmation de `08j` promet exact ; `dialecteDe` cherche une base par son seul nom, là où
`baseDeclaree` filtre correctement ; `useApplication` et `PendingPanel` comparent
`environment === 'prod'` au lieu de lire le drapeau, ce que `23g` interdit explicitement.

**Le décor de galerie déclare quatre environnements**, dont un marqué production **nommé autrement
que « prod »**, et deux connexions **homonymes** dans deux environnements différents. C'est la seule
forme de décor qui met en évidence à la fois un trio en dur survivant et une collision d'identité.
Tous les noms restent inventés (`AGENTS.md`, § « Décors de test : rien de réel »).

## Done when

- [ ] L'arbre montre projet → environnement → connexion → console|schéma → objet, cinq `aria-level`
- [ ] Les cinq paliers suivent `['8px','22px','36px','52px','68px']`, vérifié à la mesure
- [ ] Deux connexions homonymes de deux environnements se déplient, se sélectionnent et se chargent
      **indépendamment**, et un test le prouve sur `charge.schemas`
- [ ] Une ligne d'environnement porte sa couleur déclarée, son compte replié et `PROD` selon le
      **drapeau** — un environnement nommé « atelier » et marqué production porte le badge
- [ ] Un environnement sans connexion le dit sur une ligne de message alignée au palier 2
- [ ] La ligne projet n'a plus de badge d'environnement, et `badgeEnvironnement` n'existe plus
- [ ] Les lignes de message tirent leur indentation d'`INDENT`, et plus d'une table CSS
- [ ] Le décor de galerie déclare quatre environnements et deux connexions homonymes
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint` passent
