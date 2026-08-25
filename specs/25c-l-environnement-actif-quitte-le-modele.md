# 25c — L'environnement actif quitte le modèle

## Goal

`Project::active_environment` n'a plus de lecteur une fois les environnements devenus des nœuds de
l'arbre (`25a`) et la barre de titre réduite à un indicateur (`25b`). Il quitte le modèle, le disque
et les commandes, plutôt que d'y rester en source morte.

## Scope

**Le champ part du modèle.** `Project::active_environment` (`src-tauri/src/config/model.rs`), son
invariant de validation `ModelError::ActifInconnu`, et le repli qui le dérivait du premier
environnement déclaré.

**Le format monte en version 5.** Le cran `v4 → v5` ne fait rien d'autre que relire : `serde` ignore
les champs qu'il ne connaît pas, donc une configuration de version 4 se lit telle quelle et se
réécrit sans `activeEnvironment`. Concrètement, le bras `2 | 3` de `migrer` accueille `4`.

**Ce qui part avec lui :**

| Ce qui disparaît | Où | Pourquoi |
| --- | --- | --- |
| `set_active_environment` | `config/commands.rs`, `lib.rs`, `screens/NewConnection/enregistrerLaBase.ts`, `app/App.tsx` | plus aucun écran n'écrit d'environnement actif |
| `SetActiveEnvironmentRequest` | `commands.rs` → `domain/config.ts` | sa seule commande part |
| `DeleteEnvironmentResult::new_active_environment` | `config/environnements.rs`, `DeleteEnvironmentDialog` | supprimer un environnement ne réattribue plus rien |
| `query::active_variant` | `config/query.rs`, `config/mod.rs` | **déjà mort** : réexporté, appelé nulle part |

**La migration `v1 → v2` garde sa lecture du champ.** Elle lit `activeEnvironment` de l'ancien format
pour *déduire les environnements déclarés* — « les environnements déclarés sont ceux qui servaient,
plus l'environnement actif ». Cette déduction reste : ce qui part, c'est le champ qu'elle **écrivait**
sur le `Project` produit, pas celui qu'elle **lisait** sur l'ancien fichier. Un projet dont la seule
trace d'un environnement était d'y être actif conserve donc sa déclaration.

## Not in this scope

- **L'arbre et son nouveau palier** : `25a`. Cette spec suppose qu'aucun écran ne lit plus le champ.
- **La barre de titre** : `25b`, même raison. L'ordre est contraint — `25a` et `25b` avant `25c`,
  sans quoi rien ne compile.
- **Mémoriser les environnements dépliés d'une session à l'autre.** `activeEnvironment` persistait un
  choix ; son équivalent aujourd'hui est l'ensemble des nœuds dépliés, qui vit en mémoire (`useArbre`).
  Le persister est une autre question, et personne ne l'a posée.
- **Les quatre autres commandes d'environnement** (`23c`) — créer, renommer, recolorer, réordonner —
  ne changent pas.

## Approach

**Une version de plus plutôt qu'un `serde(default)`.** Les specs `12f` et `15a` ont préféré
`serde(default)` à une montée de version, et c'était juste : elles *ajoutaient* un champ, dont
l'absence avait un sens correct. Ici on en *retire* un. Sans montée de version, un fichier écrit par
cette version se relirait sans erreur par l'ancienne application, qui rétablirait un environnement
actif arbitraire et rouvrirait la porte qu'on ferme. La version dit la vérité sur le modèle qu'elle
porte — c'est la règle que `store.rs` s'est déjà donnée.

**Le cran ne transforme rien.** C'est le premier de la chaîne à n'avoir aucun corps : les crans `05d`
et `06j` réécrivaient du `serde_json::Value`, la migration `v1 → v2` avait ses types dédiés. Un retrait
de champ ne demande que la relecture. On l'écrit comme tel, sans fonction vide qui laisserait croire à
un travail.

**La sauvegarde avant migration reste.** `migrer` écrit l'original à côté avant tout ; un retrait de
champ est une perte d'information, même minime, et c'est exactement ce que cette sauvegarde couvre.

## Done when

- [ ] `Project` ne porte plus `active_environment`, et `ModelError::ActifInconnu` n'existe plus
- [ ] `VERSION_COURANTE` vaut 5, et un fichier de version 4 se lit, se migre et se réécrit sans le champ
- [ ] Un test lit les **octets réels** d'un fichier de version 4, comme `store.rs` le fait déjà pour
      les versions 2 et 3, et vérifie que les environnements déclarés survivent intacts
- [ ] La sauvegarde `.v4` est écrite avant migration, et un test le prouve
- [ ] `set_active_environment`, `SetActiveEnvironmentRequest`, `new_active_environment` et
      `active_variant` n'existent plus, côté Rust comme côté TypeScript
- [ ] `pnpm domain:build` projette le modèle sans édition manuelle
- [ ] `cargo test` et `pnpm test` passent
