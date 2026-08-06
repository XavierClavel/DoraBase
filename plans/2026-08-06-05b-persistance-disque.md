# Plan d'implémentation — 05b Persistance sur disque

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** ranger la configuration de `05a` sur disque et la relire sans jamais la
corrompre — y compris si l'app est tuée en pleine écriture.

**Architecture :** la logique prend un **chemin** en paramètre, donc se teste avec un
répertoire temporaire ; seule la commande Tauri résout le vrai chemin. Le refus d'écrire
après une lecture douteuse est porté par un **type**, pas par une convention d'appel.

**Stack :** Rust · serde_json · tempfile · Tauri path API

**Spec :** `specs/05b-persistance-disque.md` — **Prérequis :** plan `05a`

---

## Acquis du plan `05a`, à ne pas réapprendre

- **`cargo test` est en CI** depuis `05a`, et `pnpm domain:check` avec. Tout nouveau type
  sérialisable doit être régénéré (`pnpm domain:build`) ou la CI échoue.
- **Ne jamais tuber une commande de vérification.** `cmd | tail` sort avec le statut de
  `tail` : un commit gaté là-dessus n'est pas gaté. Utiliser
  `cmd >/dev/null 2>&1 && echo OK || echo ÉCHEC`.
- **Une sonde d'encapsulation doit venir d'un autre module** que celui qui déclare le type.
- **Relire les fichiers générés**, pas seulement le code qui les génère.

## Deux décisions techniques, vérifiées avant d'écrire

**`app_config_dir()`**, lu dans la source de `tauri 2.11.5` : résout en
`config_dir()/<identifiant du bundle>` — sur macOS, `~/Library/Application Support/…`.
C'est l'API à employer, jamais un chemin littéral : c'est ce qui garde Windows et Linux
ouverts. `core:path:default` est déjà accordé par `capabilities/default.json`.

**`tempfile 3.27.0`** en dépendance de développement seulement. Pour l'écriture atomique
en production, le fichier temporaire doit vivre **dans le répertoire cible** — un
renommage entre volumes n'est pas atomique, c'est une copie. On l'écrit donc à la main
(`config.json.tmp` à côté de `config.json`) plutôt qu'avec `NamedTempFile`, qui viserait
`/tmp` par défaut. `tempfile` sert aux **tests**, pour leur donner un répertoire jetable.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/config/store.rs` | lecture, écriture atomique, versions, mise en quarantaine |
| `src-tauri/src/config/commands.rs` | les deux commandes Tauri, qui résolvent le chemin |
| `src-tauri/src/config/mod.rs` | réexports |
| `src-tauri/src/lib.rs` | enregistre les commandes |
| `src/domain/config.ts` | **régénéré** — `LoadOutcome` traverse l'IPC |

---

## Tâche 1 : le format de fichier et son aller-retour

**Fichiers :** créer `src-tauri/src/config/store.rs` ; modifier `Cargo.toml`, `mod.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn un_aller_retour_rend_la_configuration_identique() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    let projets = vec![projet_de_test()];

    save(&chemin, &projets).unwrap();
    let relu = match load(&chemin) {
        LoadOutcome::Loaded(projets) => projets,
        autre => panic!("attendu Loaded, obtenu {autre:?}"),
    };

    assert_eq!(relu, projets);
}

#[test]
fn le_fichier_porte_un_numero_de_version() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    save(&chemin, &[]).unwrap();

    let brut = std::fs::read_to_string(&chemin).unwrap();
    let valeur: serde_json::Value = serde_json::from_str(&brut).unwrap();
    assert_eq!(valeur["version"], serde_json::json!(VERSION_COURANTE));
}

#[test]
fn le_repertoire_est_cree_s_il_manque() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("sous/dossier/config.json");
    save(&chemin, &[]).unwrap();
    assert!(chemin.exists());
}
```

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml store
```

- [ ] **Étape 3 : implémenter `save` et `load` dans leur forme minimale**

`ConfigFile { version: u32, projects: Vec<Project> }`, sérialisé en JSON indenté — le
fichier est destiné à être relisible par un humain, c'est ce qui justifie le format.

- [ ] **Étape 4 : lancer, constater le succès** — 3 tests passants
- [ ] **Étape 5 : commit**

```bash
git add -A && git commit -m "feat(config): aller-retour de la configuration sur disque"
```

---

## Tâche 2 : l'écriture atomique, et sa preuve

**Fichiers :** modifier `src-tauri/src/config/store.rs`

C'est **la** tâche de ce plan. Écrire par-dessus le fichier existant, c'est accepter
qu'une interruption laisse un JSON tronqué — donc tous les projets de l'utilisateur
perdus.

- [ ] **Étape 1 : écrire le test qui échoue**

```rust
#[test]
fn une_ecriture_interrompue_laisse_l_ancien_fichier_intact() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");

    // Un premier état, complet et valide.
    save(&chemin, &[projet_nomme("Ancien")]).unwrap();
    let avant = std::fs::read_to_string(&chemin).unwrap();

    // Simule l'interruption : le temporaire est écrit, le renommage n'a pas lieu.
    ecrire_temporaire_sans_renommer(&chemin, &[projet_nomme("Nouveau")]).unwrap();

    // Le fichier cible n'a pas bougé, et reste lisible.
    assert_eq!(std::fs::read_to_string(&chemin).unwrap(), avant);
    assert!(matches!(load(&chemin), LoadOutcome::Loaded(projets)
        if projets[0].name == "Ancien"));
}

#[test]
fn le_temporaire_vit_dans_le_meme_repertoire_que_la_cible() {
    // Un renommage entre volumes n'est pas atomique : c'est une copie, donc
    // interruptible. Le temporaire doit être un frère du fichier cible.
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    let temporaire = chemin_temporaire(&chemin);
    assert_eq!(temporaire.parent(), chemin.parent());
}
```

`ecrire_temporaire_sans_renommer` et `chemin_temporaire` sont exposés en
`#[cfg(test)]` ou `pub(crate)` : c'est le seul moyen de tester l'atomicité sans tuer un
processus, et le découpage rend la séquence explicite.

- [ ] **Étape 2 : lancer, constater l'échec**
- [ ] **Étape 3 : implémenter la séquence**

Écrire dans `<cible>.tmp` → `File::sync_all()` → `fs::rename` sur la cible. Le `sync_all`
n'est pas décoratif : sans lui, le renommage peut précéder l'arrivée des octets sur le
support, et une panne laisse un fichier renommé mais vide.

- [ ] **Étape 4 : lancer, constater le succès**
- [ ] **Étape 5 : contrôle négatif — retirer l'atomicité**

Remplacer temporairement la séquence par un `fs::write` direct, constater que le test
d'interruption échoue, restaurer. Sans ce contrôle, le test pourrait passer pour de
mauvaises raisons.

- [ ] **Étape 6 : commit**

---

## Tâche 3 : les quatre cas de lecture

**Fichiers :** modifier `src-tauri/src/config/store.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn un_fichier_absent_donne_une_configuration_neuve() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(load(&dir.path().join("absent.json")), LoadOutcome::Fresh));
}

#[test]
fn un_fichier_illisible_est_signale_et_conserve() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    std::fs::write(&chemin, "{ ceci n'est pas du JSON").unwrap();

    let quarantaine = match load(&chemin) {
        LoadOutcome::Unreadable { quarantined_to, .. } => quarantined_to,
        autre => panic!("attendu Unreadable, obtenu {autre:?}"),
    };

    // L'original est préservé sous un autre nom — c'est peut-être la seule copie
    // du travail de l'utilisateur.
    assert!(quarantaine.exists());
    assert_eq!(std::fs::read_to_string(&quarantaine).unwrap(), "{ ceci n'est pas du JSON");
}

#[test]
fn un_fichier_vide_est_illisible_pas_neuf() {
    // Distinction qui compte : « vide » ne doit pas se confondre avec « absent »,
    // sinon on écrase un fichier dont on n'a pas su lire le contenu.
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    std::fs::write(&chemin, "").unwrap();
    assert!(matches!(load(&chemin), LoadOutcome::Unreadable { .. }));
}

#[test]
fn une_version_posterieure_est_refusee_sans_rien_ecrire() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    let futur = format!(r#"{{"version":{},"projects":[]}}"#, VERSION_COURANTE + 1);
    std::fs::write(&chemin, &futur).unwrap();

    assert!(matches!(load(&chemin), LoadOutcome::TooNew { .. }));
    // Rien n'a été touché : c'est le cas d'une app rétrogradée.
    assert_eq!(std::fs::read_to_string(&chemin).unwrap(), futur);
}
```

- [ ] **Étape 2 : lancer, constater l'échec**
- [ ] **Étape 3 : implémenter les quatre issues**

Le nom de quarantaine doit être **déterministe et non destructif** : ne jamais écraser une
quarantaine antérieure, sinon deux démarrages successifs perdent la première copie.
`Date::now()` n'est pas disponible dans les scripts de ce projet mais l'est en Rust ; à
défaut, un suffixe incrémental convient et se teste.

- [ ] **Étape 4 : lancer, constater le succès** — 4 tests passants
- [ ] **Étape 5 : commit**

---

## Tâche 4 : refuser d'écrire après une lecture douteuse

**Fichiers :** modifier `src-tauri/src/config/store.rs`

Le chemin par lequel on perdrait réellement les données : lecture refusée → l'écran
d'accueil s'affiche → l'utilisateur crée un projet → cette écriture écrase le fichier
qu'on venait de refuser d'ouvrir.

- [ ] **Étape 1 : écrire le test qui échoue**

```rust
#[test]
fn ecrire_apres_une_lecture_illisible_est_refuse() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    std::fs::write(&chemin, "pas du JSON").unwrap();

    let (store, issue) = ConfigStore::open(&chemin);
    assert!(matches!(issue, LoadOutcome::Unreadable { .. }));

    let erreur = store.save(&[projet_nomme("Nouveau")]);
    assert!(matches!(erreur, Err(StoreError::EcritureRefusee { .. })));
    // Et le fichier d'origine est toujours là.
    assert_eq!(std::fs::read_to_string(&chemin).unwrap(), "pas du JSON");
}

#[test]
fn ecrire_apres_une_lecture_saine_est_permis() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    let (store, issue) = ConfigStore::open(&chemin);
    assert!(matches!(issue, LoadOutcome::Fresh));
    assert!(store.save(&[projet_nomme("Premier")]).is_ok());
}
```

- [ ] **Étape 2 : lancer, constater l'échec**
- [ ] **Étape 3 : implémenter `ConfigStore`**

La propriété est portée par le **type** : `ConfigStore::open` rend le magasin et l'issue
de lecture, et `save` refuse si l'ouverture n'a pas été saine. Une fonction libre
`save(path, …)` laisserait l'appelant libre de l'oublier — et cet oubli coûterait les
données de l'utilisateur.

- [ ] **Étape 4 : lancer, constater le succès**
- [ ] **Étape 5 : commit**

---

## Tâche 5 : le mécanisme de migration

**Fichiers :** modifier `src-tauri/src/config/store.rs`

Aucune migration réelle n'existe — il n'y a qu'une version. Ce qui est livré, c'est le
**mécanisme** et son test, tant qu'il est gratuit de le poser.

- [ ] **Étape 1 : écrire le test qui échoue**

```rust
#[test]
fn une_version_anterieure_est_migree_apres_sauvegarde_de_l_original() {
    // Version factice 0, avec une forme volontairement différente, pour exercer la
    // chaîne sans attendre une vraie évolution du format.
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");
    std::fs::write(&chemin, r#"{"version":0,"projects":[]}"#).unwrap();

    let issue = load(&chemin);
    assert!(matches!(issue, LoadOutcome::Loaded(_)));
    // Une copie de l'original subsiste : une migration fautive doit rester réparable.
    assert!(sauvegarde_de_migration(&chemin, 0).exists());
}
```

- [ ] **Étape 2 : rouge → implémenter → vert**
- [ ] **Étape 3 : commit**

---

## Tâche 6 : les commandes Tauri

**Fichiers :** créer `src-tauri/src/config/commands.rs` ; modifier `lib.rs`, `mod.rs`

- [ ] **Étape 1 : implémenter les deux commandes**

`load_config` et `save_config`, qui résolvent le chemin par `app.path().app_config_dir()`
puis délèguent. `specs/README.md` § « Acquis techniques » note qu'une commande définie par
l'app ne passe pas par les ACL : **aucune permission à ajouter**, ce qui est à vérifier
plutôt qu'à croire.

Le `ConfigStore` vit dans l'état géré de Tauri, pour que la propriété « écriture refusée
après lecture douteuse » survive entre deux appels IPC. Sans ça, chaque commande rouvrirait
le magasin et l'oublierait.

- [ ] **Étape 2 : régénérer la projection TypeScript**

```bash
pnpm domain:build && git diff --stat src/domain/config.ts
```

`LoadOutcome` et `StoreError` traversent l'IPC : ils ont besoin de `TS`.

- [ ] **Étape 3 : vérifier depuis l'app réelle**

```bash
export PATH="$HOME/.cargo/bin:$PATH" && pnpm tauri dev
```

Depuis la console de l'inspecteur : appeler `load_config`, constater `Fresh` au premier
lancement ; appeler `save_config` avec un projet ; relancer l'app, constater que le projet
est relu. Puis vérifier que le fichier existe bien sous
`~/Library/Application Support/` et qu'il est lisible à l'œil.

- [ ] **Étape 4 : commit**

---

## Tâche 7 : aucun secret dans le fichier

**Fichiers :** modifier `src-tauri/src/config/store.rs`

- [ ] **Étape 1 : écrire le test**

```rust
#[test]
fn aucune_valeur_de_secret_n_atteint_le_fichier() {
    let dir = tempfile::tempdir().unwrap();
    let chemin = dir.path().join("config.json");

    // Une référence de secret dont la valeur, elle, n'existe que dans 05c.
    let projets = vec![projet_avec_reference_de_secret("ref-abc123")];
    save(&chemin, &projets).unwrap();

    // Lecture en **texte brut** : c'est la seule vérification qui vaille.
    let brut = std::fs::read_to_string(&chemin).unwrap();
    assert!(brut.contains("ref-abc123"), "la référence doit être persistée");
    assert!(!brut.contains("motdepasse-en-clair"));
}
```

Ce test est un contrôle positif **et** négatif : il vérifie que la référence est bien là
(sinon le test ne prouverait rien) et que la valeur n'y est pas.

- [ ] **Étape 2 : rouge → vert → commit**

---

## Acquis d'exécution

| Défaut | Trouvé par |
| --- | --- |
| **Le test d'atomicité ne testait pas `save`** : il appelait le helper directement, donc restait vert en remplaçant tout le corps de `save` par un `fs::write` | sabotage — et c'est le trou le plus instructif de ces plans |
| `sauvegarde_de_migration` rend le prochain chemin **libre**, donc ne peut pas servir à retrouver la sauvegarde qui vient d'être écrite | le test a échoué en cherchant `.avant-v0` alors que la fonction rendait déjà `.avant-v0.1` |
| `generate_handler!` a besoin des éléments cachés que `#[tauri::command]` génère à côté de la fonction, qu'un `pub use` ne réexporte pas | `error[E0433]: cannot find __cmd__load_config` |
| `rename_all` renomme les **variantes** d'une énumération, pas les champs de leurs structures — `quarantined_to` restait en snake_case dans un fichier camelCase | lecture de la projection générée |
| Une sonde appelée avant d'être définie fait échouer `tauri dev` en silence dans son journal | le moniteur, qui surveillait aussi `error[E` |

**Les leçons :**

1. **Vérifier que le test porte sur le bon sujet.** Un test qui exerce un helper ne dit
   rien de la fonction publique qui devrait l'appeler. La question à se poser : « si je
   remplaçais tout le corps de la fonction publique, ce test échouerait-il ? » Ici la
   réponse était non. La correction a demandé une propriété **observable de l'extérieur** —
   un `rename` change l'inode, une troncature en place le conserve.
2. **Un générateur de « prochain nom libre » n'est pas un localisateur.** Les deux usages
   sont incompatibles par construction : le premier évite ce qui existe, le second le
   cherche. Lister le répertoire est la bonne façon de retrouver ce qui a été écrit.
3. **Les macros Tauri exigent des chemins de module, pas des réexports.**
4. **Une sonde dans `setup()` atteint ce qu'aucun test unitaire ne peut** : la résolution
   réelle de `app_config_dir()` et l'écriture sur le vrai disque. Vérifié —
   `~/Library/Application Support/com.dorabase.desktop/config.json`, contenu conforme,
   aucun temporaire résiduel.

**Ce qui n'a pas été exercé, et pourquoi.** Le pont **JavaScript → Rust** lui-même :
Playwright ne pilote pas WKWebView, et aucun plugin de log côté JS n'est installé pour
remonter les traces de la webview. La sonde vérifie tout le chemin *sauf* l'appel
`invoke()` depuis le front. L'enregistrement des commandes est garanti par la compilation
(`generate_handler!` échouerait sinon), et le pont sera réellement exercé par `08`, premier
écran à appeler ces commandes. À ne pas présenter comme vérifié d'ici là.

## Tâche 8 : vérification de fin

Contrôlé contre `specs/05b-persistance-disque.md` § Terminé quand.

- [x] **aller-retour identique** — test unitaire, et vérifié dans l'app réelle : le fichier
      écrit sous `~/Library/Application Support/com.dorabase.desktop/config.json` porte
      `"version": 1`, des champs camelCase, et se relit avec son environnement actif.
- [x] **atomicité prouvée** — deux tests : l'un vérifie qu'une écriture interrompue avant
      le renommage laisse l'ancien fichier intact, l'autre que `save` **remplace** le
      fichier au lieu de le tronquer (l'inode change). Le second existe parce que le
      premier ne détectait pas le sabotage ; il le détecte.
- [x] **les quatre cas de lecture testés**, aucune panique.
- [x] **« absent » et « illisible » distincts, écriture refusée après « illisible »** —
      vérifié en test *et dans l'app réelle* : fichier corrompu à la main, l'app rend
      `Unreadable` avec sa raison, refuse d'écrire, et déplace l'original en
      `config.json.illisible` où il se retrouve **octet pour octet**.
- [x] **chemin résolu par l'API de Tauri** — `app_config_dir()`, confirmé par la sonde ;
      aucun littéral de plateforme dans le code.
- [x] **mécanisme de migration testé** avec une version 0 factice, sauvegarde comprise.
- [x] **aucun secret dans le fichier** — test à contrôle positif *et* négatif : la
      référence doit y être, la valeur non.
- [x] **l'environnement actif survit** — test d'aller-retour, et confirmé par la sonde
      (`env = Some(Prod)`).
- [x] `cargo test` (40), `clippy`, `fmt`, `pnpm typecheck`, `lint`, `test`, `domain:check` —
      chacun vérifié **sans tube**.

**Une question d'ergonomie laissée à `08`/`09`**, révélée par la sonde : après une mise en
quarantaine, la cible n'existe plus, donc la *session suivante* lit `Fresh` et peut écrire —
c'est voulu, l'utilisateur doit pouvoir repartir. Mais la session **qui découvre** la
corruption, elle, ne peut pas écrire du tout. Si l'écran d'erreur propose « repartir de
zéro », il faudra soit rouvrir le magasin, soit redémarrer l'app. À trancher avec l'écran,
pas ici.
