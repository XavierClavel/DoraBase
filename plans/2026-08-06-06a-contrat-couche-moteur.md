# Plan d'implémentation — 06a Contrat de la couche moteur

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** le trait que chaque moteur implémente, le modèle d'introspection, le type
de fenêtre de lignes, et la forme des erreurs. Aucune implémentation.

**Architecture :** répartition par **énumération** plutôt que par `dyn`, décidé par sonde
de compilation (voir ci-dessous). Le trait rend `impl Future + Send`, ce qui le rend
utilisable depuis une commande Tauri.

**Stack :** Rust · serde · ts-rs

**Spec :** `specs/06a-contrat-couche-moteur.md` — **Prérequis :** plan `05a`

---

## La décision asynchrone, tranchée par sonde et non par raisonnement

La spec dit « le trait est asynchrone » sans trancher la compatibilité `dyn`. La lecture
naïve mènerait à `Box<dyn EngineAdapter>` plus `async-trait`. Sonde de compilation, le
6 août 2026 :

| Forme | Résultat |
| --- | --- |
| `trait A { async fn … }` puis `&dyn A` | **`error[E0038]`** — un `async fn` en trait n'est pas compatible `dyn` |
| `trait B { fn … -> impl Future<Output = …> + Send }` | compile, et satisfait un contexte `Send` |
| `enum AnyEngine { Postgres(…) }` avec méthodes déléguantes | compile, et satisfait un contexte `Send` |

**Décision : énumération.** Les sept moteurs du handoff sont un ensemble **fermé**, connu à
la compilation. L'énumération donne la répartition statique, aucun boxing, aucune
dépendance à `async-trait`, et surtout l'**exhaustivité** : ajouter un moteur force à le
traiter partout, là où un `dyn` laisserait un oubli silencieux.

Le trait reste utile — chaque adaptateur est écrit contre lui et testable isolément — mais
il n'est jamais employé en objet.

`tokio` 1.53.1 est déjà dans l'arbre via Tauri, avec les seules features `bytes` et
`io-util`. Les tests asynchrones exigeront `rt` et `macros` : à ajouter en dépendance de
développement seulement, tant qu'aucun code de production n'a besoin d'un exécuteur.

## Ce que ce plan ne construit pas

Aucun adaptateur, aucune connexion, aucune requête. L'énumération n'a **aucune variante**
au terme de ce plan : `06b` y ajoutera `Postgres`. Un type sans variante est légal en Rust
et se documente comme volontaire.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/engine/mod.rs` | le trait, l'énumération, les réexports |
| `src-tauri/src/engine/introspection.rs` | schéma, table, colonne, index, contrainte, relation |
| `src-tauri/src/engine/rows.rs` | requête de lignes, fenêtre, valeur typée |
| `src-tauri/src/engine/error.rs` | l'erreur de moteur |
| `src/domain/engine.ts` | **généré** |

---

## Tâche 1 : le modèle d'introspection

**Fichiers :** créer `src-tauri/src/engine/introspection.rs`

Chaque champ doit correspondre à une colonne qu'un écran affiche — voir le tableau de la
spec. Tout champ sans écran est retiré.

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn un_comptage_distingue_l_estimation_de_l_exact() {
    // `A4` affiche une estimation (arrondie, gratuite), `A9` un compte exact (coûteux).
    // Sans la distinction, l'écran ne saurait pas s'il affiche une valeur sûre.
    assert!(matches!(RowCount::Estimated(1_900_000), RowCount::Estimated(_)));
    assert_eq!(RowCount::Exact(1_904_220).value(), 1_904_220);
    assert!(!RowCount::Estimated(1_900_000).is_exact());
    assert!(RowCount::Exact(1_904_220).is_exact());
}

#[test]
fn chaque_glyphe_de_type_de_a5_a_sa_categorie() {
    // `A5` affiche T, #, ⏱, {}, ID. Dériver la catégorie dans l'écran obligerait
    // chaque écran à connaître les types de sept moteurs.
    for categorie in TypeCategory::toutes() {
        assert!(!categorie.glyphe().is_empty(), "{categorie:?} sans glyphe");
    }
    assert_eq!(TypeCategory::Text.glyphe(), "T");
    assert_eq!(TypeCategory::Number.glyphe(), "#");
    assert_eq!(TypeCategory::Timestamp.glyphe(), "⏱");
    assert_eq!(TypeCategory::Json.glyphe(), "{}");
    assert_eq!(TypeCategory::Uuid.glyphe(), "ID");
}
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml engine
```

- [ ] **Étape 3 : implémenter les types**

`SchemaInfo`, `ObjectCounts` (les quatre compteurs du contrôle segmenté de `A4`),
`TableSummary` (les sept colonnes du tableau de `A4`), `ColumnInfo`, `TypeCategory`,
`KeyKind`, `IndexInfo`, `ConstraintInfo`, `TriggerInfo`, `Relation`, `TableDetail`.

**Les horodatages sont des chaînes**, pas un type de date. Raison : rien ne calcule sur
eux — `A4` affiche un « dernier ANALYZE », `A5` une valeur de cellule, et le formatage
appartient à l'écran, qui seul connaît la locale. Ajouter `chrono` pour reformater une
chaîne que la base rend déjà serait une dépendance sans emploi.

- [ ] **Étape 4 : vert, puis commit**

---

## Tâche 2 : la fenêtre de lignes et la requête

**Fichiers :** créer `src-tauri/src/engine/rows.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn une_requete_de_lignes_porte_toujours_une_limite() {
    // La contrainte transverse rendue impossible à contourner : aucun constructeur
    // n'accepte « tout ».
    let requete = RowQuery::new("public", "orders", RowLimit::FiveHundred);
    assert_eq!(requete.limit.value(), 500);
}

#[test]
fn les_paliers_de_limite_sont_ceux_du_handoff() {
    // `A5` : stepper 100 / 500 / 1000 / 5000. Pas de valeur libre — c'est ce qui
    // empêche un appelant de demander cinq millions de lignes.
    let paliers: Vec<u32> = RowLimit::tous().iter().map(|p| p.value()).collect();
    assert_eq!(paliers, vec![100, 500, 1000, 5000]);
}

#[test]
fn les_cinq_operateurs_de_a5_existent() {
    // =, ≠, in, ~, is null
    assert_eq!(FilterOperator::tous().len(), 5);
}

#[test]
fn is_null_ne_prend_pas_de_valeur() {
    assert!(!FilterOperator::IsNull.prend_une_valeur());
    assert!(FilterOperator::Eq.prend_une_valeur());
}

#[test]
fn une_fenetre_connait_son_decalage_et_son_total_optionnel() {
    // Le total est optionnel : le compter exactement sur une grande table coûte un
    // parcours complet.
    let fenetre = RowWindow { offset: 0, rows: vec![], total: None };
    assert!(fenetre.total.is_none());
}
```

- [ ] **Étape 2 : rouge → implémenter → vert**

`RowLimit` est une **énumération**, pas un `u32` : c'est ce qui rend « demander tout »
inexprimable. `Value` couvre nul, booléen, entier, flottant, texte, horodatage, JSON,
binaire — les cas que `A5` distingue au rendu.

- [ ] **Étape 3 : contrôle négatif**

Tenter d'écrire `RowQuery` sans limite, ou avec une limite libre, et constater que cela ne
compile pas.

- [ ] **Étape 4 : commit**

---

## Tâche 3 : l'erreur de moteur

**Fichiers :** créer `src-tauri/src/engine/error.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn une_erreur_porte_le_code_du_moteur_et_sa_position() {
    // `A7` affiche « le code SQLSTATE et la position » — c'est ce qui permet à un écran
    // de distinguer les cas sans analyser une chaîne traduite.
    let erreur = EngineError::from_engine("28P01", "authentification refusée").at(42);
    assert_eq!(erreur.code.as_deref(), Some("28P01"));
    assert_eq!(erreur.position, Some(42));
}

#[test]
fn aucune_variante_ne_peut_porter_de_secret() {
    // Propriété acquise en 05c, à ne pas défaire : le type n'a aucun champ où un
    // secret pourrait se glisser autrement que par un message construit à la main.
    let erreur = EngineError::from_engine("28P01", "mot de passe refusé pour dora_ro");
    assert!(!format!("{erreur}").contains("s3cr3t"));
}
```

- [ ] **Étape 2 : rouge → vert → commit**

Le second test est faible seul : il ne prouve rien qu'un `assert!(true)` ne prouverait.
Sa vraie valeur est en `06b`, où un échec d'authentification **réel** est passé au `grep`.
Le noter dans le test, pour que personne ne le croie suffisant.

---

## Tâche 4 : le trait, l'énumération, la projection

**Fichiers :** créer `src-tauri/src/engine/mod.rs` ; modifier `lib.rs`

- [ ] **Étape 1 : écrire le trait**

Quatre opérations, chacune rendant `impl Future<Output = Result<_, EngineError>> + Send` :
tester la connexion, lister les schémas, décrire une table, lire une fenêtre de lignes.

- [ ] **Étape 2 : l'énumération sans variante**

```rust
/// Aucune variante à ce stade : `06b` ajoutera `Postgres`. Un type sans variante est
/// légal et volontaire — il rend l'ensemble des moteurs explicite dès maintenant.
pub enum AnyEngine {}
```

- [ ] **Étape 3 : vérifier la compatibilité `Send`**

Une fonction de sonde `fn _exige_send<F: Future + Send>(_: F) {}` appliquée à un appel du
trait, pour que la propriété soit **vérifiée par le compilateur** et non supposée. Sans
elle, on découvrirait le problème en écrivant la première commande Tauri.

- [ ] **Étape 4 : projeter en TypeScript**

`#[ts(export, export_to = "../../src/domain/engine.ts")]` sur les types que l'IPC
transporte. Ajouter `src/domain/engine.ts` à l'exclusion de formatage de `biome.json`,
comme `config.ts` — leçon du plan `05c` : un fichier généré n'a qu'un seul producteur.

Étendre `domain:check` pour couvrir les deux fichiers.

- [ ] **Étape 5 : contrôle négatif du garde-fou étendu**

Ajouter un champ à un type Rust, indexer l'ancienne projection, lancer `pnpm domain:check`,
constater l'échec.

- [ ] **Étape 6 : commit**

---

## Tâche 5 : vérification de fin

- [ ] le trait compile sans aucun adaptateur, et l'énumération est vide et documentée
- [ ] le modèle couvre les six lignes du tableau de la spec, et rien de plus
- [ ] `RowLimit` rend « demander tout » inexprimable, vérifié par un contrôle négatif
- [ ] l'erreur porte code, position, message
- [ ] la propriété `Send` est vérifiée par le compilateur
- [ ] la projection TypeScript est générée, exclue du formatage, et son garde-fou étendu
      échoue si elle dérive
- [ ] aucun test n'a besoin d'une base
- [ ] `cargo test`, `clippy`, `fmt`, `pnpm typecheck`, `lint`, `test`, `domain:check` —
      le commit **gaté** sur eux, pas seulement affichés
