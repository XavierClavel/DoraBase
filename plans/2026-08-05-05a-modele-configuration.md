# Plan d'implémentation — 05a Modèle de configuration

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** les types et invariants de la configuration — projets, bases, variantes
d'environnement — en Rust, projetés en TypeScript sans dérive possible.

**Architecture :** le modèle vit en Rust parce que `05b` (écriture atomique) et `05c`
(Trousseau) y vivent nécessairement. La projection TypeScript est **générée** par
`ts-rs`, avec un garde-fou en CI, sur le modèle de `tokens.css` et `sprite.svg` en `02`.

**Stack :** Rust · serde · ts-rs · cargo test

**Spec :** `specs/05a-modele-configuration.md` — **Prérequis :** plan `01`

---

## Premier travail Rust du projet : deux trous à combler d'abord

**La CI ne lance aucun test Rust.** Elle fait `cargo fmt --all --check` et
`cargo clippy --all-targets -- -D warnings`, mais jamais `cargo test`. Le piège est
subtil : `--all-targets` **compile** les tests, donc un test qui ne compile pas fait
échouer la CI — mais un test qui compile et **échoue** passe. Toute la logique de `05a`
serait donc non couverte. La tâche 1 corrige ça, avec un contrôle négatif.

**Aucun test Rust n'existe encore**, donc aucune convention établie. Ce plan pose la
première : les tests unitaires vivent dans un module `#[cfg(test)]` au bas du fichier
qu'ils testent, la convention par défaut de l'écosystème Rust — elle donne accès aux
champs privés, ce dont on a besoin pour tester qu'un invariant est bien inviolable.

## Choix de bibliothèques, vérifiés sur crates.io le 5 août 2026

| Crate | Version | Pourquoi celle-là |
| --- | --- | --- |
| `ts-rs` | 12.0.1 | projection Rust → TypeScript ; 11,7 M de téléchargements contre 1,8 M pour `specta`, et l'export se déclenche par un test, donc naturellement branché sur `cargo test` |

`serde` et `serde_json` sont déjà dans `src-tauri/Cargo.toml`.

## Ce que ce plan ne construit pas

Ni lecture, ni écriture, ni commande Tauri : `05b`. Aucune valeur de secret : `05c`.
Aucune introspection de base : `06`. Les fonctions de ce plan sont **pures** et
testables sans système de fichiers ni base de données.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/config/mod.rs` | le module, ses réexports |
| `src-tauri/src/config/model.rs` | types et invariants |
| `src-tauri/src/config/query.rs` | fonctions pures de résolution |
| `src-tauri/src/lib.rs` | déclare `mod config` |
| `src/domain/config.ts` | **généré** par `ts-rs` |
| `.github/workflows/ci.yml` | ajout de `cargo test` et du garde-fou de projection |

---

## Tâche 1 : brancher `cargo test` sur la CI

**Fichiers :** modifier `.github/workflows/ci.yml` ; créer `src-tauri/src/config/mod.rs`

- [ ] **Étape 1 : créer le module avec un test qui échoue délibérément**

```rust
// src-tauri/src/config/mod.rs
#[cfg(test)]
mod tests {
    #[test]
    fn controle_negatif_la_ci_execute_bien_les_tests_rust() {
        // Ce test est temporaire : il doit faire ÉCHOUER la CI. S'il passe, c'est que
        // `cargo test` n'est pas branché et que tout ce plan serait non couvert.
        assert_eq!(1, 2, "contrôle négatif — à retirer une fois la CI rouge constatée");
    }
}
```

Déclarer `mod config;` dans `src-tauri/src/lib.rs`.

- [ ] **Étape 2 : constater que la CI actuelle laisse passer**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo clippy --all-targets -- -D warnings && echo "clippy PASSE malgré le test faux"
```

Attendu : clippy réussit. C'est la démonstration du trou — le test est compilé, jamais
exécuté.

- [ ] **Étape 3 : ajouter `cargo test` à la CI**

Dans `.github/workflows/ci.yml`, après `cargo clippy` :

```yaml
      - run: cargo test
        working-directory: src-tauri
```

- [ ] **Étape 4 : vérifier en local que le test échoue bien**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test 2>&1 | tail -5
```

Attendu : ÉCHEC, `assertion failed: 1 == 2`.

- [ ] **Étape 5 : retirer le contrôle négatif, garder la CI**

Remplacer le test par un test vrai (`assert!(true)` est inutile — le supprimer
simplement, la tâche 2 apporte de vrais tests). Relancer `cargo test`, constater
qu'il n'y a plus d'échec.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "ci: exécuter les tests Rust, jamais lancés jusqu'ici"
```

---

## Tâche 2 : les types et leurs invariants

**Fichiers :** créer `src-tauri/src/config/model.rs`

Les champs sont ceux de l'écran `A2` — voir `design/handoff/README.md` § A2. Répartition
posée par la spec : nom et moteur sur `Database`, tout le reste du formulaire sur
`EnvironmentVariant`, puisque le handoff pose « host/port/creds différents par env ».

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
// dans src-tauri/src/config/model.rs, module #[cfg(test)]
use super::*;

fn variante(env: Environment) -> EnvironmentVariant {
    EnvironmentVariant {
        environment: env,
        host: "db.internal".into(),
        port: 5432,
        default_database: "analytics".into(),
        username: "dora_ro".into(),
        password: None,
        ssl_mode: SslMode::Require,
        read_only: true,
        reconnect_on_startup: false,
        tunnel: None,
    }
}

#[test]
fn une_base_sans_variante_ne_se_construit_pas() {
    let erreur = Database::new("analytics", Engine::PostgreSql, vec![]);
    assert!(matches!(erreur, Err(ModelError::AucuneVariante { .. })));
}

#[test]
fn une_base_avec_une_variante_se_construit() {
    let base = Database::new("analytics", Engine::PostgreSql, vec![variante(Environment::Dev)]);
    assert!(base.is_ok());
}

#[test]
fn deux_variantes_du_meme_environnement_sont_refusees() {
    let erreur = Database::new(
        "analytics",
        Engine::PostgreSql,
        vec![variante(Environment::Dev), variante(Environment::Dev)],
    );
    assert!(matches!(erreur, Err(ModelError::EnvironnementEnDouble { .. })));
}

#[test]
fn lire_une_variante_exige_de_nommer_l_environnement() {
    let base = Database::new("analytics", Engine::PostgreSql, vec![variante(Environment::Dev)]).unwrap();
    assert!(base.variant(Environment::Dev).is_some());
    // Une base peut n'exister qu'en dev : le handoff dit 1..n, pas n.
    assert!(base.variant(Environment::Prod).is_none());
}
```

Le troisième test encode un invariant que la spec implique sans le nommer : deux
variantes pour le même environnement rendraient « la variante de `prod` » ambiguë.

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test config 2>&1 | tail -10
```

Attendu : ÉCHEC de compilation, types inexistants.

- [ ] **Étape 3 : implémenter**

Points à respecter :

- `Engine` couvre les **sept** moteurs du handoff, et rien d'autre : un moteur inconnu
  ne compile pas. Idem `Environment` (`Dev`, `Staging`, `Prod`) et `SslMode`.
- `Database::variants` est **privé**, avec un accesseur en lecture seule. C'est ce qui
  rend l'invariant inviolable : sans ça, un appelant viderait la liste après coup.
- `Database::new` valide et rend `Result<_, ModelError>`.
- Le mot de passe est un `Option<SecretRef>`, jamais une chaîne de secret. `SecretRef`
  est un type distinct d'une `String` — un nouveau type, pour qu'aucune valeur de
  secret ne puisse y être affectée par erreur.
- Tous les types dérivent `Serialize`, `Deserialize`, `Debug`, `Clone`, `PartialEq`.
  **Pas de `Display` sur `SecretRef`** qui divulguerait quoi que ce soit — mais il n'y a
  de toute façon rien à divulguer, une référence n'est pas un secret.

- [ ] **Étape 4 : lancer, constater le succès**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test config && cargo clippy --all-targets -- -D warnings
```

Attendu : 4 tests passants, clippy propre.

- [ ] **Étape 5 : vérifier que l'invariant est réellement inviolable**

Sans ce contrôle, « privé » n'est qu'une intention.

**Piège vérifié, à ne pas reproduire :** la tentative doit venir d'un **autre module**
que celui qui déclare le type. Un `#[cfg(test)] mod tests` placé au bas de `model.rs`
est un module *enfant* de `model`, et un enfant accède aux champs privés de son
parent — le sabotage y **compile sans erreur**, et le contrôle ne prouve rien. Constaté
en le faisant.

Poser donc la sonde dans `config/mod.rs`, module frère :

```rust
#[cfg(test)]
mod sonde_encapsulation {
    use super::*;
    #[test]
    fn depuis_un_autre_module_le_champ_est_inaccessible() {
        let mut base = Database::new("a", Engine::PostgreSql, vec![]).unwrap();
        base.variants.clear(); // doit NE PAS compiler
    }
}
```

Lancer `cargo test`, constater `error[E0616]: field 'variants' ... is private`, puis
retirer la sonde.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "feat(config): types du modèle de configuration et leurs invariants"
```

---

## Tâche 3 : les fonctions pures de résolution

**Fichiers :** créer `src-tauri/src/config/query.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn la_variante_active_suit_l_environnement_du_projet() {
    let projet = projet_de_test(); // active_environment = Prod
    let base = &projet.databases[0];
    let variante = active_variant(&projet, base).expect("prod existe sur cette base");
    assert_eq!(variante.environment, Environment::Prod);
}

#[test]
fn une_base_absente_de_l_environnement_courant_ne_rend_rien() {
    let mut projet = projet_de_test();
    projet.active_environment = Environment::Staging; // aucune base n'y est déclarée
    let base = &projet.databases[0];
    assert!(active_variant(&projet, base).is_none());
}

#[test]
fn les_bases_disponibles_excluent_celles_absentes_de_l_environnement() {
    let projet = projet_de_test(); // base 0 en dev+prod, base 1 en dev seulement
    let en_prod = databases_available(&projet, Environment::Prod);
    assert_eq!(en_prod.len(), 1);
    let en_dev = databases_available(&projet, Environment::Dev);
    assert_eq!(en_dev.len(), 2);
}

#[test]
fn un_projet_sans_base_est_valide() {
    // Le handoff n'interdit pas un projet vide : c'est l'état juste après création,
    // avant la première connexion déclarée en A2.
    let projet = Project { name: "Neuf".into(), active_environment: Environment::Dev, databases: vec![] };
    assert!(validate(&projet).is_ok());
}

#[test]
fn deux_bases_de_meme_nom_dans_un_projet_sont_refusees() {
    let projet = projet_avec_deux_bases_homonymes();
    assert!(matches!(validate(&projet), Err(ModelError::NomDeBaseEnDouble { .. })));
}
```

Le quatrième test tranche une question que la spec laissait implicite : un projet sans
base est **valide**, puisque c'est l'état créé par le bouton « Nouveau projet » de `A1`
avant toute connexion.

- [ ] **Étape 2 : lancer, constater l'échec** — `cd src-tauri && cargo test query`
- [ ] **Étape 3 : implémenter, puis lancer** — 5 tests passants
- [ ] **Étape 4 : commit**

```bash
git add -A && git commit -m "feat(config): résolution de variante et validation de projet"
```

---

## Tâche 4 : projection TypeScript générée

**Fichiers :** modifier `src-tauri/Cargo.toml`, `src-tauri/src/config/model.rs` ;
créer `src/domain/config.ts` (généré) ; modifier `package.json`, `.github/workflows/ci.yml`

- [ ] **Étape 1 : ajouter `ts-rs` et annoter les types**

```toml
[dependencies]
ts-rs = "12.0.1"
```

Dériver `TS` sur chaque type du modèle, avec `#[ts(export, export_to = "../src/domain/config.ts")]`.
`ts-rs` exporte **pendant `cargo test`** : la génération est donc déjà branchée sur la
commande que la tâche 1 a mise en CI.

- [ ] **Étape 2 : générer, puis relire le résultat**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo test && cd .. && cat src/domain/config.ts
```

Relire vraiment : que `Engine` soit une union des sept moteurs, que `password` soit
optionnel, qu'aucun champ ne manque.

- [ ] **Étape 3 : brancher le garde-fou anti-dérive**

Dans `package.json` :

```json
"domain:check": "cd src-tauri && cargo test && cd .. && git diff --exit-code src/domain/config.ts"
```

Dans `.github/workflows/ci.yml`, après `cargo test` :

```yaml
      - run: pnpm domain:check
```

- [ ] **Étape 4 : contrôle négatif du garde-fou**

Ajouter un champ à un type Rust, indexer l'ancienne version générée
(`git add src/domain/config.ts`), lancer `pnpm domain:check`, constater l'échec.
Retirer le champ.

**Piège connu, déjà rencontré avec `tokens:check` au plan `02`** : une édition
seulement présente dans l'arbre de travail est écrasée par la régénération **avant**
que `git diff` ne la voie. Il faut `git add` pour voir l'échec. En CI le fichier vient
de `HEAD`, donc le contrôle est juste — mais qui teste sans indexer conclura à tort.

- [ ] **Étape 5 : vérifier que le TypeScript généré compile**

```bash
pnpm typecheck
```

Le fichier généré est sous `src/`, donc pris par `tsconfig.app.json`. S'il déclenche
Biome, lui donner le même traitement qu'aux tokens : en-tête `biome-ignore-all format`
émis par le générateur, plutôt qu'une exclusion dans `biome.json` — le lint reste
actif, seul le formatage est suspendu.

- [ ] **Étape 6 : commit**

```bash
git add -A && git commit -m "feat(config): projection TypeScript générée depuis Rust"
```

---

## Tâche 5 : vérification de fin

Contrôler chaque critère de `specs/05a-modele-configuration.md` § Terminé quand.

- [ ] une base sans variante ne se construit pas ; deux variantes du même
      environnement sont refusées ; le champ est privé, vérifié par une tentative
      d'accès qui ne compile pas
- [ ] lire une variante exige de nommer l'environnement, et le résultat est optionnel —
      avec un test sur la base absente de l'environnement courant
- [ ] les fonctions pures sont couvertes, cas d'échec compris
- [ ] `pnpm domain:check` échoue si la projection a dérivé, vérifié en introduisant
      la divergence
- [ ] aucun secret dans le modèle : `rg -n "password|secret" src-tauri/src/config/`
      ne montre que des références typées
- [ ] les sept moteurs sont représentés ; un moteur inconnu ne compile pas
- [ ] `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`,
      `pnpm typecheck`, `pnpm lint` verts, et la CI verte de bout en bout
