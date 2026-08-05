# 05b — Persistance sur disque

## Objectif

Ranger la configuration de `05a` sur le disque et la relire, sans jamais la
corrompre ni la perdre — y compris si l'app est tuée en pleine écriture, ou si le
fichier vient d'une version antérieure.

## Dépend de

`05a` (le modèle à persister).

## Périmètre

- L'emplacement du fichier de configuration, et pourquoi celui-là.
- Le format sérialisé, et le champ de version qui le rend évolutif.
- **L'écriture atomique** : une interruption laisse l'ancien fichier intact, jamais
  un fichier tronqué.
- La lecture d'un fichier absent, vide, illisible ou d'une version inconnue —
  chaque cas a un comportement décidé, aucun ne plante.
- La migration d'une version à la suivante, et le mécanisme qui rend une migration
  ratée non destructrice.
- Les commandes Tauri qui exposent lecture et écriture à la webview.

## Hors périmètre

- **Les identifiants** : ils ne passent pas par ce fichier. Le modèle n'y écrit que
  des références. → `05c`.
- **La géométrie des panneaux et l'état des onglets.** `03` les persiste déjà en
  `localStorage`, et ce sont des préférences d'affichage, pas de la configuration
  partageable. Les réunir ici mêlerait deux cycles de vie sans rapport.
- **Les préférences applicatives** (thème, densité, garde-fous d'écriture) → `15`.
  Elles méritent leur propre fichier : les perdre est bénin, perdre ses projets ne
  l'est pas.
- **Toute synchronisation, sauvegarde ou export** — hors du périmètre du handoff.
- **Le cache d'introspection** (schémas, tables). Il se reconstruit depuis la base
  et n'a pas à survivre à un redémarrage. → `06` s'il s'avère nécessaire.

## Approche

### Emplacement

`~/Library/Application Support/<identifiant du bundle>/` sur macOS, résolu par
l'API de chemins de Tauri plutôt qu'écrit en dur — c'est ce qui garde Windows et
Linux ouverts, cible déclarée en `01`. La permission `core:path:default` est déjà
accordée par `capabilities/default.json`.

Un fichier unique pour tous les projets, pas un fichier par projet : le volume est
petit (quelques dizaines de projets au plus), et un seul fichier rend l'écriture
atomique triviale là où plusieurs demanderaient une transaction.

### Écriture atomique, et pourquoi elle n'est pas optionnelle

Écrire par-dessus le fichier existant, c'est accepter qu'une interruption — panne,
`⌘Q` brutal, plus d'espace disque — laisse un JSON tronqué, donc **tous les projets
de l'utilisateur perdus**. Le coût d'un tel défaut est sans commune mesure avec
celui de la mécanique qui l'évite.

La séquence : écrire dans un fichier temporaire du même répertoire, forcer sa
synchronisation sur le support, puis le renommer sur le fichier cible. Le renommage
au sein d'un même système de fichiers est atomique : à tout instant, le chemin cible
désigne soit l'ancien contenu complet, soit le nouveau. Le même répertoire est
requis — un renommage entre volumes n'est plus atomique, c'est une copie.

Cette propriété se **teste** : écrire, interrompre avant le renommage, relire, et
constater que l'ancien contenu est intact.

### Version et migration

Le fichier porte un numéro de version en tête. À la lecture :

- version connue et égale à la courante → lecture directe ;
- version connue et antérieure → migration en chaîne, après **copie de sauvegarde**
  du fichier d'origine, pour qu'une migration fautive reste réparable ;
- version **postérieure** à la courante → refus de lire, sans rien écrire. C'est le
  cas d'un utilisateur qui rétrograde l'app : écraser serait perdre des données que
  cette version ne comprend pas.

Aucune migration n'est écrite dans ce scope — il n'y a qu'une version. Ce qui est
livré ici, c'est le **mécanisme** et son test, tant qu'il est gratuit de le poser.

### Lecture d'un fichier abîmé

Un fichier absent donne une configuration vide — c'est le premier lancement, le cas
que `07` affiche déjà. Un fichier illisible ou incohérent est **conservé sous un
nom d'écart** et signalé, jamais supprimé ni écrasé en silence : c'est peut-être la
seule copie du travail de l'utilisateur.

### Côté Rust, exposé par commandes

L'écriture atomique et la synchronisation sur le support ne sont pas accessibles à
la webview. La persistance vit donc en Rust, exposée par deux commandes du projet.
`specs/README.md` § « Acquis techniques » note qu'une commande définie par l'app ne
passe pas par les ACL : aucune permission à ajouter.

## Terminé quand

- La configuration écrite est relue à l'identique, aller-retour couvert par un test.
- **L'atomicité est prouvée** : une écriture interrompue avant le renommage laisse
  l'ancien fichier intact, vérifié par un test qui provoque l'interruption.
- Les quatre cas de lecture — absent, vide, illisible, version postérieure — ont
  chacun un test, et aucun ne panique.
- Un fichier illisible est conservé sous un nom d'écart, et l'original n'est jamais
  perdu.
- Le chemin est résolu par l'API de Tauri, sans littéral de plateforme dans le code.
- Le mécanisme de migration a un test, avec une version factice pour l'exercer.
- Aucun identifiant n'atteint le fichier : un test écrit un projet dont la
  configuration porte une référence de secret, relit le fichier **en texte brut**, et
  vérifie qu'aucun mot de passe n'y figure.
