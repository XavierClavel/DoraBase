# Handoff : DoraBase — explorateur de bases de données (macOS desktop)

## Overview

DoraBase est une application desktop macOS d'exploration de bases de données, pensée
comme une alternative légère à l'explorateur intégré d'IntelliJ (même densité
d'information, sans l'IDE) et volontairement plus soignée que phpMyAdmin / pgAdmin.

Le nom et l'identité s'inspirent de « Dora l'exploratrice » : registre enfantin/écolier,
papier crème, sac à dos, carte. Le ton visuel reste toutefois un outil de travail dense
— pas un jouet.

Périmètre fonctionnel couvert par les maquettes :

1. Gestion de **projets** ; chaque projet regroupe plusieurs bases, chaque base se décline
   par **environnement** (dev / staging / prod) choisi globalement pour le projet.
2. Création de connexion : identifiants, hôte, port, moteur, SSL, proxy / tunnel SSH.
3. Exploration bases → schémas → tables / vues / fonctions / index.
4. Visualiseur de table : filtres par en-tête de colonne, SQL brut masqué par défaut, tri, LIMIT.
5. Édition inline des cellules avec **modifications en attente** + diff à valider (⌘↩).
6. Console dans le langage du moteur (SQL, mongosh, commandes Redis) avec résultats
   en tableau ou en JSON.
7. Structure & DDL d'une table.
8. Préférences (apparence, densité, garde-fous d'écriture).

Moteurs à supporter : PostgreSQL, MySQL / MariaDB, SQLite, MongoDB, Redis,
Snowflake, BigQuery.

## About the Design Files

Les fichiers de ce bundle sont des **références de design réalisées en HTML** : des
maquettes qui montrent l'apparence et le comportement attendus, **pas du code de
production à copier**.

L'implémentation cible annoncée est **Kotlin desktop** (Compose Multiplatform / Compose
for Desktop). La tâche est donc de **recréer ces écrans dans l'environnement du projet**,
avec ses composants et ses conventions — la référence visuelle est « shadcn-like » :
composants classiques et intuitifs, bordures fines, coins arrondis modérés, beaucoup
d'icônes en trait (stroke, pas de fill).

Le fichier `DoraBase.dc.html` est un **canvas de présentation** : il contient les 10
écrans côte à côte, chacun dans une fenêtre macOS de 1360 px de large. Le chrome de
fenêtre (feux tricolores, ombre portée) fait partie de la maquette, pas de l'app.

## Fidelity

**High-fidelity.** Couleurs, typographie, espacements, tailles de police et densité sont
définitifs et doivent être respectés au pixel près, dans la mesure où le toolkit cible le
permet. Les états d'interaction (hover, focus, actif) ne sont pas maquettés : les dériver
des tokens ci-dessous (règles données en section « Interactions »).

Toutes les données affichées sont fictives mais réalistes ; les remplacer par les données
réelles, en conservant les formats (nombres à espace fine insécable, dates
`YYYY-MM-DD HH:mm:ss`, tailles en unités SI).

---

## Modèle de données de l'UI

```
Projet (ex. « Atelier Nord »)
├── environnement actif : dev | staging | prod   ← global au projet
└── Base (ex. « analytics », moteur PostgreSQL)
    └── déclinaison par environnement (host/port/creds différents par env)
        └── Schéma / Database (ex. « public »)
            └── Table | Vue | Fonction | Index
```

Points importants :

- Le **sac à dos** (sidebar) liste des **projets**, pas des connexions.
- Une base appartient à un projet et existe en 1..n environnements. Basculer
  l'environnement recharge l'arbre et les onglets ouverts sur la même base, autre serveur.
- Le badge d'environnement du projet dans l'arbre reflète l'environnement actif.

---

## Écrans

Les 10 écrans du canvas, dans l'ordre. Sauf mention contraire : fenêtre 1360 px de large,
barre de titre 40 px, barre d'état 26 px, corps 722 px.

### A1 — Première ouverture (aucun projet)

- **But** : amorcer la création du premier projet.
- **Layout** : sidebar 236 px (fond `#F7F2E8`) + zone centrale.
- Sidebar : en-tête 32 px « MES PROJETS » (icône sac à dos, 10.5 px, 700, `letter-spacing .7px`,
  uppercase, `rgba(35,32,28,.45)`), état vide centré (carré 46 px, bordure `2px dashed
  rgba(35,32,28,.18)`, radius 14 px, icône base 20 px), titre « Aucun projet » 12 px/600,
  sous-texte 11.5 px `rgba(35,32,28,.4)`, puis bouton pleine largeur 28 px radius 8 px
  fond accent « + Nouveau projet ».
- Zone centrale : fond `radial-gradient(120% 90% at 50% 0%, #FFFDF8, #F8F3E9)`,
  bloc centré 640 px — logo 72 px (radius 17 px), titre « Prêt à explorer ? » 27 px/700
  Baloo 2, sous-titre 13.5 px `rgba(35,32,28,.55)` max 420 px, un **seul** bouton :
  « + Nouveau projet ⌘N », 34 px, radius 10 px, fond `#23201C`, texte `#FBF7EF`,
  raccourci en JetBrains Mono 11 px opacité .5.
- Barre d'état : « 0 projet · ⌘K palette » … « DoraBase 0.4.2 ».

### A2 — Nouvelle connexion (modale)

- **But** : déclarer une base dans un projet, pour un environnement donné.
- Fenêtre en arrière-plan grisée (`opacity .55` sur le wordmark, feux `#DCD6CB`),
  voile `rgba(35,32,28,.28)`, modale 820 px, radius 14 px, ombre
  `0 30px 70px -18px rgba(35,32,28,.55)`, bordure `1px rgba(35,32,28,.14)`.
- **En-tête modale** 44 px, fond blanc : pastille 24 px `#E6EFF8` + icône base `#31648F`,
  titre « Nouvelle connexion » 14.5 px Baloo 2, croix à droite.
- **Sélecteur de moteur** : chips 30 px radius 9 px, actif = fond accent + texte blanc +
  ombre `0 4px 10px -4px`, inactifs = blanc bordure `rgba(35,32,28,.14)`. Ordre :
  PostgreSQL, MySQL, SQLite, MongoDB, Redis, Snowflake, BigQuery. Monogrammes colorés :
  Pg `#31648F`, My `#A9762A`, Sq `#2E7D57`, Mg `#3C7A2B`, Rd `#B23B27`.
- **Formulaire** (grille 2 colonnes, gap 12/18 px) :
  - Ligne 1 (3 colonnes `1fr 196px auto`) : Nom de la base · Projet (select avec icône sac
    à dos) · Variante d'environnement (3 boutons dev / staging / prod ; prod = fond
    `#FCE9E4`, bordure `1.5px #D9432F`, texte `#B0331F`, icône warning).
  - Hôte (+ Port 84 px) · Base par défaut · Utilisateur · Mot de passe (points, œil,
    badge vert « Trousseau »).
  - Mode SSL (select) · deux toggles : « Ouvrir en lecture seule » (on),
    « Se reconnecter au démarrage » (off).
- **Panneau proxy / tunnel** : encadré radius 11 px fond `#F7F2E8`, en-tête 34 px avec
  chevron, bouclier `#5B47AE`, badge lavande « SSH activé ». Champs : Type (SSH),
  Hôte du bastion, Port, Utilisateur, Clé privée (+ bouton « Parcourir… »),
  Port local mappé (champ désactivé `1px dashed`, « auto (63342) »).
- **Pied** 56 px fond blanc : « Tester la connexion » (fiole verte) + résultat inline
  vert « Connecté en 240 ms · PostgreSQL 16.2 » ; à droite « Annuler » puis
  « Enregistrer & ouvrir ⌘↩ » (fond accent).
- **Champs** : hauteur 30 px (28 px dans le panneau proxy), radius 8 px, fond blanc,
  bordure `1px rgba(35,32,28,.16)`, texte 12 px — JetBrains Mono pour toute valeur
  technique (hôte, port, user, chemin), Nunito pour le reste. Label 11 px/600
  `rgba(35,32,28,.6)`, marge basse 4 px.

### A3 — Échec de connexion

Identique à A2 (mêmes champs, mêmes valeurs) **plus une sous-modale bloquante** au centre :

- Voile supplémentaire `rgba(35,32,28,.45)`, boîte 436 px radius 12 px.
- Pastille 30 px rouge `#D9432F` + icône warning blanche ; titre « Connexion impossible »
  14 px/700 `#8E2A19` ; texte explicatif 12 px `rgba(35,32,28,.65)` ; encart log
  `#F5F0E6` radius 8 px, JetBrains Mono 11 px, avec la ligne d'échec en `#C6321E`.
- Pied 46 px blanc, un seul bouton « Fermer » + hint `esc` (fond `#23201C`).
- **La modale sous-jacente n'est pas surlignée en rouge** : l'erreur ne vit que dans la
  sous-modale. Le pied de la modale affiche « Retester » + message d'échec inline
  `#B0331F` ; « Enregistrer & ouvrir » est désactivé (fond `rgba(35,32,28,.14)`,
  texte `rgba(35,32,28,.4)`).

### A4 — Explorateur (projets → bases → schémas → tables)

- **Barre de titre** (40 px) : feux, logo 22 px + « DoraBase » 13 px Baloo 2 ;
  au centre une pastille blanche 24 px radius 8 px : point d'état vert 6 px, icône sac
  à dos, nom du projet + chevron, fil d'Ariane `analytics · public` (JetBrains Mono 11 px
  `rgba(35,32,28,.45)`), badge « LECTURE SEULE » ; **puis, dans une seconde boîte blanche
  séparée (margin-left 8 px)**, le sélecteur d'environnement : label « ENV » 9 px/700
  uppercase + select 19 px (point de couleur, valeur, chevron).
  À droite : icônes console et préférences 15 px.
- **Sidebar** 252 px : barre de filtre 34 px (loupe, placeholder, bouton +), arbre :
  projet actif déplié (badge PROD `#FCE9E4`/`#B0331F`) → base (taille à droite) →
  schéma sélectionné → tables (icône verte, nombre de lignes) → vues (icône pointillée
  `#7C5CD6`) ; puis les autres bases du projet (shop MySQL, tracking Mongo, cache Redis,
  warehouse BigQuery) ; puis les projets voisins repliés avec « n bases » ;
  pied 28 px « + Ajouter une base » + rafraîchir.
- **Poignée de redimensionnement** entre panneaux : 5 px, dégradé
  `linear-gradient(90deg, rgba(35,32,28,.06), transparent)`, pastille centrale
  3×26 px radius 2 px `rgba(35,32,28,.16)`.
- **Centre** : barre d'onglets 34 px (fond `#F5F0E6`, onglet actif fond `#FBF7EF` +
  `border-top 2px accent`), barre de fil d'Ariane 34 px, puis la liste des objets du
  schéma en tableau : Nom, Lignes, Taille, Col., Clé primaire, Dernier ANALYZE,
  Commentaire. Ligne sélectionnée : fond accent 9 %, `inset 2px 0 0 accent`.
  Segmented control à droite : Tables 8 · Vues 2 · Fonctions 6 · Index 31.
- **Panneau droit** 300 px : en-tête 34 px `public.orders` + épingle ; 2 tuiles stats
  (Lignes 1.9 M, Taille 2.1 GB) ; liste des colonnes (5 + « 13 autres ») avec icônes clé
  `#F5B335` et FK `#3B82C4` ; grille 2×2 d'actions (Ouvrir les données = accent,
  Structure, SELECT dans console, Exporter CSV) ; bloc Relations.

### A5 — Visualiseur de table

- Barre de titre : fil d'Ariane `analytics · public · orders`, badge PROD, boîte env.
- **Sidebar 212 px** (référence commune à A5–A9, voir « Menu latéral standard »).
- **Toolbar** 36 px : bouton rafraîchir 25 px, stepper `LIMIT 500`, chips de filtres actifs
  (fond accent 13 %, bordure accent 45 %, texte `#A83F19`, croix), chip de tri
  (`created_at desc`), à droite « Voir le SQL » (SQL brut **masqué par défaut**),
  compteur de colonnes `16/18`, export.
- **Grille** : ligne d'en-tête 26 px `#F5F0E6` + **seconde ligne d'en-tête de filtres**
  (champs 20 px radius 5 px, opérateur à gauche en gras `#A83F19`) ; colonnes filtrées
  teintées `rgba(242,101,58,.10)`, colonne triée `.06` avec flèche + rang de tri en pastille.
  Lignes 26 px (paramétrable 20–36), séparateurs `rgba(35,32,28,.07)`, gouttière `#` 30 px.
  Ligne sélectionnée : fond `rgba(59,130,196,.10)` + `inset 2px 0 0 #3B82C4`.
  Valeurs numériques et dates en JetBrains Mono 11.5 px ; `NULL` en `rgba(35,32,28,.35)` ;
  `status` rendu en pastille (paid vert `#E7F3EC`/`#2E7D57`, pending ambre, refunded rouge,
  cancelled neutre).
- **Popover d'opérateur** (ouvert sur `status`) : 198 px, radius 10 px, ombre
  `0 16px 34px -12px`, liste d'opérateurs (=, ≠, in, ~, is null) + bloc « Valeurs
  fréquentes » avec pourcentages.
- **Panneau droit** 296 px : en-tête `Ligne 3 · id 184217` + flèches préc./suiv.,
  onglets Champs / JSON / Liens, liste clé-valeur (labels 96 px Nunito 11 px, valeurs mono),
  `metadata` en JSON coloré, bloc « Ligne liée · users » **affiché uniquement parce que la
  table cible expose des champs identifiables** (`email`, `name` — voir règle ci-dessous),
  et un bouton pleine largeur « Copier la ligne en INSERT ».
- Barre d'état : `500 lignes · 41 ms · 2 filtres · order by created_at desc · limit 500`,
  à droite `lecture seule — ⌘E pour éditer`.

**Règle « ligne liée »** : pour une clé étrangère, n'afficher l'aperçu de la ligne cible
que si celle-ci contient au moins un champ lisible par un humain — liste blanche
insensible à la casse : `email`, `name`, `label`, `title`, `first_name`/`firstName`,
`last_name`/`lastName`, `username`, `slug`, `code`, `reference`. Sinon, ne rien afficher
(pas de dump d'identifiants techniques). Mentionner les champs détectés en légende.

### A6 — Édition inline

- Barre de titre : badge ambre « ÉDITION » à la place de « LECTURE SEULE ».
- **Bandeau d'avertissement** 34 px sous la barre de titre, fond `#FDF3E0`, bordure basse
  `rgba(245,179,53,.5)` : icône warning `#8C5E12`, « 3 modifications en attente sur
  public.orders », rappel « rien n'est envoyé à la base avant validation », puis
  « Voir le SQL », « Tout annuler », « Appliquer ⌘↩ » (vert `#2E9E6B`).
  *Pas de chip « Mode édition » dans la toolbar : le bandeau suffit.*
- Corps 688 px. Sidebar standard, avec compteur `3` (pastille accent) sur `orders` et les
  colonnes touchées annotées « modifié » / « en saisie » en `#8C5E12`.
- **Grille** : lignes modifiées fond `#FDF6E8` avec numéro de ligne en `#8C5E12` ;
  cellules modifiées fond `#FBEFD6` + `inset 0 0 0 1.5px #E9A82B` ;
  **cellule en saisie** : boîte flottante blanche débordant de 3 px, bordure `2px accent`,
  ombre `0 6px 16px -6px`, caret 1.5×14 px.
- **Tooltip de raccourcis** flottant sous la cellule éditée : fond `#23201C`, texte
  `#FBF7EF`, touches en pastilles `rgba(251,247,239,.16)` — `⌘↩` appliquer, `↩` valider
  la cellule, `esc` annuler.
- **Panneau droit** 330 px « Modifications en attente (3) » : une carte par modification
  (en-tête `ligne n · id`, ancienne valeur barrée rouge → nouvelle valeur verte),
  bloc SQL sombre « SQL qui sera exécuté » (BEGIN / UPDATE… / COMMIT), encart rouge
  rappelant que la base est en prod (confirmation supplémentaire + patch inverse 24 h),
  puis « Tout annuler » / « Appliquer ⌘↩ ».
- Barre d'état ambre : `3 modifications en attente · 0 envoyée · transaction non ouverte`.

### A7 — Console SQL

- Sidebar standard 212 px, avec section « Mes requêtes » (favoris étoilés) et
  pied « + Nouvelle console ».
- Onglet console : icône terminal `#5B47AE`, `border-top 2px #7C5CD6`, suffixe `·psql`.
- **Toolbar** 34 px : « Exécuter ⌘↩ » (vert), « Sélection ⌥↩ », « Expliquer »,
  séparateur, sélecteur de base, **boîte env**, « auto-LIMIT 1000 »,
  à droite « Enregistrer » (étoile) et « Formater ».
- **Éditeur** 250 px, fond `#23201C`, gouttière de numéros de ligne 34 px
  (`rgba(251,247,239,.28)`), texte 12.5 px/1.85 JetBrains Mono `#EDE7DA`.
  Coloration : mots-clés `#F5B335`, chaînes `#9BD68C`, nombres `#7FB8E8`,
  commentaires `#8E877A`.
- **Popup d'autocomplétion** : 250 px, fond `#2E2A25`, ligne active
  `rgba(242,101,58,.28)`, pied d'aide 22 px.
- Séparateur horizontal 5 px avec pastille 26×3 px.
- **Onglets de résultat** 29 px : Résultat (actif, `border-bottom 2px accent`), JSON, Plan,
  Messages ; à droite `14 lignes · 128 ms · plan 2.4 ms` + export + copie.
- **Tableau de résultat** : mêmes règles que la grille de données, avec le type de chaque
  colonne en légende dans l'en-tête (`timestamp`, `int8`, `numeric`).
  *Pas de barres de répartition dans les résultats.*

### A8 — Console MongoDB, résultats JSON

Même coquille que A7 (sidebar iso, toolbar, séparateur, onglets) avec :

- Projet en **staging** (badge vert `#E9F5E4`/`#3C7A2B`, select env sur « staging »).
- Sidebar : `Collections` puis `Schéma déduit` (taux de présence par champ).
- Éditeur 150 px en `mongosh` : opérateurs `$match`/`$group`/`$sort` en `#7FB8E8`.
- Onglet **JSON** actif (`border-bottom 2px #7C5CD6`) : arbre pliable, clés `#31648F`,
  chaînes `#C9502A`, nombres `#2E7D57`, accolades `#7C5CD6`, chevrons ▾ / ▸ ;
  bascule Vue arbre / Vue brute / Aplatir en tableau.
- Panneau droit 300 px : document sélectionné en clé-valeur, puis encart lavande
  rappelant que la console prend le langage du moteur (SQL / mongosh / clé-valeur Redis).

### A9 — Structure & DDL

- Sidebar standard 212 px.
- Segmented control en haut à droite : Données / **Structure** (actif, fond `#23201C`).
- **Tableau des colonnes** : #, colonne, type, null (yes vert / no rouge), défaut, clé
  (icônes clé / FK), commentaire.
- Sous le tableau, deux colonnes : **Index** (nom + définition mono) et
  **Contraintes & triggers**.
- **Panneau DDL** 392 px, fond `#23201C` : en-tête 34 px avec actions Copier et `.sql`,
  `CREATE TABLE` complet coloré, commentaire final `-- 1 904 220 lignes · 2.1 GB · toast 340 MB`,
  pied avec « Ouvrir dans la console » et « Diagramme ».

### A10 — Préférences

Fenêtre 940 px × 560 px, barre de titre centrée « Préférences ».

- Sidebar 186 px : Général, **Apparence** (actif, fond accent), Grille de données,
  Éditeur SQL, Bases du projet, Sécurité & écriture, Raccourcis ; version en bas.
- Contenu : 3 vignettes de thème (Cahier actif, Nuit, Système), nuancier d'accent
  (6 pastilles 26 px, sélection = double anneau), curseur de densité de ligne (26 px),
  police de code (JetBrains Mono, 12.5 pt), puis **Garde-fous** (4 toggles avec titre
  12 px/700 + description 11.5 px) :
  1. Modifications en attente avant écriture — **on**
  2. Ouvrir les bases « prod » en lecture seule — **on**
  3. Refuser DELETE/UPDATE sans clause WHERE — **on**
  4. Garder le patch inverse 24 h — off
- Pied 44 px blanc : « Réinitialiser » + « Terminé ».

---

## Menu latéral standard (A5 → A9)

Tous les écrans de travail partagent **exactement** le même composant :

- Largeur **212 px**, fond `#F7F2E8`, bordure droite `1px rgba(35,32,28,.1)`,
  `font: 600 11.5px Nunito`, colonne flex.
- **Barre de filtre** 34 px : loupe 12 px, placeholder « Filtrer l'arborescence… »
  (11.5 px/500 `rgba(35,32,28,.35)`), compteur mono 10 px à droite.
- **Arbre**, lignes de 22 px, indentation par paliers de 14 px
  (projet 8 px → base 22 px → schéma 36 px → table 52 px) :
  - projet actif : chevron ouvert, sac à dos `#C9502A`, nom en 700, badge d'environnement
    15 px (PROD `#FCE9E4`/`#B0331F`, STAGING `#E9F5E4`/`#3C7A2B`) ;
  - base : chevron ouvert, icône base colorée par moteur ;
  - schéma : chevron ouvert, icône dossier `#C9502A` ;
  - tables : icône table `#2E9E6B` 12 px, métadonnée mono 10 px à droite ;
  - projets voisins repliés : chevron fermé, sac à dos gris, « n bases » 9.5 px/700.
- **Élément sélectionné** : fond `color-mix(in oklab, var(--accent) 22%, transparent)`,
  `box-shadow: inset 2px 0 0 var(--accent)`, texte encre `#23201C` en 700.
  (Volontairement atténué — pas d'aplat plein d'accent.)
- **Section contextuelle** en bas de l'arbre, titre 9.5 px/700 uppercase
  `rgba(35,32,28,.35)`, hauteur 18 px : « Colonnes de <table> » (A5, A6, A9),
  « Mes requêtes » (A7), « Schéma déduit » (A8). Lignes de colonne : 20 px, mono 11 px,
  glyphe de type 11 px à gauche (`T`, `#`, `⏱`, `{}`, `ID`, ou icône clé/FK),
  métadonnée à droite.
- **Pied** (consoles seulement) : bouton 26 px « + Nouvelle console ».

---

## Interactions & comportement

### Navigation
- Split view à **panneaux redimensionnables** : poignées de 5 px entre sidebar, centre et
  panneau de détail ; largeurs persistées par écran.
- Onglets de contenu (schéma, table, console) : réordonnables, fermables ;
  onglet actif = `border-top 2px accent` + fond `#FBF7EF`.
- Palette de commandes `⌘K` (aller à une table, une colonne, une requête).
- `⌘P` recherche d'objet dans le schéma courant.

### Environnement
- Le select d'environnement agit sur **tout le projet** : toutes les bases basculent
  ensemble, les onglets ouverts se rechargent sur la même cible logique.
- Passer en `prod` réapplique les garde-fous (lecture seule par défaut, confirmation).

### Filtres et tri
- Filtres **par en-tête de colonne** en premier : chaque colonne a un champ
  opérateur + valeur ; un clic sur l'opérateur ouvre le popover (opérateurs + valeurs
  fréquentes avec fréquences).
- Le **SQL brut est masqué par défaut** : bouton « Voir le SQL » qui déplie la clause
  `WHERE`/`ORDER BY` générée, éditable ; toute édition manuelle se répercute dans les chips.
- Tri : clic sur l'en-tête cycle asc → desc → aucun ; tri multiple avec rang numéroté.
- `LIMIT` en stepper, valeurs 100 / 500 / 1000 / 5000.

### Édition
- Simple clic sélectionne la cellule, `↩` ou double-clic passe en saisie.
- `↩` valide la cellule (la modification rejoint la file d'attente), `esc` annule la saisie,
  `⌘Z` annule la dernière modification en attente.
- **Rien n'est écrit avant `⌘↩`** : le diff s'accumule dans le panneau droit, avec le SQL
  exact qui sera exécuté dans une transaction unique (BEGIN / … / COMMIT).
- En environnement `prod` : confirmation supplémentaire et conservation d'un patch inverse
  pendant 24 h (option).
- Refus des `DELETE`/`UPDATE` sans `WHERE`, dans la grille comme dans la console.

### Console
- `⌘↩` exécute la requête sous le curseur, `⌥↩` exécute la sélection.
- Autocomplétion sur tables, colonnes, fonctions ; `↑↓` naviguer, `⇥` insérer.
- Résultats : Tableau / JSON / Plan / Messages ; auto-LIMIT paramétrable.
- Le langage suit le moteur : SQL (Postgres, MySQL, SQLite, Snowflake, BigQuery),
  `mongosh` (MongoDB), commandes clé/valeur (Redis).

### États non maquettés (à dériver)
- **Hover** de ligne d'arbre / de tableau : fond `rgba(35,32,28,.05)`.
- **Hover** de bouton secondaire : bordure `rgba(35,32,28,.26)`, fond `#FFFDF8`.
- **Focus clavier** : anneau `0 0 0 2px color-mix(in oklab, var(--accent) 45%, transparent)`.
- **Chargement** : barre de progression indéterminée 2 px sous la toolbar, en accent ;
  les cellules affichent un placeholder `▒` en `rgba(35,32,28,.12)`.
- **Erreur de requête** : onglet Messages avec le code SQLSTATE et la position, ligne
  fautive surlignée dans l'éditeur.

---

## Design tokens

### Couleurs — surfaces & encre
| Rôle | Valeur |
| --- | --- |
| Fond application / canvas | `#EFEAE0` |
| Papier (fenêtre, contenu) | `#FBF7EF` |
| Papier alternatif (sidebar, panneaux) | `#F7F2E8` |
| Barres (onglets, en-têtes de tableau, état) | `#F5F0E6` |
| Champ / carte sur papier | `#FFFFFF` |
| Champ désactivé, pastille neutre | `#F1ECE2` |
| Encre principale | `#23201C` |
| Encre secondaire | `rgba(35,32,28,.55)` |
| Encre tertiaire / placeholder | `rgba(35,32,28,.35)` |
| Bordure standard | `rgba(35,32,28,.14)` |
| Bordure de champ | `rgba(35,32,28,.16)` |
| Séparateur | `rgba(35,32,28,.10)` |
| Lignes de grille | `rgba(35,32,28,.07)` |
| Surface sombre (code, DDL) | `#23201C` |
| Encre sur sombre | `#EDE7DA` |
| Surface sombre secondaire (popup) | `#2E2A25` |

### Couleurs — accent & sémantique
| Rôle | Valeur |
| --- | --- |
| Accent (défaut) | `#F2653A` |
| Accent — variantes proposées | `#DB3753`, `#E4573F`, `#2E9E6B`, `#3B82C4`, `#7C5CD6` |
| Accent foncé (texte sur teinte) | `#C9502A` / `#A83F19` |
| Succès | `#2E9E6B` — fond `#E7F3EC`, texte `#2E7D57` |
| Alerte / en attente | `#E9A82B` — fond `#FDF0DC` / `#FDF3E0`, texte `#8C5E12` |
| Danger | `#D9432F` — fond `#FCE9E4` / `#FCEAE5`, texte `#B0331F` / `#8E2A19` |
| Info / sélection de ligne | `#3B82C4` — fond `rgba(59,130,196,.10)` |
| Violet (console, vues) | `#7C5CD6` / `#5B47AE` — fond `#EEEAFA` |
| Or (clé primaire) | `#F5B335` |

### Couleurs par moteur
PostgreSQL `#31648F` (fond `#E6EFF8`) · MySQL `#A9762A` (`#FDF0DC`) ·
SQLite `#2E7D57` (`#E7F3EC`) · MongoDB `#3C7A2B` (`#E9F5E4`) ·
Redis `#B23B27` (`#FBE7E3`) · Snowflake / BigQuery `#5B47AE` (`#EEEAFA`).

### Coloration syntaxique (fond `#23201C`)
Mots-clés `#F5B335` · chaînes `#9BD68C` · nombres / types `#7FB8E8` ·
identifiants `#EDE7DA` · commentaires `#8E877A` · numéros de ligne `rgba(251,247,239,.28)`.
JSON sur papier : clés `#31648F` · chaînes `#C9502A` · nombres `#2E7D57` ·
ponctuation `#7C5CD6`.

### Typographie
| Usage | Police / taille |
| --- | --- |
| Wordmark, titres d'écran | **Baloo 2** 700 — 27 px (hero), 14.5 px (modale), 13 px (barre de titre) |
| UI générale | **Nunito** 600/700 — 12.5 px (corps), 11.5 px (dense), 11 px (labels) |
| Micro-labels uppercase | Nunito 700/800, 9.5–10.5 px, `letter-spacing .6–.7px` |
| Données, code, valeurs techniques | **JetBrains Mono** 500 — 12.5 px (éditeur), 11.5 px (grille), 11 px (méta), 10 px (compteurs) |

Interligne : 1 pour les cellules de grille, 1.45 pour l'UI, 1.75–1.85 pour le code.

### Espacement, rayons, ombres
- Échelle d'espacement : 3 · 5 · 6 · 7 · 9 · 11 · 14 · 16 px.
- Hauteurs standard : ligne d'arbre 22 px · ligne de grille **26 px** (réglable 20–36) ·
  petit bouton 23–25 px · bouton 28–31 px · champ 30 px · barres 34 px · barre de titre 40 px ·
  barre d'état 26 px.
- Rayons : 4–5 px (pastille), 6–7 px (petit contrôle), 8–9 px (bouton, champ, carte),
  10–12 px (encart), 14 px (fenêtre, modale), 20 px (logo hero).
- Ombres :
  - fenêtre `0 26px 60px -26px rgba(35,32,28,.45), 0 0 0 1px rgba(35,32,28,.13)`
  - modale `0 30px 70px -18px rgba(35,32,28,.55)`
  - popover `0 16px 34px -12px rgba(35,32,28,.40)`
  - bouton accent `0 5px 12px -5px` de la couleur d'accent à 70 %
  - cellule en saisie `0 6px 16px -6px rgba(35,32,28,.40)`

### Paramètres exposés (tweaks du prototype)
- `accent` — couleur d'accent (défaut `#F2653A`).
- `rowHeight` — hauteur de ligne de grille, 20 → 36 px (défaut 26).
- `gridLines` — afficher les lignes de grille (défaut vrai).

---

## Iconographie

Toutes les icônes sont des SVG **en trait**, `viewBox 0 0 24 24`, `fill: none`,
`stroke-width` 1.8–2.2 (2.4–2.6 pour les chevrons), `stroke-linecap`/`linejoin: round`,
rendues à 10–17 px selon le contexte. Jeu utilisé (ids dans le prototype) :

`srv` serveur · `db` base · `schema` schéma · `table` table · `view` vue ·
`key` clé primaire · `fk` clé étrangère · `play` exécuter · `filter` filtre ·
`sort`/`asc`/`desc` tri · `plus` · `check` · `x` · `warn` · `term` console ·
`gear` préférences · `search` · `chevr`/`chevd` chevrons · `lock` · `cloud` ·
`refresh` · `save` · `trash` · `pencil` · `json` · `cols` colonnes · `eye` ·
`dl` export · `slid` formater · `copy` · `star` favori · `pin` · `compass` ·
`bag` projet · `link` · `flask` tester · `clock` · `shield` proxy · `kbd` ·
`paint` apparence · `code` · `plan` plan d'exécution · `msg` messages.

## Assets

- **`icon-dorabase.svg`** — icône d'application, 512×512, exportable telle quelle :
  sac à dos couleur d'accent avec une carte dépliée dans la poche latérale gauche,
  sur fond papier `#FBF7EF`, contour encre `#23201C` 14 px.
  Décliner aux tailles macOS habituelles (16 → 1024) ; le tracé est prévu pour rester
  lisible à 32 px (simplifier la carte en dessous).
- Le même dessin est intégré au prototype comme symbole `#logo` et sert de logo dans les
  barres de titre (22 px) et sur l'écran d'accueil (72 px). Il hérite de la couleur
  d'accent via `var(--accent)`.
- Polices : Baloo 2, Nunito, JetBrains Mono (Google Fonts, licence SIL OFL).
  Les embarquer dans l'application plutôt que de les charger en ligne.

## Files

| Fichier | Contenu |
| --- | --- |
| `DoraBase.dc.html` | Les 10 écrans, canvas panoramique. Ouvrir dans un navigateur ; chaque fenêtre est légendée `A1` → `A10`. |
| `icon-dorabase.svg` | Icône d'application, source vectorielle. |
| `icon-preview.html` | Aperçu de l'icône à 256 px et 64 px. |
| `support.js` | Runtime du prototype — **aucune valeur pour l'implémentation**, présent uniquement pour que le HTML s'ouvre. |

Repères pour retrouver un écran dans le HTML : chercher `dv-scrn">A5` (ou tout autre
numéro d'écran) ; le bloc qui suit contient la fenêtre complète.
