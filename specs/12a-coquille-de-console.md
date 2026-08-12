# 12a — `A7` : la coquille de console

## Goal

Rendre l'écran de console atteignable : ses onglets, sa toolbar, et le partage vertical entre
l'éditeur et le résultat. Sans exécution.

## Scope

- Un onglet de console dans la bande de `10b`, distinct d'un onglet de table.
- « Nouvelle console » — plusieurs consoles coexistent, chacune avec son texte.
- La toolbar : « Exécuter », « Sélection ⌥↩ », « Expliquer », « auto-LIMIT 1000 », « Enregistrer »,
  « Formater ».
- Le `SplitPane` **horizontal** entre l'éditeur (haut) et le résultat (bas).
- La zone d'éditeur en lecture seule pour l'instant, et la zone de résultat vide qui le dit.

## Not in this scope

- **L'éditeur** → `12b`. Ici la zone existe et affiche du texte, sans saisie.
- **L'exécution** → `12c`. Les actions qui en dépendent sont désactivées avec leur raison — la règle
  de `09f`, et la leçon du défaut n° 36 : un bouton cliquable et inerte se lit comme une panne.
- **« Formater »** : demande un formateur SQL, qui est une décision de dépendance à part entière.
  Le bouton est là, désactivé, et dit pourquoi.
- **Les onglets de résultat** (JSON, Plan, Messages) → `12e`.
- **« Mes requêtes »** dans la sidebar → `12f`.

## Approche

### Un onglet de console est un onglet, pas un écran à part

`10b` a posé une bande d'onglets dont chaque entrée ouvre une table. Une console y prend sa place :
même bande, même fermeture, même réordonnancement. Un second système d'onglets à côté du premier
doublerait la navigation pour un seul écran.

Conséquence sur le modèle : `Onglet` cesse d'être « une table ouverte » pour devenir une **union** —
table ou console. C'est un changement de type qui touche `onglets.ts`, et c'est le vrai travail de
cette spec.

### Le partage est horizontal, et sa hauteur est mémorisée

`SplitPane` ne sait diviser qu'en colonnes (`03`). La console demande deux lignes. L'orientation
devient donc une propriété du composant, avec la même mécanique de mémorisation — et le même soin
qu'en `11d` sur la latence : rien ne doit rendre pendant le glissement.

### Chaque console garde son texte, et la fermer le perd

Le texte vit dans l'état de l'écran, indexé par l'identité de l'onglet — comme les modifications en
attente de `11b`. Fermer un onglet de console perd son contenu, et c'est ce que `12f` corrigera pour
les requêtes qu'on choisit d'enregistrer. Dit à la fermeture si le texte n'est pas vide.

## Done when

- [ ] « Nouvelle console » ouvre un onglet, et deux consoles gardent chacune son texte.
- [ ] Un onglet de console et un onglet de table cohabitent dans la même bande, et se ferment pareil.
- [ ] Le partage éditeur / résultat est vertical, réglable, et sa hauteur survit à un remontage.
- [ ] Les six actions de la toolbar sont présentes ; celles qui ne font rien sont désactivées et
      disent pourquoi.
- [ ] Comparaison visuelle contre `A7` : toolbar, proportions, zone de résultat vide.
- [ ] Aucune couleur littérale hors `tokens.json`.
