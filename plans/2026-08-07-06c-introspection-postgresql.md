# Plan d'implémentation — 06c Introspection PostgreSQL

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** remplir le modèle de `06a` depuis les catalogues `pg_*` — schémas, objets,
colonnes, index, contraintes, triggers, relations, DDL.

**Architecture :** une requête par **nature d'objet**, jamais une par objet. Les requêtes
sont mises au point contre une vraie base avant d'être écrites en Rust.

**Stack :** Rust · tokio-postgres · catalogues `pg_*`

**Spec :** `specs/06c-introspection-postgresql.md` — **Prérequis :** plans `06a`, `06b`

---

## Requêtes mises au point contre PostgreSQL 17.6, le 7 août 2026

Toutes vérifiées contre un schéma de test portant : deux tables (dont une avec clé
étrangère, contrainte `CHECK`, neuf colonnes couvrant les huit catégories de type), une
vue, deux fonctions, un trigger, un index secondaire, des commentaires de table, de colonne
et de schéma.

### Cinq surprises relevées, qui auraient chacune coûté un aller-retour

**1. `reltuples = -1` signifie « inconnu », pas « moins une ligne ».** Depuis PostgreSQL 14,
une relation jamais analysée porte `-1`. La vue de test le rend, et l'afficher tel quel
donnerait « −1 lignes » dans l'arbre de `A4`. À traduire en absence de comptage.

**2. `typcategory` seul ne suffit pas à catégoriser.** `jsonb`, `uuid` et `bytea` rendent
tous `U` (type défini par l'utilisateur). Les glyphes `{}`, `ID` et `▤` de `A5` seraient donc
confondus. La catégorie combine `typcategory` **et** le nom de type pour ces cas.

| `typcategory` | Catégorie de `06a` |
| --- | --- |
| `N` | `Number` |
| `S` | `Text` |
| `D` | `Timestamp` |
| `B` | `Boolean` |
| `U` + nom `json`/`jsonb` | `Json` |
| `U` + nom `uuid` | `Uuid` |
| `U` + nom `bytea` | `Binary` |
| autre | `Other` |

**3. Les index sont comptés dans `pg_class`, donc dans les compteurs de `A4`.** Le schéma
de test rend 4 index pour 2 tables : les clés primaires en créent un chacune. C'est
cohérent avec « Index 31 » du mockup, qui compte bien tous les index.

**4. `pg_get_constraintdef` rend la définition déjà formatée** — `PRIMARY KEY (id)`,
`FOREIGN KEY (user_id) REFERENCES …`. Idem `pg_get_indexdef` et `pg_get_triggerdef`. C'est
ce qui rend le DDL assemblable sans concaténation à la main, comme la spec l'exige.

**5. Les triggers internes doivent être exclus.** `pg_trigger` contient ceux que les clés
étrangères créent : sans `not tgisinternal`, `A9` afficherait des triggers que l'utilisateur
n'a pas écrits.

### Les requêtes retenues

Reprises telles quelles depuis les sondes, à ne pas réécrire de mémoire.

**Schémas** — exclut `pg_catalog`, `information_schema`, `pg_toast` et les schémas
temporaires, et compte les quatre natures d'objet :

```sql
select n.nspname as name,
       count(*) filter (where c.relkind in ('r','p')) as tables,
       count(*) filter (where c.relkind in ('v','m')) as views,
       count(*) filter (where c.relkind = 'i')        as indexes,
       (select count(*) from pg_proc p where p.pronamespace = n.oid) as functions
  from pg_namespace n
  left join pg_class c on c.relnamespace = n.oid
 where n.nspname not in ('pg_catalog','information_schema','pg_toast')
   and n.nspname not like 'pg\_temp%' and n.nspname not like 'pg\_toast\_temp%'
 group by n.nspname, n.oid
 order by n.nspname;
```

**Objets d'un schéma** — les sept colonnes du tableau de `A4`, en **une** requête pour tous
les objets. `pg_stat_all_tables` donne le dernier `ANALYZE`, manuel ou automatique.

**Colonnes**, **index**, **contraintes**, **triggers**, **relations** : voir les sondes du
journal de session ; chacune est une requête unique par table.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/engine/postgres/introspect.rs` | les requêtes de catalogue et leur mapping |
| `src-tauri/src/engine/postgres/types.rs` | `typcategory` + nom → `TypeCategory` |
| `src-tauri/src/engine/postgres/mod.rs` | modifié : les trois opérations branchées |

---

## Tâche 1 : la catégorisation des types

**Fichiers :** créer `src-tauri/src/engine/postgres/types.rs`

Première tâche parce qu'elle est **pure** — donc testable sans base, et exhaustivement.

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn les_categories_de_pg_se_traduisent() {
    assert_eq!(categoriser('N', "bigint"), TypeCategory::Number);
    assert_eq!(categoriser('S', "text"), TypeCategory::Text);
    assert_eq!(categoriser('D', "timestamp with time zone"), TypeCategory::Timestamp);
    assert_eq!(categoriser('B', "boolean"), TypeCategory::Boolean);
}

#[test]
fn les_types_u_sont_distingues_par_leur_nom() {
    // `jsonb`, `uuid` et `bytea` rendent tous `typcategory = 'U'` : sans le nom, les
    // glyphes `{}`, `ID` et `▤` de `A5` seraient confondus.
    assert_eq!(categoriser('U', "jsonb"), TypeCategory::Json);
    assert_eq!(categoriser('U', "json"), TypeCategory::Json);
    assert_eq!(categoriser('U', "uuid"), TypeCategory::Uuid);
    assert_eq!(categoriser('U', "bytea"), TypeCategory::Binary);
    assert_eq!(categoriser('U', "un_type_maison"), TypeCategory::Other);
}

#[test]
fn une_categorie_inconnue_retombe_sur_other() {
    // Plutôt qu'une panique : un type exotique ne doit pas empêcher d'ouvrir une table.
    assert_eq!(categoriser('Z', "quoi_que_ce_soit"), TypeCategory::Other);
}
```

- [ ] **Étape 2 : rouge → implémenter → vert → commit**

---

## Tâche 2 : schémas et objets

**Fichiers :** créer `src-tauri/src/engine/postgres/introspect.rs` ; modifier `mod.rs`

- [ ] **Étape 1 : écrire les tests qui échouent** (feature `db-tests`)

```rust
#[tokio::test]
async fn les_schemas_systeme_sont_exclus() {
    let schemas = adaptateur().await.schemas().await.unwrap();
    let noms: Vec<_> = schemas.iter().map(|s| s.name.as_str()).collect();
    assert!(!noms.contains(&"pg_catalog"), "{noms:?}");
    assert!(!noms.contains(&"information_schema"), "{noms:?}");
    // Contrôle positif : sans lui, une requête qui ne rend rien passerait.
    assert!(noms.contains(&"public"), "{noms:?}");
}

#[tokio::test]
async fn les_compteurs_d_objets_sont_justes() {
    // Le schéma de test porte 2 tables, 1 vue, 2 fonctions, 4 index (les clés primaires
    // en créent un chacune).
    let schema = schema_de_test().await;
    assert_eq!(schema.counts.tables, 2);
    assert_eq!(schema.counts.views, 1);
    assert_eq!(schema.counts.functions, 2);
    assert_eq!(schema.counts.indexes, 4);
}

#[tokio::test]
async fn un_objet_porte_les_sept_colonnes_de_a4() { … }

#[tokio::test]
async fn un_comptage_inconnu_n_est_pas_rendu_comme_moins_un() {
    // `reltuples = -1` sur une vue jamais analysée. L'afficher donnerait « −1 lignes ».
    let vue = objet_de_test("paid_orders").await;
    assert!(vue.rows.value() >= 0, "comptage négatif : {:?}", vue.rows);
}

#[tokio::test]
async fn le_comptage_de_l_arbre_est_une_estimation_pas_un_compte_exact() {
    // `A4` doit afficher une estimation, gratuite ; compter exactement coûterait un
    // parcours complet à chaque ouverture d'arbre.
    let table = objet_de_test("orders").await;
    assert!(!table.rows.is_exact(), "{:?}", table.rows);
}

#[tokio::test]
async fn ouvrir_un_schema_ne_fait_pas_une_requete_par_objet() {
    // Mesuré par le compteur de requêtes de la base elle-même, avant et après.
    let avant = requetes_executees().await;
    adaptateur().await.objects("introspection").await.unwrap();
    let apres = requetes_executees().await;
    assert!(apres - avant < 5, "{} requêtes pour un schéma", apres - avant);
}
```

Le dernier test est celui que la spec réclame explicitement — « vérifié en les comptant,
pas en supposant ». `pg_stat_database.xact_commit` ou `pg_stat_statements` donnent la mesure.

- [ ] **Étape 2 : rouge → implémenter → vert**
- [ ] **Étape 3 : contrôles négatifs** — retirer l'exclusion des schémas système, rendre
      `reltuples` brut, passer à une requête par objet : chacun doit faire échouer son test.
- [ ] **Étape 4 : commit**

---

## Tâche 3 : le détail d'une table

**Fichiers :** modifier `src-tauri/src/engine/postgres/introspect.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

Contre le schéma de test, qui porte délibérément chaque cas : clé primaire, clé étrangère,
contrainte `CHECK`, colonne à défaut, colonne nullable et non nullable, commentaires de
table et de colonne, index secondaire, trigger non interne.

```rust
#[tokio::test]
async fn les_triggers_internes_sont_exclus() {
    // `pg_trigger` contient ceux que les clés étrangères créent : sans `not tgisinternal`,
    // `A9` afficherait des triggers que l'utilisateur n'a pas écrits.
    let detail = detail_de_test("orders").await;
    assert_eq!(detail.triggers.len(), 1, "{:?}", detail.triggers);
    assert_eq!(detail.triggers[0].name, "orders_touch");
}

#[tokio::test]
async fn les_relations_sont_rendues_dans_les_deux_sens() {
    // Sortante depuis `orders`, entrante vue depuis `users`.
    assert!(detail_de_test("orders").await.relations.iter()
        .any(|r| r.direction == RelationDirection::Outgoing));
    assert!(detail_de_test("users").await.relations.iter()
        .any(|r| r.direction == RelationDirection::Incoming));
}
```

- [ ] **Étape 2 : rouge → vert → commit**

---

## Tâche 4 : le DDL, vérifié en le rejouant

**Fichiers :** modifier `src-tauri/src/engine/postgres/introspect.rs`

C'est le critère le plus fort de la spec : **un DDL qui ne se réexécute pas est faux**, et
c'est testable.

- [ ] **Étape 1 : écrire le test qui échoue**

```rust
#[tokio::test]
async fn le_ddl_produit_se_rejoue_et_donne_la_meme_table() {
    let original = detail_de_test("orders").await;

    // Rejoué dans un schéma vierge, sans toucher à l'original.
    executer("create schema ddl_rejeu").await;
    executer(&original.ddl.replace("introspection.", "ddl_rejeu.")).await;

    let copie = detail_de("ddl_rejeu", "orders").await;
    // Les colonnes doivent correspondre, nom, type, nullabilité et défaut compris.
    assert_eq!(
        copie.columns.iter().map(decrire).collect::<Vec<_>>(),
        original.columns.iter().map(decrire).collect::<Vec<_>>()
    );
}
```

- [ ] **Étape 2 : rouge → implémenter → vert**

Le DDL est assemblé depuis `format_type`, `pg_get_expr` et `pg_get_constraintdef` — jamais
par concaténation à la main. La spec le justifie : types de tableaux, défauts avec appels de
fonction, contraintes d'exclusion rendent la reconstruction manuelle sans fin.

- [ ] **Étape 3 : commit**

---

## Tâche 5 : vérification de fin

- [ ] schémas listés, sans les systèmes, avec contrôle positif sur `public`
- [ ] les quatre compteurs justes contre un schéma de composition connue
- [ ] les sept colonnes du tableau de `A4`, dont le dernier `ANALYZE`
- [ ] `reltuples = -1` n'atteint jamais l'écran
- [ ] l'arbre emploie une **estimation**, pas un compte exact
- [ ] ouvrir un schéma ne fait pas une requête par objet, **mesuré**
- [ ] colonnes, index, contraintes, triggers, relations couverts, triggers internes exclus
- [ ] **le DDL se rejoue** et produit une table de même description
- [ ] les huit vérifications habituelles passent, le commit **gaté** sur elles
