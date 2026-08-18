# 19a — Redis : ce que le contrat de `06a` ne décrit pas

## Goal

Trancher si Redis entre dans le contrat de la couche moteur, et à quel prix. Déclaratif : aucune
implémentation.

## Dépend de

`06a`, `18a` (qui a défriché la même question pour un moteur non relationnel).

## Scope

- Ce que « schéma », « table », « colonne » et « ligne » deviennent pour Redis.
- Ce qui **ne peut pas** entrer dans le contrat, et ce qu'on en fait.
- La décision : adapter Redis au contrat, ou lui donner son propre écran.

## Not in this scope

- **La connexion et la lecture** → `19b`, si `19a` conclut que c'est faisable.
- **Le mockup.** Le handoff mentionne Redis (« commandes clé/valeur » dans l'encart d'`A7`) mais ne
  maquette **aucun** écran pour lui. C'est le premier moteur du projet dans ce cas, et c'est central.

## Approche

### Redis n'a pas de lignes, et c'est plus grave que pour MongoDB

`18a` a pu faire entrer MongoDB dans le contrat parce qu'une collection **ressemble** à une table :
des documents comparables, des champs récurrents, une clé. Un espace de clés Redis n'a rien de tel.

| Contrat | MongoDB (`18a`) | Redis |
| --- | --- | --- |
| schéma | une base | un numéro de base (0–15) — soit |
| table | une collection | **rien**. Un préfixe de clé (`user:*`) est une convention, pas un objet |
| colonne | un champ déduit | **rien**. Un hash a des champs, une liste non, une chaîne non plus |
| ligne | un document | une clé et sa valeur — de **cinq types différents** dans le même espace |

Les deux lignes vides ne sont pas des trous à combler : le modèle relationnel de `06a` décrit un
**tableau**, et un espace de clés n'en est pas un.

### Trois options, et la décision

1. **Regrouper les clés par préfixe** et prétendre que `user:*` est une table. Le préfixe est une
   convention d'équipe, pas une structure : `user:42` et `user:sessions:42` ne se rangent pas d'eux-
   mêmes, et un espace sans convention donnerait une seule « table » de tout. **C'est une devinette**,
   et `12d` a posé qu'une devinette fausse est pire qu'une absence.
2. **Une table par type** — cinq lignes dans l'arbre : chaînes, hashs, listes, ensembles, ensembles
   triés. Vrai, mais inutile : personne ne cherche « toutes les listes ».
3. **Son propre écran**, et un adaptateur qui n'implémente pas `EngineAdapter`.

**La troisième est retenue.** Redis n'entre pas dans le contrat : le forcer donnerait des écrans qui
affichent des colonnes inventées. C'est la conclusion inverse de `18a`, et elle vaut d'être écrite —
`06a` avait annoncé sept moteurs sous un contrat, et six y entrent.

### Ce que cela coûte, dit franchement

`A4`, `A5`, `A6` et `A9` ne serviront pas à Redis. Il lui faut un écran de parcours de clés, qui
n'est pas maquetté. **`19b` doit donc commencer par un mockup**, pas par du code — et cette décision
appartient au commanditaire, pas à l'implémentation.

Le trait `EngineAdapter` n'est pas modifié : `AnyEngine::Redis` refusera avec sa raison, comme les
quatre autres moteurs non livrés le font déjà (`18a`).

## Done when

- [ ] `AnyEngine` refuse Redis avec une raison qui **nomme** la difficulté, pas seulement la spec.
- [ ] Cette conclusion est consignée dans `specs/README.md` : le contrat couvre six moteurs, pas sept.
- [ ] `19b` reste à écrire, et son premier point est un écran à maquetter.
