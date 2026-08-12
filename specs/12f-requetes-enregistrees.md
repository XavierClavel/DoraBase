# 12f — `A7` : les requêtes enregistrées

## Goal

La section « Mes requêtes » de la sidebar, et le bouton « Enregistrer » de la toolbar : garder une
requête, la rouvrir, la renommer, la retirer.

## Scope

- La persistance des requêtes dans la configuration (`05b`).
- La section « Mes requêtes » sous l'arbre, avec ses entrées.
- « Enregistrer » : nomme la requête courante, ou met à jour celle qui est ouverte.
- Le menu « … » d'une entrée — renommer, retirer — sur le modèle de `08h`.

## Not in this scope

- **Le partage entre plusieurs postes.** La configuration est locale ; synchroniser est un autre
  produit.
- **L'historique automatique des requêtes exécutées.** Utile, et distinct : l'un est un choix de
  l'utilisateur, l'autre un journal. Sa propre spec.
- **Les paramètres de requête** (`:date_debut`). Le handoff ne les montre pas.

## Approche

### Une requête enregistrée appartient au projet, pas à la base

Le mockup place « Mes requêtes » sous l'arbre du projet. Une requête écrite pour `analytics` en
`prod` vaut le plus souvent pour la même base en `dev` : la rattacher à une variante la rendrait
inutilisable dès qu'on change d'environnement — et changer d'environnement est le geste que `A4` rend
courant.

Elle porte donc `projet` + `nom` + `sql`, et rien de plus.

### Le fichier de configuration accueille une nouvelle section, donc sa version change

`05b` a posé une configuration versionnée avec quarantaine du fichier illisible. Ajouter les
requêtes est un changement de schéma : la version monte, et une configuration d'une version
antérieure se lit toujours — sans requêtes, ce qui est l'état correct.

C'est le premier vrai test de la migration de `05b`, écrite mais jamais exercée par un changement
réel.

### Retirer une requête est destructif, mais sans ambiguïté

Contrairement à `08j`, aucune confusion possible avec la base distante : ce qui part est un texte
local. La confirmation reste — le texte peut représenter une heure de travail — mais elle est brève,
et ne récapitule rien.

## Done when

- [ ] Une requête enregistrée survit à un redémarrage.
- [ ] Une configuration écrite **avant** cette spec se lit encore, sans requêtes et sans erreur.
- [ ] Cliquer une entrée ouvre une console sur son texte ; la modifier puis « Enregistrer » met à
      jour l'entrée existante plutôt que d'en créer une seconde.
- [ ] Renommer et retirer fonctionnent depuis le menu « … ».
- [ ] Deux requêtes de même nom dans un projet sont refusées, et l'écran le dit.
