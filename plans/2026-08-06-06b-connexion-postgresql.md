# Plan d'implémentation — 06b Connexion PostgreSQL

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** ouvrir une connexion PostgreSQL depuis la configuration de `05a` et le
secret de `05c`, et répondre au bouton « Tester la connexion » de `A2`.

**Architecture :** l'adaptateur implémente `EngineAdapter` de `06a` et devient la première
variante de `AnyEngine`. Les tests exigeant une base sont derrière une **feature cargo**,
lancés par un second job de CI sur Linux.

**Stack :** Rust · tokio-postgres · rustls · tokio

**Spec :** `specs/06b-connexion-postgresql.md` — **Prérequis :** plans `06a`, `05a`, `05c`

---

## L'infrastructure d'abord, parce qu'elle conditionne tout le reste

Un adaptateur non testé contre une vraie base ne vaut rien : catalogues, codes d'erreur et
modes SSL ne se devinent pas. Deux contraintes se combinent :

1. La CI tourne sur `macos-latest` — nécessaire pour `pnpm tauri build`. Les *service
   containers* de GitHub Actions **n'y fonctionnent pas**, ils exigent un runner Linux.
2. Localement, PostgreSQL 17 est installé mais **arrêté**, et les conteneurs Docker qui
   tournent appartiennent à d'autres projets de l'utilisateur — **ne pas y toucher**.

**Décisions :**

- Un **conteneur dédié** en local : `dorabase-test-pg`, sur le port **55432** pour ne
  croiser aucun des ports déjà pris (2346, 6431, 6433, 6434).
- Un **second job `ubuntu-latest`** en CI, avec un service `postgres:17`, qui ne lance que
  les tests moteur. Les deux jobs tournent en parallèle : la CI ne rallonge pas.
- Les tests exigeant une base sont derrière la feature `db-tests`, **pas** `#[ignore]` :
  une feature les rend *absents* du job macOS au lieu de silencieux. Le compte d'ignorés
  reste ainsi réservé au Trousseau de `05c`, au lieu de devenir une poubelle où deux
  familles de tests se cachent.
- L'adresse vient de `DORABASE_TEST_PG` avec un défaut raisonnable, **jamais** codée en dur.

## Choix de bibliothèques

| Crate | Pourquoi |
| --- | --- |
| `tokio-postgres` 0.7.18 | 58 M de téléchargements, le client asynchrone de référence ; asynchrone comme `06a` l'exige |
| `tokio` (features `rt-multi-thread`, `macros`) | déjà dans l'arbre via Tauri, mais sans exécuteur ni `#[tokio::test]` |

**Pour TLS, le choix se fait à l'implémentation**, entre `rustls` (Rust pur, cohérent avec
`russh` retenu en `06e`) et `native-tls` (délègue au trousseau système, donc reconnaît les
autorités déjà installées par l'utilisateur). Le second argument est sérieux pour un outil
d'entreprise dont les bases portent souvent un certificat d'autorité interne. **À trancher
en écrivant la tâche SSL, pas maintenant** — et à consigner.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/engine/postgres/mod.rs` | l'adaptateur, `EngineAdapter` pour PostgreSQL |
| `src-tauri/src/engine/postgres/connect.rs` | chaîne de connexion, modes SSL, ouverture |
| `src-tauri/src/engine/postgres/error.rs` | traduction des échecs en `EngineError` |
| `src-tauri/src/engine/mod.rs` | modifié : `AnyEngine::Postgres` |
| `.github/workflows/ci.yml` | modifié : second job Linux |
| `Cargo.toml` | modifié : feature `db-tests` |

---

## Tâche 1 : l'infrastructure de test, avant tout code

**Fichiers :** modifier `src-tauri/Cargo.toml`, `.github/workflows/ci.yml` ;
créer `src-tauri/src/engine/postgres/mod.rs`

- [ ] **Étape 1 : déclarer la feature et un test qui l'exige**

```toml
[features]
db-tests = []
```

```rust
/// Ce test **doit échouer** tant que l'infrastructure n'est pas en place : c'est le
/// contrôle négatif de la tâche. À remplacer par un vrai test à l'étape 5.
#[cfg(all(test, feature = "db-tests"))]
mod tests_db {
    #[test]
    fn controle_negatif_le_job_linux_execute_bien_les_tests_de_base() {
        panic!("contrôle négatif — le job Linux doit échouer ici");
    }
}
```

- [ ] **Étape 2 : vérifier que le job macOS ne le compile même pas**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c "controle_negatif"
```

Attendu : `0`. La feature étant absente, le test n'existe pas — ni passant, ni ignoré.
C'est la différence avec `#[ignore]`, et la raison de ce choix.

- [ ] **Étape 3 : ajouter le job Linux**

```yaml
  engine:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: dorabase
          POSTGRES_PASSWORD: dorabase-test
          POSTGRES_DB: dorabase_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s
          --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v7
      - run: rustup show
        working-directory: src-tauri
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: cargo test --features db-tests
        working-directory: src-tauri
        env:
          DORABASE_TEST_PG: postgres://dorabase:dorabase-test@localhost:5432/dorabase_test
```

- [ ] **Étape 4 : constater la CI rouge sur le job Linux, verte sur macOS**

C'est la preuve que le job lance bien les tests de base, et que l'autre les ignore.

- [ ] **Étape 5 : retirer le contrôle négatif, commit**

---

## Tâche 2 : ouvrir une connexion et la tester

**Fichiers :** créer `src-tauri/src/engine/postgres/{mod.rs,connect.rs}`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[cfg(feature = "db-tests")]
#[tokio::test]
async fn une_connexion_s_ouvre_et_rend_la_version() {
    let adaptateur = adaptateur_de_test().await;
    let sonde = adaptateur.probe().await.expect("la base de test répond");

    // `A2` affiche « Connecté en 240 ms · PostgreSQL 16.2 » : une durée ET une version.
    assert!(sonde.server_version.contains("PostgreSQL"), "{}", sonde.server_version);
    // Une durée plausible : non nulle en pratique, et pas absurde.
    assert!(sonde.latency_ms < 10_000);
}

#[cfg(feature = "db-tests")]
#[tokio::test]
async fn la_version_annoncee_est_celle_du_serveur() {
    // Contrôle croisé : la version rendue doit correspondre à ce que la base dit
    // par ailleurs. Sans ça, on pourrait rendre une constante et le test passerait.
    let attendue = version_par_requete_directe().await;
    let sonde = adaptateur_de_test().await.probe().await.unwrap();
    assert_eq!(sonde.server_version, attendue);
}
```

Le second test est celui qui compte : le premier passerait sur une chaîne codée en dur.

- [ ] **Étape 2 : rouge → implémenter → vert**

La durée mesurée court jusqu'à une connexion **interrogeable**, aller-retour de version
compris — c'est ce que l'utilisateur perçoit, et ce que le nombre affiché doit signifier.

- [ ] **Étape 3 : commit**

---

## Tâche 3 : les modes SSL

**Fichiers :** modifier `src-tauri/src/engine/postgres/connect.rs`

- [ ] **Étape 1 : trancher `rustls` contre `native-tls`, et le consigner**

Critère : un outil d'entreprise rencontre des autorités internes. `native-tls` les
reconnaît si l'utilisateur les a installées dans son trousseau ; `rustls` exige de les
fournir explicitement, ce qu'aucun écran du handoff ne permet. Décision à écrire dans le
module, avec sa raison.

- [ ] **Étape 2 : écrire les tests qui échouent**

```rust
#[cfg(feature = "db-tests")]
#[tokio::test]
async fn un_mode_non_verifiant_se_connecte_a_un_certificat_inconnu() {
    // `require` chiffre sans authentifier : il accepte un certificat auto-signé.
}

#[cfg(feature = "db-tests")]
#[tokio::test]
async fn un_mode_verifiant_refuse_un_certificat_inconnu() {
    // `verify-full` refuse. C'est **la** différence entre les deux familles, et
    // confondre `require` avec `verify-full` est l'erreur classique — la première
    // n'empêche pas un intermédiaire.
}

#[test]
fn les_six_modes_sont_acceptes() {
    for mode in [Disable, Allow, Prefer, Require, VerifyCa, VerifyFull] { … }
}
```

- [ ] **Étape 3 : rouge → vert**

Si le conteneur de test ne présente pas de certificat, la paire de tests vérifiants exige
de le configurer — un certificat auto-signé généré par le test. Coût réel, mais c'est la
**seule** façon de prouver que le réglage a un effet ; sans elle, les six modes pourraient
être ignorés et tous les tests passeraient.

- [ ] **Étape 4 : commit**

---

## Tâche 4 : les erreurs, et ce qu'elles taisent

**Fichiers :** créer `src-tauri/src/engine/postgres/error.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[cfg(feature = "db-tests")]
#[tokio::test]
async fn un_mot_de_passe_refuse_porte_le_sqlstate_28p01() { … }

#[cfg(feature = "db-tests")]
#[tokio::test]
async fn une_base_inconnue_porte_le_sqlstate_3d000() { … }

#[cfg(feature = "db-tests")]
#[tokio::test]
async fn un_hote_injoignable_n_a_pas_de_sqlstate() {
    // L'échec est en amont du moteur : `EngineError::local`, sans code.
}

#[cfg(feature = "db-tests")]
#[tokio::test]
async fn aucun_message_d_erreur_ne_contient_le_mot_de_passe() {
    const SENTINELLE: &str = "SENTINELLE-MOTDEPASSE-A-NE-JAMAIS-DIVULGUER";
    let erreur = tenter_connexion_avec_mot_de_passe(SENTINELLE).await.unwrap_err();

    // Contrôle positif : l'erreur doit bien être un refus d'authentification, sinon
    // l'absence de sentinelle ne prouverait rien.
    assert_eq!(erreur.code.as_deref(), Some("28P01"));
    assert!(!format!("{erreur}").contains(SENTINELLE));
    assert!(!format!("{erreur:?}").contains(SENTINELLE));
}
```

Le dernier est le seul qui vaille sur ce point : celui de `06a` était noté faible parce
qu'il construisait son propre message. Ici l'échec est **réel**, et une chaîne de connexion
porte le mot de passe — le risque est concret.

- [ ] **Étape 2 : rouge → vert → commit**

---

## Tâche 5 : refuser un tunnel, et brancher l'énumération

**Fichiers :** modifier `src-tauri/src/engine/{mod.rs,postgres/mod.rs}`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn une_variante_declarant_un_tunnel_est_refusee() {
    // Se connecter en direct alors que l'utilisateur a demandé un bastion serait
    // contourner sa consigne de sécurité. `06e` lèvera ce refus.
    let erreur = PostgresAdapter::prepare(&variante_avec_tunnel(), None).unwrap_err();
    assert!(erreur.message.contains("tunnel"));
}
```

- [ ] **Étape 2 : rouge → vert**

`AnyEngine` gagne sa variante `Postgres`, et ses méthodes délèguent. Le `match *self {}`
de `06a` devient un vrai `match`.

- [ ] **Étape 3 : commit**

---

## Tâche 6 : vérification de fin

- [ ] une connexion s'ouvre contre une vraie base et se ferme proprement
- [ ] la version rendue est **contrôlée contre** ce que la base dit par ailleurs
- [ ] les six modes SSL sont acceptés, et un test distingue une famille vérifiante d'une
      non vérifiante
- [ ] une variante à tunnel est refusée, pas connectée en direct
- [ ] `28P01`, `3D000` et un hôte injoignable ont chacun un test
- [ ] **aucun secret dans un message d'erreur**, sur un échec réel, sentinelle et contrôle
      positif
- [ ] le job macOS **ne compile pas** les tests de base — vérifié par un compte à zéro
- [ ] le job Linux est vert
- [ ] les sept vérifications habituelles passent, le commit **gaté** sur elles
