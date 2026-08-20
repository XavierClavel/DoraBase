# Plan d'implémentation — 06g Proxy Cloud SQL

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** faire passer une connexion PostgreSQL par le Cloud SQL Auth Proxy, lancé en
sous-processus, surveillé, et tué sans laisser d'orphelin.

**Architecture :** un module `engine/cloudsql/` frère de `engine/tunnel/`, derrière la même
interface étroite. Ce qui est commun aux deux sortes de proxy — le choix du port local, l'état
partagé « vivant / tombé », la qualification d'une erreur de base — est **extrait** en
`engine/port.rs` et `engine/proxy.rs` plutôt que dupliqué. `PostgresAdapter` gagne un unique
champ `ProxyOuvert` et un unique `match`.

**Stack :** Rust · `tokio::process` · faux binaire en shell pour les tests · une vraie
instance Cloud SQL pour le chemin heureux, conditionnée par variable d'environnement

**Spec :** `specs/06g-proxy-cloud-sql.md` · **Dépend de :** `05d` fait et commité

---

## Ce qu'il faut savoir avant de commencer

**Le risque est dans le pilotage du processus, pas dans Cloud SQL.** L'essentiel des tests
passe par un **faux binaire** : un script shell qui imite la sortie du vrai proxy. C'est lui
qui couvre la mort prématurée, le port annoncé, et la tuerie — sans réseau, sans compte GCP,
et en CI.

**Trois lignes de la sortie du vrai proxy** servent de contrat. Relevées sur
`cloud-sql-proxy` v2 :

```
2026/08/19 10:00:00 Authorizing with Application Default Credentials
2026/08/19 10:00:00 [acme:europe-west1:analytics] Listening on 127.0.0.1:63342
2026/08/19 10:00:00 The proxy has started successfully and is ready for new connections!
```

**Vider le tuyau n'est pas une option.** Si personne ne lit la sortie d'erreur du processus,
le tampon du système se remplit et le proxy **se bloque en écriture**. Une tâche de drain
tourne donc pour toute la vie du proxy, et garde les dernières lignes pour les messages
d'erreur.

**`tokio` n'a pas les features nécessaires.** `process` et `time` sont à ajouter — tâche 1.

---

## Structure de fichiers

| Fichier | Responsabilité | Action |
| --- | --- | --- |
| `src-tauri/Cargo.toml` | features `process` et `time` de tokio | modifier |
| `src-tauri/src/engine/port.rs` | choix du port local, pour les **deux** sortes | créer (déplacement) |
| `src-tauri/src/engine/tunnel/port.rs` | — | supprimer |
| `src-tauri/src/engine/proxy.rs` | `EtatProxy`, `Surveillance`, `qualifier_avec`, `ProxyOuvert` | créer |
| `src-tauri/src/engine/tunnel/mod.rs` | emploie les types extraits | modifier |
| `src-tauri/src/engine/cloudsql/mod.rs` | `CloudSqlProxy` : ouvrir, état, fermer | créer |
| `src-tauri/src/engine/cloudsql/binaire.rs` | trouver `cloud-sql-proxy`, ou le dire | créer |
| `src-tauri/src/engine/cloudsql/sortie.rs` | lire les lignes du proxy | créer |
| `src-tauri/src/engine/cloudsql/journal.rs` | les dernières lignes, pour les erreurs | créer |
| `src-tauri/src/engine/mod.rs` | déclarations de modules | modifier |
| `src-tauri/src/engine/postgres/mod.rs` | un champ, un `match` | modifier |

---

## Tâche 1 : les dépendances, et le port local partagé

**Fichiers :** modifier `src-tauri/Cargo.toml`, `src-tauri/src/engine/mod.rs` ; créer
`src-tauri/src/engine/port.rs` par déplacement de `src-tauri/src/engine/tunnel/port.rs`

- [ ] **Étape 1 : ajouter les features de tokio**

Dans `src-tauri/Cargo.toml`, remplacer la ligne `tokio` par :

```toml
# `process` pour le sous-processus du proxy Cloud SQL (`06g`), `time` pour borner
# l'attente de son démarrage — sans délai, un proxy muet pendrait indéfiniment.
tokio = { version = "1", features = ["io-util", "macros", "net", "process", "rt", "rt-multi-thread", "time"] }
```

Commande : `cargo check --manifest-path src-tauri/Cargo.toml`

Attendu : PASS, avec téléchargement éventuel de crates.

- [ ] **Étape 2 : déplacer `port.rs` d'un cran**

```bash
git mv src-tauri/src/engine/tunnel/port.rs src-tauri/src/engine/port.rs
```

Dans `src-tauri/src/engine/tunnel/mod.rs` : supprimer `mod port;` et remplacer les appels
`port::ouvrir_ecouteur(…)` par `crate::engine::port::ouvrir_ecouteur(…)`.

Dans `src-tauri/src/engine/mod.rs`, ajouter à côté de `pub mod tunnel;` :

```rust
/// Le choix du port local, commun au tunnel SSH (`06e`) et au proxy Cloud SQL (`06g`).
///
/// **Remonté d'un cran depuis `tunnel/`** en `06g` : les deux sortes de proxy en ont besoin,
/// et laisser le module sous `tunnel/` aurait fait dépendre `cloudsql` de `tunnel` — une
/// dépendance qui ne dit rien de vrai sur le domaine.
pub mod port;
```

Commande : `cargo test --manifest-path src-tauri/Cargo.toml engine::port`

Attendu : PASS — les six tests de `06e` sur le port, inchangés. C'est ce qui prouve que le
déplacement n'a rien cassé.

- [ ] **Étape 3 : écrire le test du choix de port sans écouteur**

Dans le `mod tests` de `src-tauri/src/engine/port.rs` :

```rust
    #[tokio::test]
    async fn un_port_libre_peut_etre_choisi_sans_etre_garde() {
        // Le proxy Cloud SQL est un **sous-processus** : il se lie lui-même, et ne peut pas
        // hériter de notre écouteur. Il faut donc un port qu'on relâche.
        let port = choisir_port_libre(None).await.expect("choix");
        assert_ne!(port, 0);
        // Relâché, donc immédiatement liable — c'est précisément ce que la fonction promet,
        // et ce qui la distingue d'`ouvrir_ecouteur`.
        let (_ecouteur, obtenu) = ouvrir_ecouteur(Some(port)).await.expect("liaison");
        assert_eq!(obtenu, port);
    }

    #[tokio::test]
    async fn un_port_explicite_deja_pris_est_refuse_avec_son_numero_aussi_pour_le_proxy() {
        let (_occupant, port) = ouvrir_ecouteur(None).await.expect("occupation");
        let erreur = choisir_port_libre(Some(port))
            .await
            .expect_err("un port occupé doit être refusé");
        assert!(erreur.message.contains(&port.to_string()), "{erreur}");
    }
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils échouent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml engine::port`

Attendu : ÉCHEC — `cannot find function choisir_port_libre`.

- [ ] **Étape 5 : écrire `choisir_port_libre`**

Ajouter à `src-tauri/src/engine/port.rs`, après `ouvrir_ecouteur` :

```rust
/// Choisit un port local libre et le **relâche** aussitôt.
///
/// **Pourquoi cette fonction existe à côté d'`ouvrir_ecouteur`, qui est meilleure.**
/// `ouvrir_ecouteur` n'a aucune fenêtre de course : elle se lie au port 0 et lit le port
/// attribué sur l'écouteur qu'elle garde. Ce chemin est fermé pour `06g` — c'est le
/// sous-processus `cloud-sql-proxy` qui se lie, et il ne peut pas hériter de notre
/// `TcpListener`. Il faut donc choisir, relâcher, puis passer le numéro en `--port`.
///
/// La fenêtre de course est réelle et **assumée**, parce que sa conséquence est bornée : le
/// port rendu à l'appelant est celui que le proxy **annonce** dans sa sortie, pas celui
/// qu'on lui a demandé. Si un autre programme a pris le port entre-temps, le proxy échoue et
/// le dit ; il ne peut pas se lier ailleurs à notre insu. Au pire un échec explicite,
/// jamais une connexion vers le mauvais port.
pub async fn choisir_port_libre(port_demande: Option<u16>) -> Result<u16, EngineError> {
    let (ecouteur, port) = ouvrir_ecouteur(port_demande).await?;
    // Explicite, et non laissé à la fin de portée : c'est le relâchement qui est le
    // comportement de cette fonction, pas un effet de bord.
    drop(ecouteur);
    Ok(port)
}
```

- [ ] **Étape 6 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml engine::port`

Attendu : PASS, huit tests.

- [ ] **Étape 7 : commiter**

```bash
git add src-tauri/Cargo.toml src-tauri/src/engine/port.rs \
        src-tauri/src/engine/mod.rs src-tauri/src/engine/tunnel/mod.rs
git commit -m "refactor(engine): 06f — le choix du port local remonte d'un cran

Les deux sortes de proxy en ont besoin. Laisser le module sous \`tunnel/\`
aurait fait dépendre \`cloudsql\` de \`tunnel\`, une dépendance qui ne dit rien
de vrai sur le domaine.

\`choisir_port_libre\` s'ajoute à côté d'\`ouvrir_ecouteur\`, qui reste
meilleure : un sous-processus ne peut pas hériter de notre TcpListener, donc il
faut choisir puis relâcher. La fenêtre de course revient, et sa conséquence est
bornée par la règle de 06f — le port rendu est celui que le proxy annonce.

tokio gagne les features \`process\` et \`time\`."
```

---

## Tâche 2 : extraire l'état partagé « vivant / tombé »

**Fichiers :** créer `src-tauri/src/engine/proxy.rs` ; modifier
`src-tauri/src/engine/tunnel/mod.rs`, `src-tauri/src/engine/mod.rs`,
`src-tauri/src/engine/postgres/mod.rs`

Refactor sans changement de comportement : les tests de `06e` doivent rester verts **sans être
modifiés**, hors renommage de type.

- [ ] **Étape 1 : créer `engine/proxy.rs` avec les types extraits**

```rust
//! Ce qui est commun aux deux sortes de proxy. Voir `specs/06f` § « Un aiguillage unique ».
//!
//! **Extrait de `tunnel/mod.rs` par `06g`.** `06e` avait déjà nommé `Surveillance` pour la
//! rendre testable (voir `REPRISE.md` § 6) ; `06g` a le même besoin, avec une mécanique de
//! détection différente — la sortie d'un processus au lieu de la chute d'une session SSH.
//! Le patron est partagé, l'implémentation non.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use crate::engine::EngineError;

/// L'état d'un proxy ouvert.
///
/// **Pourquoi ce type existe** : `06e` insiste, et le handoff avec lui (`A3` affiche
/// « tunnel aborted · pg connect skipped » sur deux lignes distinctes). Si le bastion tombe
/// — ou si le proxy Cloud SQL meurt —, la connexion PostgreSQL échoue avec une erreur
/// réseau qui ne dit rien du proxy, et l'utilisateur cherche un problème de base là où le
/// proxy est en cause.
///
/// Nommé `EtatProxy` et non `EtatTunnel` depuis `06g` : il décrit désormais les deux sortes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EtatProxy {
    Vivant,
    /// Le proxy est tombé. La raison est destinée à l'affichage.
    Tombe {
        raison: String,
    },
}

/// La santé d'un proxy, partagée entre lui et la tâche qui le surveille.
///
/// **Type nommé pour être testable.** La première version de `06e` gardait le drapeau et la
/// raison en champs de `SshTunnel`, et le test reconstituait la lecture d'`etat()` dans une
/// fonction d'appoint — il testait donc une copie de la logique, pas la logique.
#[derive(Debug, Default)]
pub struct Surveillance {
    tombe: AtomicBool,
    raison: Mutex<Option<String>>,
}

impl Surveillance {
    pub fn noter_chute(&self, cause: String) {
        if let Ok(mut g) = self.raison.lock() {
            *g = Some(cause);
        }
        // Posé **après** la raison : `etat` lit le drapeau d'abord, donc l'inverse laisserait
        // une fenêtre où le proxy est signalé tombé sans raison disponible.
        self.tombe.store(true, Ordering::Relaxed);
    }

    pub fn etat(&self, defaut: &str) -> EtatProxy {
        if self.tombe.load(Ordering::Relaxed) {
            EtatProxy::Tombe {
                raison: self
                    .raison
                    .lock()
                    .ok()
                    .and_then(|g| g.clone())
                    .unwrap_or_else(|| defaut.to_owned()),
            }
        } else {
            EtatProxy::Vivant
        }
    }
}

/// Qualifie une erreur de connexion à la base selon l'état du proxy.
///
/// C'est **le** point de `06e` § « Une chute de tunnel n'est pas une erreur de base » :
/// sans ça, le bastion tombé produit un « connection refused » sur `127.0.0.1`, qui envoie
/// chercher un problème de PostgreSQL.
///
/// `sujet` nomme le proxy — « le tunnel SSH », « le proxy Cloud SQL ». Un message
/// générique obligerait l'utilisateur à deviner lequel des deux est en cause, ce qui est
/// exactement le défaut que cette fonction corrige.
///
/// En fonction libre pour être testable sans proxy réel : construire l'un ou l'autre exige
/// un bastion ou un compte GCP, et garder cette logique en méthode obligerait à la recopier
/// dans le test.
pub fn qualifier_avec(etat: EtatProxy, sujet: &str, erreur: EngineError) -> EngineError {
    match etat {
        EtatProxy::Vivant => erreur,
        EtatProxy::Tombe { raison } => EngineError::local(format!(
            "{sujet} est tombé ({raison}) — la connexion à la base n'a pas pu être tentée. \
             L'erreur observée était : {}",
            erreur.message
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_proxy_vivant_laisse_l_erreur_intacte() {
        let erreur = EngineError::local("connection refused");
        let qualifiee = qualifier_avec(EtatProxy::Vivant, "le tunnel SSH", erreur.clone());
        assert_eq!(qualifiee, erreur);
    }

    #[test]
    fn un_proxy_tombe_nomme_le_proxy_et_garde_l_erreur_observee() {
        let qualifiee = qualifier_avec(
            EtatProxy::Tombe {
                raison: "le processus s'est arrêté".into(),
            },
            "le proxy Cloud SQL",
            EngineError::local("connection refused"),
        );
        // Les deux moitiés comptent : nommer le proxy, **et** garder ce qui a été observé.
        // Perdre la seconde priverait d'un diagnostic quand la raison est vague.
        assert!(qualifiee.message.contains("le proxy Cloud SQL"), "{qualifiee}");
        assert!(qualifiee.message.contains("connection refused"), "{qualifiee}");
    }

    #[test]
    fn la_raison_est_lisible_des_qu_une_chute_est_notee() {
        let sante = Surveillance::default();
        assert_eq!(sante.etat("défaut"), EtatProxy::Vivant);
        sante.noter_chute("bastion injoignable".into());
        assert_eq!(
            sante.etat("défaut"),
            EtatProxy::Tombe {
                raison: "bastion injoignable".into()
            }
        );
    }

    #[test]
    fn une_chute_sans_raison_retombe_sur_le_defaut() {
        // Le drapeau est posé après la raison, donc ce cas ne devrait pas survenir. Le
        // couvrir quand même : un `unwrap` ici rendrait une fenêtre théorique fatale.
        let sante = Surveillance::default();
        sante.noter_chute(String::new());
        assert!(matches!(sante.etat("défaut"), EtatProxy::Tombe { .. }));
    }
}
```

- [ ] **Étape 2 : déclarer le module**

Dans `src-tauri/src/engine/mod.rs` :

```rust
pub mod proxy;
```

- [ ] **Étape 3 : faire employer les types extraits par `tunnel/mod.rs`**

- supprimer `enum EtatTunnel`, `struct Surveillance`, `impl Surveillance` et
  `fn qualifier_avec` de `engine/tunnel/mod.rs` ;
- importer : `use crate::engine::proxy::{qualifier_avec, EtatProxy, Surveillance};` ;
- `SshTunnel::etat` devient :

```rust
    pub fn etat(&self) -> EtatProxy {
        self.sante.etat("la session SSH est perdue")
    }
```

- `SshTunnel::qualifier` devient :

```rust
    pub fn qualifier(&self, erreur: EngineError) -> EngineError {
        qualifier_avec(self.etat(), "le tunnel SSH", erreur)
    }
```

- [ ] **Étape 4 : propager le renommage**

Commande : `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c EtatTunnel`

Remplacer chaque `EtatTunnel` restant par `EtatProxy` — dans `engine/postgres/mod.rs`
(signature de `etat_tunnel`, et deux assertions de test).

**Ce qui ne change pas de nom :** `PostgresAdapter::etat_tunnel`,
`PostgresAdapter::port_local_tunnel`, et le champ IPC `tunnelLocalPort`. Les renommer
toucherait `engine/commands.rs`, `registry.rs`, la projection TypeScript et
`src/data/commandes.test.ts`, pour un gain nul : le panneau de `A2` s'appelle « Proxy /
tunnel », et « Port local mappé » est son étiquette. Seul le **type** de l'état change de
nom, parce que lui décrit désormais deux choses.

- [ ] **Étape 5 : vérifier que rien n'a régressé**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml`

Attendu : PASS, avec quatre tests de plus (ceux de `proxy.rs`). Les tests de `06e` sur la
qualification doivent passer **sans avoir changé de contenu** — s'il faut les réécrire, le
refactor a changé un comportement.

- [ ] **Étape 6 : commiter**

```bash
git add src-tauri/src/engine/
git commit -m "refactor(engine): 06f — l'état « vivant / tombé » extrait en engine/proxy.rs

\`EtatTunnel\` devient \`EtatProxy\` : il décrit désormais les deux sortes. Le
patron nommé par 06e pour être testable (REPRISE.md § 6) est partagé ;
l'implémentation de la détection ne l'est pas — chute d'une session SSH d'un
côté, sortie d'un processus de l'autre.

\`qualifier_avec\` prend le sujet en paramètre : un message générique
obligerait l'utilisateur à deviner lequel des deux proxys est en cause, ce qui
est exactement le défaut que cette fonction corrige.

Ce qui garde son nom : \`etat_tunnel\`, \`port_local_tunnel\` et le champ IPC
\`tunnelLocalPort\`. Le panneau de A2 s'appelle « Proxy / tunnel »."
```

---

## Tâche 3 : trouver le binaire, ou dire comment l'installer

**Fichiers :** créer `src-tauri/src/engine/cloudsql/binaire.rs`,
`src-tauri/src/engine/cloudsql/mod.rs` (squelette) ; modifier
`src-tauri/src/engine/mod.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `src-tauri/src/engine/cloudsql/binaire.rs` avec **seulement** son `mod tests` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Un répertoire contenant un exécutable factice du nom donné.
    #[cfg(unix)]
    fn repertoire_avec_executable(nom: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!("dorabase-binaire-{nom}-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join(nom);
        std::fs::write(&chemin, "#!/bin/sh\nexit 0\n").expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");
        base
    }

    #[test]
    #[cfg(unix)]
    fn le_binaire_est_trouve_dans_les_repertoires_donnes() {
        let repertoire = repertoire_avec_executable("cloud-sql-proxy");
        let trouve = localiser_dans(&[repertoire.clone()]).expect("le binaire doit être trouvé");
        assert_eq!(trouve, repertoire.join("cloud-sql-proxy"));
    }

    #[test]
    fn un_binaire_absent_dit_comment_l_installer() {
        let erreur = localiser_dans(&[std::path::PathBuf::from("/nulle-part-du-tout")])
            .expect_err("un binaire absent doit être une erreur");
        // `06g` § Terminé quand : l'erreur **nomme ce qu'il faut faire**, plutôt que de
        // rendre le « No such file or directory » du système. C'est la même exigence que
        // `06e` applique à un hôte inconnu de `known_hosts`.
        assert!(erreur.message.contains("cloud-sql-proxy"), "{erreur}");
        assert!(erreur.message.contains("install"), "{erreur}");
    }

    #[test]
    #[cfg(unix)]
    fn un_fichier_non_executable_n_est_pas_le_binaire() {
        // Un fichier du bon nom mais sans droit d'exécution donnerait un « Permission
        // denied » au lancement — moins clair que « pas trouvé, voilà comment l'installer ».
        let base = std::env::temp_dir().join(format!("dorabase-non-exec-{}", std::process::id()));
        std::fs::create_dir_all(&base).expect("répertoire");
        std::fs::write(base.join("cloud-sql-proxy"), "pas un programme").expect("écriture");

        assert!(localiser_dans(&[base]).is_err());
    }

    #[test]
    fn les_emplacements_par_defaut_incluent_homebrew() {
        // Le PATH d'une application lancée depuis le Finder ne contient **pas** celui du
        // shell de l'utilisateur : sur macOS, une app graphique hérite d'un PATH minimal.
        // Chercher dans les emplacements de Homebrew n'est donc pas un raffinement, c'est
        // le cas normal pour une app packagée.
        let emplacements = emplacements_par_defaut();
        let en_texte: Vec<String> = emplacements
            .iter()
            .map(|c| c.display().to_string())
            .collect();
        assert!(en_texte.iter().any(|c| c == "/opt/homebrew/bin"), "{en_texte:?}");
        assert!(en_texte.iter().any(|c| c == "/usr/local/bin"), "{en_texte:?}");
    }
}
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Créer d'abord `src-tauri/src/engine/cloudsql/mod.rs` avec `pub mod binaire;` et ajouter
`pub mod cloudsql;` dans `src-tauri/src/engine/mod.rs`.

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::binaire`

Attendu : ÉCHEC — `cannot find function localiser_dans`.

- [ ] **Étape 3 : écrire `binaire.rs`**

En tête du fichier, avant le `mod tests` :

```rust
//! Trouver le binaire `cloud-sql-proxy`. Voir `specs/06f` § « Trouver le binaire ».

use std::path::{Path, PathBuf};

use crate::engine::EngineError;

/// Le nom du binaire officiel, tel que Google le distribue.
const NOM: &str = "cloud-sql-proxy";

/// Les répertoires fouillés, dans l'ordre : le `PATH` d'abord, puis les emplacements usuels.
///
/// **Pourquoi ne pas se contenter du `PATH`.** Une application lancée depuis le Finder
/// n'hérite pas du `PATH` du shell de l'utilisateur : macOS lui en donne un minimal, qui ne
/// contient ni `/opt/homebrew/bin` ni `/usr/local/bin`. Un binaire parfaitement installé
/// serait donc introuvable dans l'app packagée alors qu'il se trouve depuis un terminal —
/// panne d'autant plus déroutante que `which cloud-sql-proxy` répond.
pub fn emplacements_par_defaut() -> Vec<PathBuf> {
    let mut emplacements: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();

    for usuel in ["/opt/homebrew/bin", "/usr/local/bin"] {
        let chemin = PathBuf::from(usuel);
        if !emplacements.contains(&chemin) {
            emplacements.push(chemin);
        }
    }

    emplacements
}

/// Trouve le binaire, ou rend une erreur qui **dit quoi faire**.
pub fn localiser() -> Result<PathBuf, EngineError> {
    localiser_dans(&emplacements_par_defaut())
}

/// La même chose, avec les répertoires en paramètre.
///
/// Séparée pour la même raison que `connect_via` l'est de `connect` en `06b` : un test n'a
/// pas le droit de dépendre de ce qui est installé sur la machine qui l'exécute.
pub fn localiser_dans(emplacements: &[PathBuf]) -> Result<PathBuf, EngineError> {
    for repertoire in emplacements {
        let candidat = repertoire.join(NOM);
        if est_executable(&candidat) {
            return Ok(candidat);
        }
    }

    Err(EngineError::local(format!(
        "le binaire « {NOM} » est introuvable — installez-le avec « brew install \
         {NOM} », ou depuis https://cloud.google.com/sql/docs/mysql/sql-proxy, puis \
         réessayez"
    )))
}

/// Un fichier utilisable comme programme.
///
/// Le droit d'exécution est vérifié, et pas seulement la présence : un fichier du bon nom
/// sans ce droit donnerait un « Permission denied » au lancement, moins clair que
/// « introuvable, voilà comment l'installer ».
fn est_executable(chemin: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(chemin)
            .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        chemin.is_file()
    }
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::binaire`

Attendu : PASS, quatre tests.

- [ ] **Étape 5 : commiter**

```bash
git add src-tauri/src/engine/mod.rs src-tauri/src/engine/cloudsql/
git commit -m "feat(engine): 06f — trouver le binaire cloud-sql-proxy, ou dire comment l'installer

Le PATH ne suffit pas : une app lancée depuis le Finder n'hérite pas du PATH du
shell, donc /opt/homebrew/bin et /usr/local/bin sont fouillés en plus. Un
binaire installé serait autrement introuvable dans l'app packagée alors que
\`which\` répond depuis un terminal.

Le droit d'exécution est vérifié, pas seulement la présence : « Permission
denied » au lancement serait moins clair qu'« introuvable, voilà comment
l'installer »."
```

---

## Tâche 4 : lire les lignes du proxy

**Fichiers :** créer `src-tauri/src/engine/cloudsql/sortie.rs`,
`src-tauri/src/engine/cloudsql/journal.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `src-tauri/src/engine/cloudsql/sortie.rs` avec son `mod tests` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Les lignes réellement écrites par `cloud-sql-proxy` v2, relevées le 19 août 2026.
    ///
    /// **Recopiées littéralement**, parce que c'est le contrat : un test écrit à partir de
    /// ce que le code attend, plutôt que de ce que le proxy émet, se vérifierait lui-même.
    const REELLES: [&str; 3] = [
        "2026/08/19 10:00:00 Authorizing with Application Default Credentials",
        "2026/08/19 10:00:00 [acme:europe-west1:analytics] Listening on 127.0.0.1:63342",
        "2026/08/19 10:00:00 The proxy has started successfully and is ready for new connections!",
    ];

    #[test]
    fn le_port_annonce_est_lu_sur_la_ligne_d_ecoute() {
        assert_eq!(port_annonce(REELLES[1]), Some(63342));
    }

    #[test]
    fn la_ligne_de_disponibilite_est_reconnue() {
        assert!(est_pret(REELLES[2]));
        assert!(!est_pret(REELLES[0]));
        assert!(!est_pret(REELLES[1]));
    }

    #[test]
    fn une_ligne_sans_port_ne_donne_pas_de_port() {
        assert_eq!(port_annonce(REELLES[0]), None);
        assert_eq!(port_annonce(""), None);
        // Une adresse sans numéro lisible ne doit pas produire un port par défaut : mieux
        // vaut ne rien savoir que croire savoir.
        assert_eq!(port_annonce("Listening on 127.0.0.1:pas-un-port"), None);
    }

    #[test]
    fn une_ecoute_sur_ipv6_est_lue_aussi() {
        // Non observée sur cette machine, mais le proxy accepte `--address ::1`. Lire le
        // port après le **dernier** deux-points, et non le premier, est ce qui rend la
        // fonction juste dans les deux cas.
        assert_eq!(port_annonce("Listening on [::1]:63342"), Some(63342));
    }
}
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Ajouter `pub mod journal;` et `pub mod sortie;` dans `cloudsql/mod.rs`.

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::sortie`

Attendu : ÉCHEC — `cannot find function port_annonce`.

- [ ] **Étape 3 : écrire `sortie.rs`**

```rust
//! Lecture des lignes écrites par `cloud-sql-proxy`. Voir `specs/06f` § « Attendre
//! “ready for new connections” ».
//!
//! **Deux fonctions et rien de plus.** Le format des journaux du proxy n'est pas un contrat
//! stable de Google, et ces deux repères sont les seuls dont on dépende. Les isoler ici
//! rend visible ce qui casserait si le format changeait, et limite la réparation à un
//! fichier.

/// Le port sur lequel le proxy annonce écouter.
///
/// **C'est ce port qui fait foi**, et non celui passé en `--port` : voir `specs/06f`
/// § « Le port local ne peut pas réemployer celui de `06e` ».
pub fn port_annonce(ligne: &str) -> Option<u16> {
    let apres = ligne.split("Listening on ").nth(1)?;
    // Le **dernier** deux-points, et non le premier : une adresse IPv6 en contient
    // plusieurs (`[::1]:63342`).
    let numero = apres.trim().rsplit(':').next()?;
    numero.parse().ok()
}

/// La ligne par laquelle le proxy déclare accepter les connexions.
///
/// Comparaison sur un fragment et non sur la ligne entière : l'horodatage la préfixe, et le
/// texte exact a déjà changé entre versions majeures du proxy.
pub fn est_pret(ligne: &str) -> bool {
    ligne.contains("ready for new connections")
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::sortie`

Attendu : PASS, quatre tests.

- [ ] **Étape 5 : écrire le journal des dernières lignes, en rouge d'abord**

Dans `src-tauri/src/engine/cloudsql/journal.rs`, le `mod tests` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_journal_garde_les_dernieres_lignes_et_oublie_les_premieres() {
        let journal = Journal::default();
        for index in 0..(CAPACITE + 5) {
            journal.noter(format!("ligne {index}"));
        }

        let texte = journal.dernieres();
        // Borné **délibérément** : un proxy bavard laissé une heure remplirait la mémoire,
        // et seules les dernières lignes disent quelque chose d'un échec.
        assert!(!texte.contains("ligne 0"), "{texte}");
        assert!(texte.contains(&format!("ligne {}", CAPACITE + 4)), "{texte}");
    }

    #[test]
    fn un_journal_vide_le_dit_plutot_que_de_rendre_une_chaine_vide() {
        // Un message d'erreur finissant par « : » sans rien après se lit comme un bogue.
        let texte = Journal::default().dernieres();
        assert!(!texte.is_empty());
    }
}
```

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::journal`

Attendu : ÉCHEC — `cannot find type Journal`.

- [ ] **Étape 6 : écrire `journal.rs`**

```rust
//! Les dernières lignes écrites par le proxy, pour les messages d'erreur.
//!
//! **Pourquoi garder quoi que ce soit.** Si le processus meurt, ce qu'il a écrit est le seul
//! diagnostic disponible — une instance mal nommée, un compte sans droit et une API
//! désactivée donnent chacun un message précis. Sans ce tampon, il est perdu et l'erreur
//! remontée se réduit à « le proxy s'est arrêté ».

use std::collections::VecDeque;
use std::sync::Mutex;

/// Le nombre de lignes gardées. Assez pour porter un message d'échec du proxy, qui en
/// écrit deux ou trois ; borné parce qu'un proxy vivant écrit indéfiniment.
pub const CAPACITE: usize = 20;

#[derive(Debug, Default)]
pub struct Journal {
    lignes: Mutex<VecDeque<String>>,
}

impl Journal {
    pub fn noter(&self, ligne: String) {
        if let Ok(mut lignes) = self.lignes.lock() {
            if lignes.len() == CAPACITE {
                lignes.pop_front();
            }
            lignes.push_back(ligne);
        }
    }

    /// Les dernières lignes, en un bloc lisible dans un message d'erreur.
    pub fn dernieres(&self) -> String {
        let Ok(lignes) = self.lignes.lock() else {
            return "journal du proxy illisible".to_owned();
        };
        if lignes.is_empty() {
            // Explicite : un message finissant par « : » sans rien après se lit comme un
            // bogue de l'application, pas comme un silence du proxy.
            return "le proxy n'a rien écrit".to_owned();
        }
        lignes
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join(" / ")
    }
}
```

- [ ] **Étape 7 : lancer les tests et commiter**

```bash
cargo test --manifest-path src-tauri/Cargo.toml cloudsql
git add src-tauri/src/engine/cloudsql/
git commit -m "feat(engine): 06f — lire la sortie du proxy, et en garder les dernières lignes

Deux repères seulement — « Listening on … » et « ready for new connections » —
isolés dans un fichier : le format des journaux du proxy n'est pas un contrat
stable de Google, et limiter la dépendance rend visible ce qui casserait.

Le port est lu après le **dernier** deux-points, ce qui rend la lecture juste
en IPv6 aussi.

Le journal est borné à 20 lignes : si le processus meurt, ce qu'il a écrit est
le seul diagnostic disponible, et un proxy vivant écrit indéfiniment."
```

---

## Tâche 5 : ouvrir, surveiller, fermer — le cœur du scope

**Fichiers :** modifier `src-tauri/src/engine/cloudsql/mod.rs`

- [ ] **Étape 1 : écrire les tests qui échouent, avec un faux binaire**

Dans `cloudsql/mod.rs`, le `mod tests` :

```rust
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    /// Écrit un faux `cloud-sql-proxy` et rend son chemin.
    ///
    /// **C'est l'outil central de ce scope.** Le risque n'est pas dans Cloud SQL mais dans le
    /// pilotage d'un sous-processus : attendre le bon moment, ne pas confondre « pas encore
    /// prêt » et « mort », tuer sans laisser d'orphelin. Un script shell exerce tout cela
    /// sans réseau, sans compte GCP, et en CI.
    fn faux_binaire(nom: &str, corps: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;

        let base = std::env::temp_dir().join(format!(
            "dorabase-cloudsql-{nom}-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&base).expect("répertoire");
        let chemin = base.join("cloud-sql-proxy");
        std::fs::write(&chemin, corps).expect("écriture");
        std::fs::set_permissions(&chemin, std::fs::Permissions::from_mode(0o755)).expect("droits");
        chemin
    }

    /// Un proxy qui démarre, annonce le port reçu, et vit jusqu'à ce qu'on le tue.
    /// Ordre des arguments passés par `ouvrir_avec` : instance, `--port`, port, …
    const HEUREUX: &str = r#"#!/bin/sh
echo "Authorizing with Application Default Credentials" >&2
echo "[$1] Listening on 127.0.0.1:$3" >&2
echo "The proxy has started successfully and is ready for new connections!" >&2
while true; do sleep 1; done
"#;

    fn configuration() -> ProxyCloudSql {
        ProxyCloudSql {
            instance_connection_name: "acme:europe-west1:analytics".into(),
            credentials_file_path: None,
        }
    }

    #[tokio::test]
    async fn un_proxy_qui_annonce_son_port_est_pret_et_rend_ce_port() {
        let binaire = faux_binaire("heureux", HEUREUX);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("le proxy doit s'ouvrir");

        assert_ne!(proxy.port_local(), 0);
        assert_eq!(proxy.etat(), EtatProxy::Vivant);
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn le_port_rendu_est_celui_annonce_et_non_celui_demande() {
        // **Le critère de `06g`.** Le proxy se lie lui-même ; ce qu'il annonce fait foi.
        // Croire au port demandé produirait une connexion vers le vide le jour où il en
        // choisit un autre.
        let menteur = faux_binaire(
            "menteur",
            r#"#!/bin/sh
echo "Listening on 127.0.0.1:65000" >&2
echo "ready for new connections" >&2
while true; do sleep 1; done
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&menteur, &configuration(), None)
            .await
            .expect("ouverture");
        assert_eq!(proxy.port_local(), 65000);
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn un_proxy_qui_meurt_avant_d_etre_pret_remonte_son_propre_message() {
        let mourant = faux_binaire(
            "mourant",
            r#"#!/bin/sh
echo "failed to connect to instance: instance does not exist" >&2
exit 1
"#,
        );
        let erreur = CloudSqlProxy::ouvrir_avec(&mourant, &configuration(), None)
            .await
            .expect_err("un proxy mort ne doit pas passer pour ouvert");

        // Ce que le proxy a dit, **pas** « délai dépassé ». Une instance mal nommée, un
        // compte sans droit et une API désactivée donnent chacun un message précis, et
        // l'écraser rendrait le diagnostic impossible.
        assert!(erreur.message.contains("instance does not exist"), "{erreur}");
        assert!(!erreur.message.contains("délai"), "{erreur}");
    }

    #[tokio::test]
    async fn un_proxy_muet_echoue_sur_le_delai_sans_pendre() {
        let muet = faux_binaire(
            "muet",
            r#"#!/bin/sh
while true; do sleep 1; done
"#,
        );
        let erreur = CloudSqlProxy::ouvrir_avec_delai(
            &muet,
            &configuration(),
            None,
            std::time::Duration::from_millis(300),
        )
        .await
        .expect_err("un proxy qui n'annonce rien doit échouer");

        assert!(erreur.message.contains("délai"), "{erreur}");
        // Et il ne doit pas rester en vie : un proxy abandonné garderait le port.
        assert!(erreur.message.contains("cloud-sql-proxy"), "{erreur}");
    }

    #[tokio::test]
    async fn fermer_tue_le_processus_et_libere_le_port() {
        let binaire = faux_binaire("fermeture", HEUREUX);
        let proxy = CloudSqlProxy::ouvrir_avec(&binaire, &configuration(), None)
            .await
            .expect("ouverture");
        let pid = proxy.identifiant().expect("le pid doit être connu");

        proxy.fermer().await;

        // **Vérifié par le pid, pas par le port.** Un proxy orphelin est le pire défaut
        // possible ici : il garde le port, et la connexion suivante croirait parler à sa
        // propre instance en parlant à celle d'avant.
        let vivant = std::process::Command::new("ps")
            .args(["-p", &pid.to_string()])
            .status()
            .expect("ps");
        assert!(!vivant.success(), "le processus {pid} est encore vivant");
    }

    #[tokio::test]
    async fn un_proxy_mort_apres_l_ouverture_est_signale_comme_tel() {
        // `A3` affiche deux lignes distinctes : la chute du proxy et l'échec de connexion.
        // Sans cette distinction, l'utilisateur cherche un problème de base.
        let bref = faux_binaire(
            "bref",
            r#"#!/bin/sh
echo "Listening on 127.0.0.1:65001" >&2
echo "ready for new connections" >&2
sleep 0.1
echo "the proxy has encountered a terminal error" >&2
exit 2
"#,
        );
        let proxy = CloudSqlProxy::ouvrir_avec(&bref, &configuration(), None)
            .await
            .expect("ouverture");

        // Laisser le processus mourir. Attente courte et bornée, pas de boucle infinie.
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        assert!(matches!(proxy.etat(), EtatProxy::Tombe { .. }), "{:?}", proxy.etat());
        let qualifiee = proxy.qualifier(EngineError::local("connection refused"));
        assert!(qualifiee.message.contains("le proxy Cloud SQL"), "{qualifiee}");
        proxy.fermer().await;
    }

    #[tokio::test]
    async fn le_fichier_de_compte_de_service_est_passe_quand_il_est_donne() {
        // Et **seulement** quand il est donné : `--credentials-file` avec une chaîne vide
        // ferait échouer le proxy là où l'absence d'option signifie « identifiants par
        // défaut de l'application », le cas courant.
        let mouchard = faux_binaire(
            "mouchard",
            r#"#!/bin/sh
echo "args: $*" >&2
echo "Listening on 127.0.0.1:65002" >&2
echo "ready for new connections" >&2
while true; do sleep 1; done
"#,
        );

        let mut config = configuration();
        config.credentials_file_path = Some("/tmp/sa.json".into());
        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &config, None)
            .await
            .expect("ouverture");
        assert!(proxy.journal().contains("--credentials-file"), "{}", proxy.journal());
        assert!(proxy.journal().contains("/tmp/sa.json"), "{}", proxy.journal());
        proxy.fermer().await;

        let proxy = CloudSqlProxy::ouvrir_avec(&mouchard, &configuration(), None)
            .await
            .expect("ouverture sans fichier");
        assert!(!proxy.journal().contains("--credentials-file"), "{}", proxy.journal());
        proxy.fermer().await;
    }
}
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql::tests`

Attendu : ÉCHEC — `cannot find type CloudSqlProxy`.

- [ ] **Étape 3 : écrire `CloudSqlProxy`**

En tête de `cloudsql/mod.rs`, avant le `mod tests` :

```rust
//! Le Cloud SQL Auth Proxy, lancé en sous-processus. Voir `specs/06g-proxy-cloud-sql.md`.
//!
//! **Interface étroite, comme `tunnel/`.** Le reste du code ne connaît que `ouvrir`,
//! `port_local`, `etat`, `qualifier` et `fermer` — jamais un `Child`. C'est ce qui
//! permettra d'y substituer un connecteur natif sans toucher au reste.
//!
//! Découpage :
//! - `binaire` — trouver `cloud-sql-proxy`, ou dire comment l'installer ;
//! - `sortie` — les deux lignes de journal dont on dépend ;
//! - `journal` — les dernières lignes, seul diagnostic disponible si le processus meurt.

pub mod binaire;
pub mod journal;
pub mod sortie;

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

use crate::config::ProxyCloudSql;
use crate::engine::port;
use crate::engine::proxy::{qualifier_avec, EtatProxy};
use crate::engine::EngineError;

use journal::Journal;

/// Le temps laissé au proxy pour annoncer qu'il écoute.
///
/// Généreux **délibérément** : le proxy contacte l'API Cloud SQL Admin et négocie un
/// certificat éphémère, ce qui prend plusieurs secondes sur une liaison lente. Trop court,
/// et l'app rendrait « délai dépassé » là où le proxy allait réussir — le pire des deux
/// échecs, parce qu'il accuse le mauvais coupable.
const DELAI_DEMARRAGE: Duration = Duration::from_secs(20);

/// Un proxy Cloud SQL ouvert, et le port local sur lequel il écoute.
pub struct CloudSqlProxy {
    port_local: u16,
    /// Le processus, `None` après `fermer`.
    ///
    /// Sous `Mutex` parce que `etat()` doit pouvoir l'interroger (`try_wait`) depuis une
    /// référence partagée, là où l'API de `Child` exige un emprunt mutable.
    processus: Mutex<Option<Child>>,
    /// La tâche qui vide la sortie d'erreur du processus.
    ///
    /// **Elle n'est pas optionnelle.** Si personne ne lit ce tuyau, le tampon du système se
    /// remplit et le proxy se **bloque en écriture** — panne silencieuse, et d'autant plus
    /// déroutante que la connexion aurait d'abord marché.
    drain: JoinHandle<()>,
    journal: Arc<Journal>,
}

/// `Debug` à la main : même raison que pour `SshTunnel` en `06e`. Le dérivé exposerait
/// l'état interne du `Child`, dont sa ligne de commande — qui porte le chemin du fichier de
/// compte de service.
impl std::fmt::Debug for CloudSqlProxy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "CloudSqlProxy {{ port_local: {} }}", self.port_local)
    }
}

impl CloudSqlProxy {
    /// Ouvre un proxy vers l'instance décrite par `proxy`.
    pub async fn ouvrir(
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
    ) -> Result<Self, EngineError> {
        let binaire = binaire::localiser()?;
        Self::ouvrir_avec(&binaire, proxy, port_local_demande).await
    }

    /// La même chose, avec le binaire en paramètre.
    ///
    /// Séparée pour la même raison que `connect_via` l'est de `connect` en `06b` : les tests
    /// pilotent un faux binaire, et n'ont pas le droit de dépendre de ce qui est installé sur
    /// la machine.
    pub async fn ouvrir_avec(
        binaire: &Path,
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
    ) -> Result<Self, EngineError> {
        Self::ouvrir_avec_delai(binaire, proxy, port_local_demande, DELAI_DEMARRAGE).await
    }

    /// La même chose, avec le délai en paramètre — pour que le test du délai dure 300 ms et
    /// non 20 secondes.
    pub async fn ouvrir_avec_delai(
        binaire: &Path,
        proxy: &ProxyCloudSql,
        port_local_demande: Option<u16>,
        delai: Duration,
    ) -> Result<Self, EngineError> {
        let port_demande = port::choisir_port_libre(port_local_demande).await?;

        let mut commande = Command::new(binaire);
        commande
            .arg(&proxy.instance_connection_name)
            .arg("--port")
            .arg(port_demande.to_string())
            // Explicite plutôt que par défaut : un proxy exposé sur toutes les interfaces
            // offrirait un accès non authentifié à la base à quiconque est sur le même
            // réseau. Même règle qu'en `06e` pour l'écouteur du tunnel.
            .arg("--address")
            .arg("127.0.0.1");

        // **Seulement quand il est donné.** `--credentials-file ""` ferait échouer le proxy
        // là où l'absence d'option signifie « identifiants par défaut de l'application » —
        // le cas courant.
        if let Some(chemin) = &proxy.credentials_file_path {
            commande.arg("--credentials-file").arg(chemin);
        }

        commande
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            // Le proxy écrit ses journaux sur la sortie d'erreur, y compris la ligne de
            // disponibilité. C'est notre seul canal.
            .stderr(std::process::Stdio::piped())
            // Filet en plus de `Drop` : si le processus parent meurt brutalement, l'enfant
            // ne survit pas en gardant le port.
            .kill_on_drop(true);

        let mut enfant = commande.spawn().map_err(|erreur| {
            EngineError::local(format!(
                "le binaire cloud-sql-proxy ({}) n'a pas pu être lancé ({erreur})",
                binaire.display()
            ))
        })?;

        let sortie = enfant.stderr.take().ok_or_else(|| {
            EngineError::local("la sortie du proxy cloud-sql-proxy est illisible")
        })?;

        let journal = Arc::new(Journal::default());
        let mut lignes = BufReader::new(sortie).lines();

        // Phase d'attente : on lit **dans cette tâche**, pas dans le drain, parce qu'il faut
        // pouvoir échouer et rendre l'erreur à l'appelant.
        let attente = async {
            let mut port_annonce = None;
            while let Ok(Some(ligne)) = lignes.next_line().await {
                journal.noter(ligne.clone());
                if let Some(port) = sortie::port_annonce(&ligne) {
                    port_annonce = Some(port);
                }
                if sortie::est_pret(&ligne) {
                    // Le port annoncé fait foi ; à défaut d'annonce, celui demandé, pour
                    // qu'une version du proxy qui cesserait d'écrire cette ligne ne rende
                    // pas l'ouverture impossible.
                    return Some(port_annonce.unwrap_or(port_demande));
                }
            }
            // Fin de flux sans ligne de disponibilité : le processus a fermé sa sortie, donc
            // il est mort ou mourant.
            None
        };

        let port_local = match tokio::time::timeout(delai, attente).await {
            Ok(Some(port)) => port,
            Ok(None) => {
                let _ = enfant.kill().await;
                return Err(EngineError::local(format!(
                    "le proxy cloud-sql-proxy s'est arrêté avant d'accepter les connexions : {}",
                    journal.dernieres()
                )));
            }
            Err(_) => {
                // Le tuer avant de rendre : un proxy abandonné garderait le port, et la
                // tentative suivante croirait parler à sa propre instance.
                let _ = enfant.kill().await;
                return Err(EngineError::local(format!(
                    "le proxy cloud-sql-proxy n'a pas annoncé être prêt dans le délai de {} s — \
                     ce qu'il a écrit : {}",
                    delai.as_secs().max(1),
                    journal.dernieres()
                )));
            }
        };

        // Le drain reprend la lecture là où l'attente s'est arrêtée, et tourne pour toute la
        // vie du proxy.
        let drain = tokio::spawn({
            let journal = Arc::clone(&journal);
            async move {
                while let Ok(Some(ligne)) = lignes.next_line().await {
                    journal.noter(ligne);
                }
            }
        });

        Ok(Self {
            port_local,
            processus: Mutex::new(Some(enfant)),
            drain,
            journal,
        })
    }

    pub fn port_local(&self) -> u16 {
        self.port_local
    }

    /// L'identifiant du processus, pour les journaux et pour les tests de fermeture.
    pub fn identifiant(&self) -> Option<u32> {
        self.processus
            .lock()
            .ok()
            .and_then(|garde| garde.as_ref().and_then(Child::id))
    }

    /// Les dernières lignes écrites par le proxy.
    pub fn journal(&self) -> String {
        self.journal.dernieres()
    }

    /// L'état du proxy.
    ///
    /// **Interrogé, et non surveillé par une tâche.** Un `try_wait` au moment où la question
    /// est posée dit la vérité à cet instant ; une tâche de surveillance devrait partager un
    /// drapeau, donc ajouter un état à tenir cohérent pour un résultat identique.
    pub fn etat(&self) -> EtatProxy {
        let Ok(mut garde) = self.processus.lock() else {
            return EtatProxy::Tombe {
                raison: "l'état du proxy Cloud SQL est illisible".to_owned(),
            };
        };
        let Some(enfant) = garde.as_mut() else {
            return EtatProxy::Tombe {
                raison: "le proxy Cloud SQL a été fermé".to_owned(),
            };
        };

        match enfant.try_wait() {
            Ok(None) => EtatProxy::Vivant,
            Ok(Some(statut)) => EtatProxy::Tombe {
                raison: format!("le processus s'est arrêté ({statut}) : {}", self.journal()),
            },
            Err(erreur) => EtatProxy::Tombe {
                raison: format!("l'état du processus est illisible ({erreur})"),
            },
        }
    }

    /// Qualifie une erreur de connexion à la base selon l'état du proxy.
    pub fn qualifier(&self, erreur: EngineError) -> EngineError {
        qualifier_avec(self.etat(), "le proxy Cloud SQL", erreur)
    }

    /// Tue le proxy et **attend** sa sortie, ce qui garantit que le port est rendu.
    ///
    /// **Pourquoi attendre, et pas seulement demander la mort** : même raison que
    /// `SshTunnel::fermer` en `06e`. Une demande de mort n'est pas synchrone ; rendre sans
    /// attendre laisserait le port lié quelques instants — invisible une fois, gênant après
    /// vingt essais.
    ///
    /// Un `SIGTERM` avant le coup de grâce serait plus courtois et coûterait une dépendance
    /// `libc`, Rust n'ayant pas de signal portable. On s'en dispense : le proxy est **sans
    /// état**, il ne fait que relayer des octets, et on ne le tue qu'au moment où la
    /// connexion se ferme de toute façon.
    pub async fn fermer(self) {
        // Sorti du `Mutex` avant tout `await` : garder un verrou synchrone à travers un
        // point d'attente est la façon classique de bloquer l'exécuteur.
        let enfant = self.processus.lock().ok().and_then(|mut garde| garde.take());
        if let Some(mut enfant) = enfant {
            // `kill` demande la mort **et** attend la sortie.
            let _ = enfant.kill().await;
        }
        self.drain.abort();
        let _ = self.drain.await;
    }
}

impl Drop for CloudSqlProxy {
    /// Filet de sécurité : demande la mort sans attendre.
    ///
    /// **Ne garantit pas** que le port est libre au retour — voir `fermer`. Un `Drop` ne peut
    /// pas attendre, et bloquer l'exécuteur ici serait pire que la fuite temporaire.
    /// `kill_on_drop(true)` sur la commande double ce filet.
    fn drop(&mut self) {
        if let Ok(mut garde) = self.processus.lock() {
            if let Some(enfant) = garde.as_mut() {
                let _ = enfant.start_kill();
            }
        }
        self.drain.abort();
    }
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql -- --test-threads=4`

Attendu : PASS, sept tests dans `cloudsql::tests`.

Si `fermer_tue_le_processus_et_libere_le_port` échoue, vérifier que le faux binaire est bien
le processus interrogé : `sh` lance `sleep` en enfant, et `ps -p` sur le pid du shell est ce
qui compte. Le `sleep` orphelin s'éteint de lui-même en une seconde.

- [ ] **Étape 5 : vérifier qu'aucun secret ne fuit**

Le fichier de compte de service est un **chemin**, pas un secret — mais son **contenu** ne
doit jamais entrer dans un message. Ajouter :

```rust
    #[tokio::test]
    async fn le_contenu_du_fichier_de_compte_de_service_n_apparait_jamais() {
        // Sentinelle **et contrôle positif**, comme `06e` le fait pour la clé privée : sans
        // le second, un test qui ne trouve pas la sentinelle ne prouve rien — il pourrait
        // simplement chercher dans une chaîne vide.
        const SENTINELLE: &str = "SENTINELLE-CLE-PRIVEE-DU-COMPTE-DE-SERVICE";
        let repertoire = std::env::temp_dir().join(format!("dorabase-sa-{}", std::process::id()));
        std::fs::create_dir_all(&repertoire).expect("répertoire");
        let fichier = repertoire.join("sa.json");
        std::fs::write(&fichier, format!(r#"{{"private_key":"{SENTINELLE}"}}"#)).expect("écriture");

        let mourant = faux_binaire(
            "sentinelle",
            r#"#!/bin/sh
echo "failed to authorize" >&2
exit 1
"#,
        );
        let mut config = configuration();
        config.credentials_file_path = Some(fichier.display().to_string());

        let erreur = CloudSqlProxy::ouvrir_avec(&mourant, &config, None)
            .await
            .expect_err("échec attendu");

        assert!(!erreur.message.contains(SENTINELLE), "{erreur}");
        // Contrôle positif : la sentinelle **est** bien dans le fichier, donc l'absence
        // ci-dessus dit quelque chose.
        let contenu = std::fs::read_to_string(&fichier).expect("lecture");
        assert!(contenu.contains(SENTINELLE));
    }
```

Commande : `cargo test --manifest-path src-tauri/Cargo.toml cloudsql`

Attendu : PASS.

- [ ] **Étape 6 : commiter**

```bash
git add src-tauri/src/engine/cloudsql/
git commit -m "feat(engine): 06f — ouvrir, surveiller et fermer le proxy Cloud SQL

Attendre la ligne « ready for new connections » plutôt que sonder le port : un
refus pendant le démarrage est indistinguable d'un refus définitif, et sonder
réussirait aussi si un autre programme écoutait ce port.

Le port rendu est celui que le proxy **annonce**, vérifié par un faux binaire
qui en annonce délibérément un autre que celui reçu.

Un proxy mort avant d'être prêt remonte **son** message, pas « délai dépassé » :
instance mal nommée, compte sans droit et API désactivée donnent chacun un
message précis.

Le drain de la sortie d'erreur n'est pas optionnel : sans lui le tampon du
système se remplit et le proxy se bloque en écriture.

\`fermer\` tue **et attend** — un proxy orphelin garderait le port, et la
connexion suivante croirait parler à sa propre instance. Vérifié par le pid, pas
par le port."
```

---

## Tâche 6 : un champ, un `match`

**Fichiers :** modifier `src-tauri/src/engine/proxy.rs`,
`src-tauri/src/engine/postgres/mod.rs`

- [ ] **Étape 1 : écrire le test qui échoue**

Dans le `mod tests` de `engine/postgres/mod.rs`, **remplacer** le test temporaire
`un_proxy_cloud_sql_est_refuse_tant_que_06f_n_existe_pas` (posé par `05d`, marqué
`// Retiré par 06f.`) par :

```rust
    #[tokio::test]
    async fn un_proxy_cloud_sql_n_est_plus_refuse_par_le_moteur() {
        // Sans binaire ni compte GCP, l'ouverture échoue — mais elle échoue **sur le proxy**,
        // pas sur un refus de principe. C'est la différence que ce scope apporte, et elle
        // est vérifiable sans Cloud SQL.
        let mut variante = variante_directe();
        variante.tunnel = Some(crate::config::Tunnel {
            local_port: None,
            proxy: crate::config::Proxy::CloudSql(crate::config::ProxyCloudSql {
                instance_connection_name: "p:r:i".into(),
                credentials_file_path: None,
            }),
        });

        let erreur = PostgresAdapter::connect_via(&variante, None, std::path::Path::new("/dev/null"))
            .await
            .expect_err("sans binaire, l'ouverture échoue");
        assert!(
            !erreur.message.contains("ne sait pas encore"),
            "le refus de principe de 05d doit avoir disparu : {erreur}"
        );
    }
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml postgres::tests::un_proxy_cloud_sql`

Attendu : ÉCHEC — le message du refus temporaire est encore là.

- [ ] **Étape 3 : écrire `ProxyOuvert`**

À ajouter à la fin de `src-tauri/src/engine/proxy.rs` :

```rust
/// Un proxy ouvert, de l'une ou l'autre sorte.
///
/// **Pourquoi ce type plutôt que deux champs dans `PostgresAdapter`.** Deux champs
/// donneraient deux chemins à tenir cohérents dans `connect_via`, `etat_tunnel`,
/// `port_local_tunnel` et `close` — quatre endroits où oublier l'un des deux. Ici,
/// l'aiguillage est fait **une fois**, et l'ajout d'une troisième sorte fera échouer la
/// compilation au seul endroit à traiter.
pub enum ProxyOuvert {
    Ssh(crate::engine::tunnel::SshTunnel),
    CloudSql(crate::engine::cloudsql::CloudSqlProxy),
}

impl ProxyOuvert {
    /// Ouvre le proxy décrit par la configuration, quelle que soit sa sorte.
    ///
    /// `hote_cible` et `port_cible` ne servent qu'au tunnel SSH : c'est lui qui doit savoir
    /// vers quoi rediriger. Le proxy Cloud SQL tient la cible de l'instance elle-même —
    /// l'hôte et le port de la variante ne le concernent pas, et le lui passer suggérerait
    /// le contraire.
    pub async fn ouvrir(
        tunnel: &crate::config::Tunnel,
        hote_cible: &str,
        port_cible: u16,
        known_hosts: &std::path::Path,
    ) -> Result<Self, EngineError> {
        match &tunnel.proxy {
            crate::config::Proxy::Ssh(ssh) => crate::engine::tunnel::SshTunnel::ouvrir(
                ssh,
                tunnel.local_port,
                hote_cible,
                port_cible,
                known_hosts,
            )
            .await
            .map(Self::Ssh),
            crate::config::Proxy::CloudSql(cloud) => {
                crate::engine::cloudsql::CloudSqlProxy::ouvrir(cloud, tunnel.local_port)
                    .await
                    .map(Self::CloudSql)
            }
        }
    }

    pub fn port_local(&self) -> u16 {
        match self {
            Self::Ssh(t) => t.port_local(),
            Self::CloudSql(p) => p.port_local(),
        }
    }

    pub fn etat(&self) -> EtatProxy {
        match self {
            Self::Ssh(t) => t.etat(),
            Self::CloudSql(p) => p.etat(),
        }
    }

    pub fn qualifier(&self, erreur: EngineError) -> EngineError {
        match self {
            Self::Ssh(t) => t.qualifier(erreur),
            Self::CloudSql(p) => p.qualifier(erreur),
        }
    }

    pub async fn fermer(self) {
        match self {
            Self::Ssh(t) => t.fermer().await,
            Self::CloudSql(p) => p.fermer().await,
        }
    }
}
```

- [ ] **Étape 4 : brancher `PostgresAdapter`**

Dans `engine/postgres/mod.rs` :

- remplacer l'import `use crate::engine::tunnel::{EtatTunnel, SshTunnel};` par
  `use crate::engine::proxy::{EtatProxy, ProxyOuvert};` ;
- renommer le champ `tunnel: Option<SshTunnel>` en `proxy: Option<ProxyOuvert>`, en gardant
  son commentaire de doc et en y ajoutant : « Une seule sorte de champ pour les deux sortes
  de proxy — voir `ProxyOuvert`. » ;
- remplacer le bloc d'aiguillage provisoire de `05d` par :

```rust
        let proxy = match &variante.tunnel {
            Some(tunnel) => Some(
                ProxyOuvert::ouvrir(tunnel, &variante.host, variante.port, known_hosts).await?,
            ),
            None => None,
        };

        let redirection = proxy.as_ref().map(|p| ("127.0.0.1", p.port_local()));
        let config = connect::preparer(variante, mot_de_passe, redirection)?;

        match connect::ouvrir(&config).await {
            Ok(client) => Ok(Self { client, proxy }),
            // **Le point de `06e`, étendu à Cloud SQL par `06g`** : sans cette
            // qualification, un proxy tombé produit un « connection refused » sur
            // `127.0.0.1`, qui envoie chercher un problème de PostgreSQL.
            Err(erreur) => Err(match &proxy {
                Some(p) => p.qualifier(erreur),
                None => erreur,
            }),
        }
```

- adapter `etat_tunnel`, `port_local_tunnel` et `close` :

```rust
    /// L'état du proxy, quand il y en a un. `None` pour une connexion directe.
    pub fn etat_tunnel(&self) -> Option<EtatProxy> {
        self.proxy.as_ref().map(ProxyOuvert::etat)
    }

    /// Le port local du proxy, que `A2` affiche sous « auto (63342) ».
    pub fn port_local_tunnel(&self) -> Option<u16> {
        self.proxy.as_ref().map(ProxyOuvert::port_local)
    }
```

et dans `close`, `if let Some(proxy) = self.proxy { proxy.fermer().await; }`.

- [ ] **Étape 5 : lancer toute la suite**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml`

Attendu : PASS. Les tests SSH de `06e` passent par `ProxyOuvert::Ssh` sans avoir changé —
c'est ce qui prouve que l'aiguillage n'a rien dévié.

- [ ] **Étape 6 : vérifier qu'un troisième membre ne compilerait qu'en un endroit**

Ajouter temporairement `CloudSqlNatif(())` à `enum Proxy` dans `config/model.rs`.

Commande : `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | grep -c "E0004"`

Attendu : les erreurs `E0004` désignent `Proxy::kind` et `ProxyOuvert::ouvrir` — **deux**
endroits, tous deux dans le code de l'aiguillage, aucun dans `PostgresAdapter`. C'est ce que
`06g` § Terminé quand demande.

Retirer le membre temporaire, et consigner le relevé dans le message de commit.

- [ ] **Étape 7 : commiter**

```bash
git add src-tauri/src/engine/
git commit -m "feat(engine): 06f — un champ de proxy, un seul aiguillage

\`PostgresAdapter\` porte un \`Option<ProxyOuvert>\` au lieu d'un
\`Option<SshTunnel>\`. Deux champs auraient donné deux chemins à tenir cohérents
dans connect_via, etat_tunnel, port_local_tunnel et close — quatre endroits où
oublier l'un des deux.

\`preparer\` continue de recevoir (\"127.0.0.1\", port) et n'apprend rien de
neuf : le signe que la frontière est au bon endroit.

Vérifié : l'ajout d'un troisième membre à \`Proxy\` fait échouer la compilation
en E0004 à deux endroits — \`Proxy::kind\` et \`ProxyOuvert::ouvrir\` —, aucun
dans PostgresAdapter.

Le refus de principe posé par 05d disparaît."
```

---

## Tâche 7 : le chemin heureux, contre une vraie instance

**Fichiers :** modifier `src-tauri/src/engine/postgres/mod.rs`

- [ ] **Étape 1 : écrire le test conditionné**

Dans le `mod tests` de `engine/postgres/mod.rs`, à côté de `variante_a_tunnel` :

```rust
    /// La variante d'une vraie instance Cloud SQL, si l'environnement en décrit une.
    ///
    /// **Conditionné comme les tests SSH de `06e`** le sont au serveur Docker : une instance
    /// Cloud SQL ne peut pas être une condition de la CI, et un test qui échouerait faute de
    /// compte GCP apprendrait seulement qu'on n'en a pas.
    fn variante_cloud_sql() -> Option<(EnvironmentVariant, Option<Secret>)> {
        let instance = std::env::var("DORABASE_TEST_CLOUDSQL_INSTANCE").ok()?;
        let base = std::env::var("DORABASE_TEST_CLOUDSQL_DATABASE").ok()?;
        let utilisateur = std::env::var("DORABASE_TEST_CLOUDSQL_USER").ok()?;
        let mot_de_passe = std::env::var("DORABASE_TEST_CLOUDSQL_PASSWORD").ok();

        let mut variante = variante_directe();
        variante.default_database = base;
        variante.username = utilisateur;
        // L'hôte et le port de la variante ne servent pas : le proxy tient la cible de
        // l'instance. Les laisser tels quels rend visible qu'ils sont ignorés.
        variante.tunnel = Some(crate::config::Tunnel {
            local_port: None,
            proxy: crate::config::Proxy::CloudSql(crate::config::ProxyCloudSql {
                instance_connection_name: instance,
                // `None` : identifiants par défaut de l'application. Le fichier de compte de
                // service se teste en posant `DORABASE_TEST_CLOUDSQL_CREDENTIALS`.
                credentials_file_path: std::env::var("DORABASE_TEST_CLOUDSQL_CREDENTIALS").ok(),
            }),
        });

        Some((variante, mot_de_passe.map(Secret::new)))
    }

    #[tokio::test]
    async fn une_instance_cloud_sql_est_joignable_par_le_proxy() {
        let Some((variante, secret)) = variante_cloud_sql() else {
            eprintln!(
                "ignoré : poser DORABASE_TEST_CLOUDSQL_INSTANCE, _DATABASE, _USER \
                 (et _PASSWORD / _CREDENTIALS) pour exercer ce chemin"
            );
            return;
        };

        let adaptateur = PostgresAdapter::connect_via(
            &variante,
            secret.as_ref(),
            std::path::Path::new("/dev/null"),
        )
        .await
        .expect("la connexion doit passer par le proxy Cloud SQL");

        assert!(adaptateur.port_local_tunnel().is_some());
        assert_eq!(adaptateur.etat_tunnel(), Some(EtatProxy::Vivant));
        // Une requête réelle, et non seulement l'ouverture : un proxy peut accepter la
        // connexion TCP et ne rien relayer.
        let sonde = adaptateur.probe().await.expect("sonde");
        assert!(!sonde.server_version.is_empty());

        adaptateur.close().await;
    }
```

**Note pour l'agent :** `variante_directe`, `Secret::new` et `probe` existent déjà sous ces
noms ou proches — lire le module et employer ceux qui y sont. Ne pas ajouter de fixture
concurrente.

- [ ] **Étape 2 : lancer sans les variables**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml une_instance_cloud_sql -- --nocapture`

Attendu : PASS, avec la ligne « ignoré : poser DORABASE_TEST_CLOUDSQL_INSTANCE… ».

- [ ] **Étape 3 : lancer avec une vraie instance**

Cette étape **demande une instance Cloud SQL et un compte**. Si le commanditaire n'en
fournit pas, marquer le critère comme **non observé** — comme `05c` l'est pour la
persistance du Trousseau — et le consigner, plutôt que de le déclarer vérifié.

```bash
export DORABASE_TEST_CLOUDSQL_INSTANCE="projet:region:instance"
export DORABASE_TEST_CLOUDSQL_DATABASE="postgres"
export DORABASE_TEST_CLOUDSQL_USER="dora_ro"
export DORABASE_TEST_CLOUDSQL_PASSWORD="…"
gcloud auth application-default login
cargo test --manifest-path src-tauri/Cargo.toml une_instance_cloud_sql -- --nocapture
```

Attendu : PASS, avec une version de serveur non vide.

- [ ] **Étape 4 : commiter**

```bash
git add src-tauri/src/engine/postgres/mod.rs
git commit -m "test(engine): 06f — le chemin heureux contre une vraie instance Cloud SQL

Conditionné à DORABASE_TEST_CLOUDSQL_*, comme les tests SSH de 06e le sont au
serveur Docker : une instance Cloud SQL ne peut pas être une condition de la CI,
et un test échouant faute de compte GCP apprendrait seulement qu'on n'en a pas.

Une requête réelle et pas seulement l'ouverture : un proxy peut accepter la
connexion TCP et ne rien relayer."
```

---

## Tâche 8 : consigner l'état

**Fichiers :** modifier `specs/README.md`, `REPRISE.md`

- [ ] **Étape 1 : marquer `06g` fait, avec ses réserves**

Dans `specs/README.md`, table « Modèle et accès aux données » :

```markdown
| [`06g`](06g-proxy-cloud-sql.md) | Proxy Cloud SQL : lancer et surveiller `cloud-sql-proxy` | **fait** (chemin heureux : … ) |
```

Renseigner la parenthèse honnêtement : « vérifié contre une vraie instance » ou « instance
réelle non observée », selon ce qui s'est passé en tâche 7 étape 3.

- [ ] **Étape 2 : ajouter les acquis techniques**

Dans `specs/README.md` § « Acquis techniques à connaître », ajouter ce qui a été **établi par
exécution** et qui éviterait une impasse à quelqu'un d'autre : le `PATH` minimal d'une app
lancée depuis le Finder, et le blocage en écriture d'un enfant dont personne ne vide la
sortie.

- [ ] **Étape 3 : commiter**

```bash
git add specs/README.md REPRISE.md
git commit -m "docs: 06f fait — état, réserves et deux acquis techniques"
```

---

## Terminé quand

Les onze critères de `specs/06g-proxy-cloud-sql.md` § « Terminé quand » sont vérifiés. Trois
demandent une observation explicite plutôt qu'un test :

- l'ordre `E0004` d'un membre supplémentaire (tâche 6, étape 6) ;
- le chemin heureux contre une vraie instance (tâche 7, étape 3) — **le seul critère qui
  peut rester non observé**, et il doit alors être consigné comme tel ;
- que `preparer` n'ait rien appris de neuf, qui se lit dans le diff.
