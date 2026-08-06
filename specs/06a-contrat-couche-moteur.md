# 06a — Contrat de la couche moteur

## Objectif

Définir ce que tout moteur doit savoir faire, et la forme des données qu'il rend :
structure introspectée et fenêtre de lignes. Sept moteurs sont annoncés au handoff ;
sans ce contrat, chacun imposerait sa forme aux écrans.

## Dépend de

`05a` (le modèle de configuration décrit *où* se connecter).

## Périmètre

- Le trait que chaque adaptateur implémente : se connecter, tester, introspecter,
  lire une fenêtre de lignes.
- **Le modèle d'introspection** : schéma, table, vue, fonction, index, colonne,
  contrainte, relation. C'est ce que `05a` a délibérément laissé de côté, sa forme
  venant du catalogue des bases et non de l'utilisateur.
- **Le type de fenêtre de lignes**, qui rend la contrainte IPC transverse
  vérifiable plutôt que recommandée.
- La forme des erreurs : code du moteur, position, message — sans jamais de secret.
- La projection TypeScript de tout ceci, générée comme en `05a`.

## Hors périmètre

- **Toute implémentation.** Aucune connexion, aucune requête, aucun catalogue lu.
  PostgreSQL vient en `06b`/`06c`/`06d` ; les six autres moteurs en `16`→`21`.
- **Le rendu.** Comment `A4` dessine un arbre ou `A9` un DDL appartient aux écrans.
- **Le SQL généré** — filtres, tri, `LIMIT`. Le contrat porte la *requête* comme
  intention structurée, sa traduction est l'affaire de chaque adaptateur (`06d`).
- **Le cache.** Rien n'est mémorisé entre deux appels : ni schéma, ni comptage.
  À reconsidérer si `09` mesure une lenteur réelle, pas par anticipation.
- **La génération de DDL** (`CREATE TABLE` de `A9`) → `06c`, où le catalogue est lu.

## Approche

### Ce que les écrans réclament, et qui fixe le modèle

Relevé dans `design/handoff/README.md`, pour ne rien modéliser qu'aucun écran
n'affiche :

| Écran | Ce qu'il montre |
| --- | --- |
| `A4` arbre | schémas, tables (nombre de lignes), vues |
| `A4` tableau | nom, lignes, taille, nombre de colonnes, clé primaire, dernier `ANALYZE`, commentaire |
| `A4` panneau | lignes, taille, colonnes avec clé et clé étrangère, relations |
| `A5` sidebar | colonnes avec un glyphe de type (`T`, `#`, `⏱`, `{}`, `ID`) |
| `A5` grille | une fenêtre de lignes, et son compte total |
| `A9` | colonnes (rang, type, nullable, défaut, clé, commentaire), index, contraintes, triggers |

Le glyphe de type de `A5` impose une **catégorie** de type en plus de son nom
natif : `varchar` et `text` partagent le glyphe `T`. Le contrat porte donc les deux —
le nom tel que le moteur le dit, et la catégorie qui décide du glyphe et de
l'alignement. Dériver la catégorie dans l'écran obligerait chaque écran à connaître
les types de sept moteurs.

### La contrainte IPC portée par un type

`specs/README.md` pose qu'aucun jeu de résultats complet ne traverse l'IPC. Une
recommandation se contourne ; un type se respecte. Lire des lignes rend donc une
**fenêtre** — un décalage, un nombre de lignes demandé, les lignes obtenues, et le
total quand il est connu — et aucune signature ne permet de demander « tout ».

Le total est optionnel, délibérément : sur une grande table, le compter exactement
coûte un parcours complet. `A5` affiche « 500 lignes », ce qui est le compte de la
fenêtre, pas de la table.

### Les erreurs disent ce que le handoff affiche

`A3` montre un échec de connexion avec ses lignes de journal ; `A7` un onglet
« Messages » avec « le code SQLSTATE et la position ». Le type d'erreur porte donc
un code, une position optionnelle, et un message — et **jamais** de secret, propriété
déjà acquise en `05c` et à ne pas défaire ici.

### Asynchrone, et pourquoi cela remonte jusqu'ici

Une requête peut durer. La bloquer sur le fil de l'IPC gèlerait l'interface, ce que
la barre de progression indéterminée du handoff suppose justement évitable. Le trait
est donc asynchrone, ce qui impose `tokio` au socle — décision structurante, prise
ici parce qu'elle contraint les quatre specs suivantes.

## Terminé quand

- Le trait existe, avec les quatre opérations, et compile sans aucun adaptateur.
- Le modèle d'introspection couvre les six lignes du tableau ci-dessus, et rien de
  plus : tout champ sans écran qui l'affiche est retiré.
- Le type de fenêtre de lignes rend impossible de demander un jeu complet — vérifié
  en constatant qu'aucune signature ne l'accepte.
- Un type d'erreur porte code, position et message, et aucune de ses variantes ne
  peut contenir un secret.
- La projection TypeScript est générée et son garde-fou en CI échoue si elle dérive.
- Aucun test n'a besoin d'une base : ce scope est purement déclaratif.
