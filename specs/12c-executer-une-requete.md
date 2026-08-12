# 12c — `A7` : exécuter une requête

## Goal

Envoyer le SQL de la console à la base et afficher ce qu'elle rend. **Deuxième écriture possible du
projet**, et la première où le SQL n'est pas construit par DoraBase.

## Scope

- Une commande `run_sql` : du texte arbitraire, un résultat ou un refus.
- Le résultat en tableau, dans la grille de `10a`.
- L'auto-`LIMIT` du mockup : une lecture sans limite en reçoit une, et le dit.
- La confirmation des requêtes **destructives**, décidée le 12 août 2026.
- Les chiffres de la barre : lignes, durée.

## Not in this scope

- **Plusieurs instructions en une exécution.** Un `;` séparant deux requêtes demande de décider quoi
  afficher, et ce qu'il advient de la seconde si la première échoue. Sa propre spec si le besoin
  vient ; ici, une instruction.
- **Le plan et les messages** → `12e`.
- **Annuler une requête en cours.** Utile, et pas gratuit : il faut un second canal vers le serveur.
  À faire quand une requête longue existera pour le justifier.

## Approche

### L'auto-`LIMIT` protège la mémoire, pas l'utilisateur

La contrainte transverse du projet est qu'**aucun résultat complet ne traverse l'IPC**. Une console
la met en danger : `select * from orders` sur 1,9 million de lignes. Une limite est donc ajoutée aux
requêtes qui rendent des lignes et n'en portent pas.

**Elle est ajoutée par le moteur, et annoncée.** Une limite silencieuse ferait croire à une table de
1000 lignes — c'est un mensonge sur les données, la pire catégorie de défaut pour cet outil. La barre
de résultat dit « limité à 1000 par DoraBase », et la requête montrée porte la limite.

### Une requête destructive demande une confirmation qui récapitule

`DELETE`, `TRUNCATE`, `DROP`, `ALTER`, et `UPDATE` sans `WHERE` : la confirmation nomme l'instruction
et la table, comme celle de `11d`. Une confirmation qui dirait « êtes-vous sûr ? » ne ferait que
déplacer le clic.

**La détection est syntaxique, donc approximative, et c'est assumé** : elle peut demander une
confirmation pour une requête inoffensive (le mot `delete` dans une chaîne). L'inverse — manquer un
`DROP` — est le seul cas inacceptable, donc la reconnaissance est volontairement large.

Ce n'est pas un garde-fou de sécurité : un utilisateur qui veut écrire écrira. C'est un garde-fou
contre la faute de frappe, ce qui est le vrai risque d'une console.

### Les valeurs arrivent par le protocole simple, pas par le protocole étendu

Le protocole étendu rend les valeurs au format **binaire** : un `jsonb` y commence par un octet de
version, un `uuid` fait seize octets bruts, et la lecture en texte échoue. C'est exactement le défaut
de `06d`, où ces types se lisaient `NULL` — et il s'est reproduit ici au premier essai.

La grille l'évite en transtypant dans le `select` qu'elle construit ; ici le SQL est celui de
l'utilisateur, et le réécrire trahirait la section suivante. Le protocole simple rend tout en texte,
ce que `psql` fait depuis toujours.

**Les types viennent de `prepare`**, qui ne l'exécute pas. Deux bénéfices : une requête qui rend zéro
ligne garde ses en-têtes — une grille sans en-tête laisserait croire à une erreur — et la catégorie de
chaque colonne décide de l'alignement, ce qu'une valeur textuelle ne permet pas de deviner.

### Le SQL envoyé est celui qui est affiché

Comme en `11c`/`11d` : la requête exécutée est le texte de l'éditeur, éventuellement complété d'une
limite **visible**. Aucune réécriture invisible.

## Done when
- [ ] Une requête qui rend des lignes les affiche dans la grille, avec lignes et durée.
- [ ] Une requête sans limite en reçoit une, et l'écran **le dit** ; une requête qui en porte une
      n'est pas modifiée.
- [ ] Une erreur SQL affiche le message du serveur, sa position, et ne vide pas l'éditeur.
- [ ] `DELETE`, `DROP`, `TRUNCATE`, `ALTER` et `UPDATE` sans `WHERE` demandent confirmation ;
      un `select` non.
- [ ] Vérifié contre PostgreSQL réel, y compris une requête destructive dans une transaction annulée.
- [ ] Aucun résultat complet ne traverse l'IPC — vérifié, pas supposé.
