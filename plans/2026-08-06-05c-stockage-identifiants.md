# Plan d'implémentation — 05c Stockage des identifiants

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** ranger les secrets hors du fichier de configuration, derrière une interface
unique, avec le Trousseau en release signée et un fichier chiffré en développement.

**Architecture :** une interface (`SecretStore`) et deux implémentations. Le choix se fait
au démarrage d'après la signature effective du bundle. Un type `Secret` **sans `Debug`
dérivé** empêche structurellement la fuite dans les journaux.

**Stack :** Rust · chacha20poly1305 · keyring · codesign

**Spec :** `specs/05c-stockage-identifiants.md` — **Prérequis :** plans `05a`, `05b`

---

## Ce que ce plan ne peut pas vérifier, et qu'il ne prétendra pas vérifier

**Le Trousseau n'est pas testable ici.** Aucun Developer ID n'est disponible, et l'accès au
Trousseau macOS ouvre une invite graphique qui bloquerait la CI. Les tests du backend
Trousseau sont donc marqués `#[ignore]` et lancés à la main. Conséquence à assumer :
**cette implémentation part non vérifiée**, et c'est précisément pourquoi l'interface
existe — pour que le chemin de développement, lui, soit entièrement couvert.

**La prémisse du Trousseau est confirmée, elle.** `codesign -dv` sur le binaire de
développement rend `flags=0x20002(adhoc,linker-signed)`, `Signature=adhoc`,
`TeamIdentifier=not set` — exactement ce que `specs/README.md` annonçait. La détection a
donc une entrée réelle sur laquelle s'appuyer.

## API des crates, vérifiée avant d'écrire

Trois tentatives ont été nécessaires : la 0.11 de `chacha20poly1305` a migré vers
`rand_core` 0.9, donc ni `aead::OsRng` ni `generate_nonce` n'existent plus.

```rust
use chacha20poly1305::aead::{Aead, Generate, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

let cle: Key = Key::generate();          // exige les features getrandom ET rand_core
let nonce: Nonce = Nonce::generate();
let chiffre = ChaCha20Poly1305::new(&cle).encrypt(&nonce, clair)?;
let relue = Key::from([0u8; 32]);        // reconstruction depuis des octets stockés
```

`keyring` 4.1.6 n'a que les features `cli`, `default`, `v1` : les backends natifs sont
inclus par défaut. `Entry::new(service, compte)` puis `set_password`, `get_password`,
`delete_credential`.

## Structure de fichiers

| Fichier | Responsabilité |
| --- | --- |
| `src-tauri/src/secrets/mod.rs` | l'interface `SecretStore`, le type `Secret`, les erreurs |
| `src-tauri/src/secrets/file.rs` | implémentation fichier chiffré (développement) |
| `src-tauri/src/secrets/keychain.rs` | implémentation Trousseau (release signée) |
| `src-tauri/src/secrets/signature.rs` | détection de la signature — parseur pur + sonde |
| `src-tauri/src/secrets/commands.rs` | la commande qui expose le mécanisme actif |

---

## Tâche 1 : le type `Secret`, qui ne peut pas fuir

**Fichiers :** créer `src-tauri/src/secrets/mod.rs`

C'est la première tâche parce que tout le reste manipule ce type. Un `String` nu, ou un
`#[derive(Debug)]` sur un type qui en contient un, suffirait à écrire un mot de passe dans
les journaux — et `tauri-plugin-log` les garde sur disque en développement.

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn le_debug_d_un_secret_ne_montre_pas_sa_valeur() {
    let secret = Secret::new("motdepasse-tres-sensible");
    let rendu = format!("{secret:?}");
    assert!(!rendu.contains("motdepasse-tres-sensible"), "rendu = {rendu}");
    assert!(rendu.contains("Secret"), "le type doit rester identifiable");
}

#[test]
fn le_debug_d_une_structure_contenant_un_secret_ne_le_montre_pas() {
    // Le vrai risque : ce n'est pas `{secret:?}` qu'on écrira, c'est `{structure:?}`.
    #[derive(Debug)]
    struct Enveloppe {
        hote: String,
        mot_de_passe: Secret,
    }
    let rendu = format!(
        "{:?}",
        Enveloppe {
            hote: "db.internal".into(),
            mot_de_passe: Secret::new("motdepasse-tres-sensible"),
        }
    );
    assert!(!rendu.contains("motdepasse-tres-sensible"), "rendu = {rendu}");
}

#[test]
fn la_valeur_reste_accessible_explicitement() {
    // La lecture doit être possible, mais **nommée** : `expose()` se cherche au grep.
    assert_eq!(Secret::new("abc").expose(), "abc");
}
```

Le second test est celui qui compte : le premier protège un cas qu'on n'écrit jamais.

- [ ] **Étape 2 : lancer, constater l'échec**

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml secrets
```

- [ ] **Étape 3 : implémenter**

`Secret(String)` avec un `impl Debug` **manuel** qui écrit `Secret(***)`, et une méthode
`expose()` délibérément verbeuse. Pas de `Display`, pas de `Serialize` — un secret ne
traverse pas l'IPC et ne se sérialise pas ailleurs que dans son magasin.

Puis l'interface :

```rust
pub trait SecretStore: Send + Sync {
    fn store(&self, reference: &SecretRef, secret: &Secret) -> Result<(), SecretError>;
    fn retrieve(&self, reference: &SecretRef) -> Result<Option<Secret>, SecretError>;
    fn delete(&self, reference: &SecretRef) -> Result<(), SecretError>;
}
```

`retrieve` rend `Option` : « aucun secret pour cette référence » est un état normal, pas
une erreur — une base sans mot de passe existe (SQLite sur fichier).

- [ ] **Étape 4 : lancer, constater le succès** — 3 tests passants
- [ ] **Étape 5 : commit**

---

## Tâche 2 : le fichier chiffré de développement

**Fichiers :** créer `src-tauri/src/secrets/file.rs`

**Ce que cette implémentation protège, et ce qu'elle ne protège pas.** Elle empêche qu'un
mot de passe traîne **en clair** sur le disque — donc dans une sauvegarde, un partage
d'écran, un `grep`, un dump de journal. Elle ne protège **pas** contre un attaquant qui a
la session de l'utilisateur, puisque la clé vit sur la même machine. C'est acceptable en
développement, pas en release : d'où la détection de la tâche 4.

- [ ] **Étape 1 : écrire les tests qui échouent**

```rust
#[test]
fn un_aller_retour_rend_le_secret() {
    let dir = tempfile::tempdir().unwrap();
    let magasin = EncryptedFileStore::new(dir.path()).unwrap();
    let reference = SecretRef::new("analytics/prod/password");

    magasin.store(&reference, &Secret::new("s3cr3t")).unwrap();
    assert_eq!(magasin.retrieve(&reference).unwrap().unwrap().expose(), "s3cr3t");
}

#[test]
fn une_reference_inconnue_rend_none_pas_une_erreur() {
    let dir = tempfile::tempdir().unwrap();
    let magasin = EncryptedFileStore::new(dir.path()).unwrap();
    assert!(magasin.retrieve(&SecretRef::new("inconnue")).unwrap().is_none());
}

#[test]
fn le_secret_n_apparait_pas_en_clair_sur_le_disque() {
    let dir = tempfile::tempdir().unwrap();
    let magasin = EncryptedFileStore::new(dir.path()).unwrap();
    magasin.store(&SecretRef::new("r"), &Secret::new("motdepasse-en-clair")).unwrap();

    // Tous les fichiers du répertoire, lus en octets bruts.
    for entree in std::fs::read_dir(dir.path()).unwrap() {
        let octets = std::fs::read(entree.unwrap().path()).unwrap();
        assert!(
            !contient_sous_sequence(&octets, b"motdepasse-en-clair"),
            "un secret est lisible en clair sur le disque"
        );
    }
}

#[test]
fn un_fichier_altere_est_refuse_au_lieu_de_rendre_des_octets_faux() {
    let dir = tempfile::tempdir().unwrap();
    let magasin = EncryptedFileStore::new(dir.path()).unwrap();
    magasin.store(&SecretRef::new("r"), &Secret::new("s3cr3t")).unwrap();

    // Un octet retourné au milieu du chiffré.
    let chemin = dir.path().join(NOM_FICHIER_SECRETS);
    let mut octets = std::fs::read(&chemin).unwrap();
    let milieu = octets.len() / 2;
    octets[milieu] ^= 0xFF;
    std::fs::write(&chemin, &octets).unwrap();

    // Chiffrement **authentifié** : l'altération est détectée, pas ignorée.
    assert!(matches!(
        magasin.retrieve(&SecretRef::new("r")),
        Err(SecretError::Altere { .. })
    ));
}

#[cfg(unix)]
#[test]
fn la_cle_n_est_lisible_que_par_son_proprietaire() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    EncryptedFileStore::new(dir.path()).unwrap();
    let mode = std::fs::metadata(dir.path().join(NOM_FICHIER_CLE))
        .unwrap()
        .permissions()
        .mode();
    assert_eq!(mode & 0o777, 0o600, "mode = {:o}", mode & 0o777);
}

#[test]
fn supprimer_retire_le_secret() {
    let dir = tempfile::tempdir().unwrap();
    let magasin = EncryptedFileStore::new(dir.path()).unwrap();
    let reference = SecretRef::new("r");
    magasin.store(&reference, &Secret::new("s3cr3t")).unwrap();
    magasin.delete(&reference).unwrap();
    assert!(magasin.retrieve(&reference).unwrap().is_none());
}

#[test]
fn un_second_magasin_relit_ce_que_le_premier_a_ecrit() {
    // La clé doit être **réutilisée**, pas régénérée : sinon tous les secrets deviennent
    // illisibles au redémarrage suivant.
    let dir = tempfile::tempdir().unwrap();
    EncryptedFileStore::new(dir.path())
        .unwrap()
        .store(&SecretRef::new("r"), &Secret::new("s3cr3t"))
        .unwrap();

    let second = EncryptedFileStore::new(dir.path()).unwrap();
    assert_eq!(second.retrieve(&SecretRef::new("r")).unwrap().unwrap().expose(), "s3cr3t");
}
```

Le dernier test est le plus facile à casser sans le voir : régénérer la clé à chaque
ouverture passe tous les autres tests.

- [ ] **Étape 2 : lancer, constater l'échec**
- [ ] **Étape 3 : implémenter**

Deux fichiers : la clé (32 octets bruts, mode `0600`) et les secrets
(`nonce || chiffré`, un nonce neuf à chaque écriture). Le clair est une table
`référence → secret` sérialisée en JSON. L'écriture réutilise le `save` atomique de `05b`
si c'est possible sans couplage inutile, sinon la même séquence.

- [ ] **Étape 4 : lancer, constater le succès** — 7 tests passants
- [ ] **Étape 5 : contrôles négatifs**

Trois sabotages, chacun devant faire échouer un test précis :
1. écrire le clair au lieu du chiffré → le test « pas en clair sur le disque » échoue ;
2. régénérer la clé à chaque `new` → le test du second magasin échoue ;
3. ignorer l'erreur d'authentification → le test d'altération échoue.

- [ ] **Étape 6 : commit**

---

## Tâche 3 : le backend Trousseau

**Fichiers :** créer `src-tauri/src/secrets/keychain.rs`

- [ ] **Étape 1 : implémenter la délégation à `keyring`**

`Entry::new("com.dorabase.desktop", reference)` puis `set_password` / `get_password` /
`delete_credential`. `get_password` doit distinguer **« aucune entrée »** — qui devient
`Ok(None)` — de **toute autre erreur**, qui reste une erreur. Confondre les deux ferait
passer une panne du Trousseau pour une absence de mot de passe, et l'app redemanderait un
mot de passe déjà stocké.

- [ ] **Étape 2 : écrire les tests, marqués `#[ignore]`**

```rust
// `#[ignore]` : ces tests touchent le vrai Trousseau, donc ouvrent une invite graphique
// et bloqueraient la CI. À lancer à la main :
//   cargo test --manifest-path src-tauri/Cargo.toml keychain -- --ignored
#[test]
#[ignore = "touche le Trousseau réel — invite graphique"]
fn un_aller_retour_par_le_trousseau() { … }
```

- [ ] **Étape 3 : vérifier que la CI ne les lance pas**

```bash
cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep "ignored"
```

Attendu : le compte d'ignorés est non nul, et la suite reste verte.

- [ ] **Étape 4 : commit, en consignant que ce backend part non vérifié**

---

## Tâche 4 : détection de la signature

**Fichiers :** créer `src-tauri/src/secrets/signature.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

Le parseur est **pur** : il prend la sortie de `codesign` en chaîne, donc se teste sur des
sorties réelles enregistrées, sans dépendre de la machine.

```rust
/// Sortie réelle de `codesign -dv --verbose=4` sur le binaire de développement,
/// relevée le 6 août 2026.
const SORTIE_ADHOC: &str = "\
CodeDirectory v=20400 size=241298 flags=0x20002(adhoc,linker-signed) hashes=7537+0
Signature=adhoc
TeamIdentifier=not set";

const SORTIE_SIGNEE: &str = "\
CodeDirectory v=20400 size=241298 flags=0x10000(runtime) hashes=7537+0
Authority=Developer ID Application: Exemple (ABCDE12345)
TeamIdentifier=ABCDE12345";

#[test]
fn une_signature_adhoc_est_reconnue() {
    assert_eq!(analyser_signature(SORTIE_ADHOC), SignatureKind::AdHoc);
}

#[test]
fn une_signature_avec_identifiant_d_equipe_est_reconnue_comme_stable() {
    assert_eq!(analyser_signature(SORTIE_SIGNEE), SignatureKind::Stable);
}

#[test]
fn une_sortie_vide_ou_inattendue_est_traitee_comme_non_stable() {
    // Prudence délibérée : dans le doute, ne pas se fier au Trousseau, dont les ACL
    // casseraient. Le fichier chiffré fonctionne toujours.
    assert_eq!(analyser_signature(""), SignatureKind::AdHoc);
    assert_eq!(analyser_signature("code object is not signed at all"), SignatureKind::AdHoc);
}
```

- [ ] **Étape 2 : rouge → implémenter → vert**

Deux critères, tous deux nécessaires pour conclure « stable » : la ligne `Signature=` ne
dit pas `adhoc`, **et** `TeamIdentifier=` est renseigné. Un seul des deux suffirait à se
tromper.

- [ ] **Étape 3 : vérifier sur le binaire réel**

```bash
cd src-tauri && codesign -dv --verbose=4 target/debug/dorabase 2>&1 | grep -E "Signature=|TeamIdentifier="
```

Attendu : `Signature=adhoc`, `TeamIdentifier=not set` — donc `AdHoc`, donc fichier chiffré.

- [ ] **Étape 4 : commit**

---

## Tâche 5 : choix au démarrage et honnêteté de l'affichage

**Fichiers :** créer `src-tauri/src/secrets/commands.rs` ; modifier `lib.rs`

Le badge vert « Trousseau » de `A2` serait un mensonge en développement. Le front doit
savoir ce qui est réellement actif.

- [ ] **Étape 1 : implémenter la sélection**

Une fonction qui rend un `Box<dyn SecretStore>` selon `analyser_signature`, et un
`SecretMechanism` (`Keychain` | `EncryptedFile`) exposé par une commande, avec `TS` pour
la projection. **Aucun réglage** : le mécanisme se déduit, il ne se configure pas — un
réglage serait un moyen de dégrader la sécurité en silence.

- [ ] **Étape 2 : régénérer la projection et vérifier**

```bash
pnpm domain:build && grep -A 3 "SecretMechanism" src/domain/config.ts
```

- [ ] **Étape 3 : vérifier dans l'app réelle par une sonde temporaire**

Comme au plan `05b` : une sonde dans `setup()` qui journalise le mécanisme choisi, fait un
aller-retour, et **vérifie qu'aucun secret n'apparaît dans le journal**. Attendu en
développement : `EncryptedFile`.

- [ ] **Étape 4 : retirer la sonde, commit**

---

## Tâche 6 : les trois « jamais », vérifiés

**Fichiers :** modifier `src-tauri/src/secrets/mod.rs`

- [ ] **Étape 1 : aucun secret dans les journaux**

La sonde de la tâche 5 laisse un journal sur disque. Le passer au `grep` sur la valeur du
secret employé, et constater zéro occurrence. C'est une vérification **sur pièces**, pas
une relecture de code.

- [ ] **Étape 2 : aucun secret dans un message d'erreur**

```rust
#[test]
fn aucun_message_d_erreur_ne_contient_de_secret() {
    // Toutes les variantes, rendues par Display puis par Debug.
    for erreur in toutes_les_erreurs_possibles_avec("motdepasse-tres-sensible") {
        assert!(!format!("{erreur}").contains("motdepasse-tres-sensible"));
        assert!(!format!("{erreur:?}").contains("motdepasse-tres-sensible"));
    }
}
```

- [ ] **Étape 3 : aucun secret dans le fichier de configuration**

Déjà couvert par `05b` depuis l'autre côté ; ajouter ici l'assertion symétrique — le
magasin de secrets n'écrit **jamais** dans le fichier de configuration.

- [ ] **Étape 4 : commit**

---

## Acquis d'exécution

| Défaut | Trouvé par |
| --- | --- |
| **La chaîne de génération de `05a` avait un footgun** : `cargo test` réécrit `src/domain/config.ts` en sortie brute de `ts-rs`, tandis que `domain:build` la reformatait ensuite par Biome — donc tout `git add` suivant un simple `cargo test` indexait du non formaté | m'être fait piéger : un commit est parti avec la version brute |
| **Un commit est passé avec `clippy` rouge**, alors que le plan `05a` avait déjà consigné la leçon | j'avais *affiché* le résultat de clippy sans **gater** le commit dessus |
| Ma détection de signature ne pouvait pas reconnaître un binaire signé : elle cherchait un `Signature=` autre que `adhoc`, or un binaire signé imprime `Signature size=9000` — la ligne n'existe pas sous cette forme | le test sur la sortie signée |
| `Nonce::from_slice` est déprécié dans la 0.11 au profit de `TryFrom` | clippy, avec `-D warnings` |
| L'API de `chacha20poly1305` 0.11 n'est ni `aead::OsRng` ni `generate_nonce` : elle passe par `Generate`, derrière **deux** features (`getrandom` **et** `rand_core`) | trois tentatives de compilation, puis lecture de la source du crate |

**Les leçons :**

1. **Un fichier généré ne doit avoir qu'un seul producteur.** Faire dépendre sa forme
   committée de deux outils rend la chaîne sensible à l'ordre, et l'ordre finit par être
   violé — par la CI, ou par soi. Biome ne formate plus ce fichier (il continue de le
   linter) ; `cargo test` seul produit désormais la forme committée, vérifié en constatant
   que l'arbre reste propre après un `cargo test` nu. C'est une **révision** de la
   préférence énoncée au plan `05a`, qui avait causé le défaut.
2. **Vérifier n'est pas gater.** `cmd >/dev/null && echo OK || echo ÉCHEC` *affiche* le
   résultat ; il ne l'impose pas. Le commit doit être **dans la chaîne** :
   `verif1 && verif2 && { git commit …; } || echo ÉCHEC`. Avoir écrit la leçon au plan
   précédent ne m'a pas empêché de la répéter — d'où sa reformulation en une forme de
   commande à copier, plutôt qu'en principe.
3. **Détecter une propriété positivement, pas par l'absence de son contraire.** Les deux
   cas de `codesign` n'ont pas la même forme de sortie : déduire « signé » de « pas
   d'ad-hoc trouvé » revient à conclure depuis un motif qui n'existe dans aucun des deux.
4. **Une sentinelle plus un contrôle positif.** « Zéro occurrence du secret dans le
   journal » ne vaut rien sans la preuve que le journal *contient bien* la sonde. Les deux
   assertions vont ensemble, toujours.
5. **Le test le plus utile de ce plan est le moins évident** : « un second magasin relit ce
   que le premier a écrit ». Régénérer la clé à chaque ouverture passe tous les autres
   tests, et rend pourtant tous les secrets illisibles au redémarrage suivant.

## Tâche 7 : vérification de fin

- [x] **interface définie, deux implémentations**, et un test manipule un
      `dyn SecretStore` sans savoir lequel — ce que fera le reste de l'app.
- [x] **aller-retour couvert pour le fichier chiffré** (8 tests) ; couvert mais `#[ignore]`
      pour le Trousseau (3 tests), et **dit comme tel** en tête de son module : cette
      implémentation part non vérifiée, faute de Developer ID et parce que l'invite
      graphique bloquerait la CI.
- [x] **mécanisme choisi d'après la signature** — vérifié sur les deux sorties enregistrées,
      sur quatre cas limites, et **sur le binaire réel** : un test assure que le binaire de
      ce projet est bien ad-hoc, prémisse de toute la spec.
- [x] **le fichier chiffré refuse un contenu altéré** — un octet retourné au milieu du
      chiffré donne `SecretError::Altere`, pas des octets faux.
- [x] **la clé est en mode `0600`** (vérifié aussi sur le disque réel : `-rw-------`) **et
      réutilisée** entre deux ouvertures.
- [x] **aucun secret dans les journaux** — vérifié sur pièces avec sentinelle *et contrôle
      positif* : le journal de `~/Library/Logs/` contient bien les quatre lignes de la sonde
      et `Secret(***)`, et la sentinelle zéro fois.
- [x] **aucun secret dans un message d'erreur** : aucune variante de `SecretError` ne porte
      de `Secret`, donc c'est vrai par construction, `Display` comme `Debug`.
- [x] **aucune API propre à macOS hors de `keychain.rs`** — `rg` le confirme.
- [x] **le front peut afficher le mécanisme réellement actif** — `SecretMechanism` projeté
      en `"keychain" | "encryptedFile"`.
- [x] les sept vérifications passent, et le commit a été **gaté** sur elles.

**Ce qui reste à faire avant diffusion**, et qu'il ne faut pas oublier : lancer les tests du
Trousseau au premier build signé — `cargo test … keychain -- --ignored` — et vérifier que
`SecretMechanism` bascule alors sur `Keychain`.
