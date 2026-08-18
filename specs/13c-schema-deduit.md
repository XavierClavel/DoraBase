# 13c — `A8` : le schéma déduit

## Goal

La section « Schéma déduit » de la sidebar : les champs d'une collection, avec le **pourcentage de
documents** qui les portent.

## Dépend de

`18d` (qui produit la fréquence), `13a`, `09d` (la sidebar).

## Scope

- Les champs d'une collection, leur type et leur fréquence — `channel 98 %`, `items[] 100 %`.
- Le mot « déduit », affiché : ce n'est pas un schéma déclaré.

## Not in this scope

- **Le réglage de l'échantillon.** `18d` décide combien de documents il lit ; l'exposer est une
  préférence, donc `15`.
- **Le calcul lui-même** → `18d`. Cette spec affiche ce que le moteur rend.
- **Les champs imbriqués au-delà d'un niveau.** Le mockup montre `items[]` sans le détailler.

## Approche

### « Déduit » est le mot le plus important de cette section

MongoDB n'a pas de schéma : celui-ci est **échantillonné**. Un champ à 98 % n'existe pas dans 2 % des
documents, et une requête qui le suppose échouera sur ceux-là. Le titre dit « déduit », et le
pourcentage est affiché pour chaque champ — sans lui, la section se lirait comme un catalogue.

**Un champ à 100 % n'est pas garanti pour autant** : l'échantillon n'est pas la collection. C'est la
limite de l'exercice, et elle est dite dans l'interface plutôt que dans un commentaire.

### La fréquence vient du moteur, pas d'un comptage côté écran

Compter côté front demanderait de faire traverser l'IPC aux documents échantillonnés — ce que la
contrainte transverse interdit. L'agrégation se fait dans MongoDB, qui sait le faire en une passe.

## Done when

- [ ] Les champs apparaissent avec leur type et leur fréquence.
- [ ] Le mot « déduit » est visible, et un champ à moins de 100 % se distingue.
- [ ] Aucun document ne traverse l'IPC pour ce calcul — vérifié.
