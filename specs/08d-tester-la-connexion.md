# 08d — « Tester la connexion », et son échec (A3)

## Objectif

Brancher « Tester la connexion » sur la vraie couche moteur, afficher son résultat inline
en cas de succès, et la sous-modale bloquante de `A3` en cas d'échec. **Premier passage
réel du pont JavaScript → Rust du projet.**

## Dépend de

`06b` (le test de connexion), `06e` (le tunnel, ouvert quand le panneau de `08c` le
déclare), `08a` (`Modal`, pour la sous-modale), `08b` et `08c` (le formulaire qui fournit
les valeurs).

## Périmètre

- Une commande Tauri qui teste une connexion depuis une variante d'environnement.
- Le résultat inline vert : « Connecté en 240 ms · PostgreSQL 16.2 ».
- L'état d'attente pendant le test — le mockup ne le montre pas ; voir § Approche.
- La sous-modale d'échec de `A3` : pastille rouge, titre, explication, encart de log.
- Le pied en état d'échec : « Retester », message inline rouge, « Enregistrer & ouvrir »
  désactivé.
- **La vérification que le pont fonctionne**, par observation dans l'app réelle.

## Hors périmètre

- **L'enregistrement** → `08e`. Un test réussi ne crée rien.
- **Le mot de passe depuis le Trousseau.** Le test emploie ce qui est saisi dans le champ.
  Relire un secret déjà stocké suppose une entité qui existe, donc `08e`.
- **La reconnexion automatique** (`reconnect_on_startup`) → l'écran qui ouvre une base.
- **Le TLS réel.** `06b` emploie `NoTls` : un mode `verify-full` sera rapporté comme
  réussi sans avoir rien vérifié. **Ce scope ne doit pas laisser croire l'inverse** — voir
  § Approche.

## Approche

### Le pont IPC, et comment on saura qu'il marche

Playwright ne pilote pas WKWebView, donc aucun test automatisé ne peut cliquer sur
« Tester la connexion » dans l'app réelle. `REPRISE.md` le consigne depuis `06a` et
demande de ne pas présenter le pont comme vérifié.

Deux moyens, complémentaires, décidés le 7 août 2026 :

1. **Le pont, par observation.** `tauri-plugin-log` est déjà en dépendance ; brancher sa
   cible *webview* fait remonter les journaux du JavaScript dans la console Rust. La
   commande journalise son entrée et sa sortie. On lance `pnpm tauri dev`, on clique, et
   la console montre l'aller-retour. **Vérifié par observation, non automatisé** — à dire
   ainsi, jamais autrement.
2. **La commande, par test Rust.** Sérialisation des entrées et sorties, cas d'erreur.
   Automatisé et en CI, mais ne traverse pas le pont.

Ce qui serait un faux confort : un test Vitest qui simule `invoke`. Il vérifierait le
simulacre.

### Aucun jeu de résultats ne traverse l'IPC, y compris ici

La contrainte transverse s'applique : la commande rend une sonde — latence et version —
pas un client ni une connexion. Le type existe déjà (`ConnectionProbe`, `06a`) et se
projette en TypeScript par `ts-rs`.

Le tunnel, lui, est **ouvert puis refermé** pour la durée du test. Le garder ouvert
« au cas où l'utilisateur enregistre » laisserait un port lié et une session SSH vivante
sur un formulaire abandonné. `SshTunnel::fermer` existe pour ça (`06e`).

### Trois issues, pas deux

Le mockup montre le succès (`A2`) et l'échec (`A3`). Il en manque une troisième :
**l'attente**. Un test de connexion vers un hôte injoignable prend jusqu'à 30 secondes
(`06e` a posé ce délai). Sans état d'attente, le bouton semble mort et l'utilisateur
reclique.

Le handoff ne maquettant rien, l'implémentation prend le minimum défendable : bouton
désactivé et libellé « Test en cours… ». Aucun élément nouveau, aucune animation
inventée. La question est consignée au § « À trancher » de `specs/README.md`, parce
qu'un indicateur de progression serait la vraie réponse et relève du design.

### Le message d'échec vient du moteur, pas de l'écran

`06b`–`06e` produisent déjà des messages qui **disent la manœuvre** : un hôte absent de
`known_hosts` renvoie vers `ssh <hote>`, une clé refusée parle d'`authorized_keys`. Les
réécrire dans l'écran les dégraderait et créerait deux vérités.

L'encart de log de `A3` reçoit donc l'erreur telle quelle. Le mockup montre deux lignes,
la première portant la cause en `#C6321E` : c'est exactement la forme
`ligne de cause` + `conséquence`, et `SshTunnel::qualifier` produit déjà la seconde
(« la connexion à la base n'a pas pu être tentée »).

**Aucun secret ni contenu de clé dans l'encart.** `05c` pose la règle ; ici l'encart est
affiché *et* copiable, donc c'est le point le plus exposé du produit. À vérifier avec une
sentinelle et un contrôle positif, comme en `06e`.

### Ce que « connecté » ne dit pas

Avec `NoTls`, un test en `require` ou `verify-full` réussit sans que rien n'ait été
vérifié. Afficher « Connecté en 240 ms · PostgreSQL 16.2 » serait alors exact et
trompeur.

Tant que le TLS n'est pas branché, le résultat inline **mentionne le mode effectif** :
« Connecté en 240 ms · PostgreSQL 16.2 · TLS non vérifié » quand le mode demandé exigeait
une vérification. C'est laid et c'est honnête ; la mention disparaîtra quand `06b` aura
son TLS.

## Terminé quand

- La commande est enregistrée, testée en Rust, et son type projeté par `ts-rs`.
- Un test réussi contre le PostgreSQL de test affiche la latence et la version réelles.
- Un test à travers le bastion de `06e` réussit, et le port local est refermé après —
  vérifié en le réutilisant.
- Les quatre échecs distincts de `06e` produisent quatre encarts de log distincts.
- « Enregistrer & ouvrir » est désactivé après un échec et réactivé après un succès.
- `esc` et « Fermer » ferment la sous-modale sans fermer `A2` ; le focus revient au
  bouton « Retester ».
- La modale sous-jacente n'est **pas** surlignée en rouge — le handoff insiste.
- Aucun secret dans l'encart, vérifié par sentinelle avec contrôle positif.
- Un mode SSL exigeant une vérification affiche la mention « TLS non vérifié ».
- Le pont est **observé** dans l'app réelle, et la sortie de console rapportée.
