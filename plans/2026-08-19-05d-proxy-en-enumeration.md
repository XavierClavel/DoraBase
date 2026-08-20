# Plan d'implémentation — 05d Le proxy en énumération à données

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** que `Tunnel` puisse décrire un bastion SSH **ou** un proxy Cloud SQL, sans
qu'aucune des deux sortes porte les champs de l'autre.

**Architecture :** `Tunnel` garde le seul champ commun aux deux sortes — le port local — et
délègue le reste à une énumération `Proxy` **étiquetée en interne** sur `kind`. Le fichier de
configuration passe en version 2, avec la première migration réelle du mécanisme de `05b`. La
projection TypeScript devient une union discriminée, ce qui fait porter au compilateur ce
qu'aucune maquette ne rattrapera en `08k`.

**Stack :** Rust · serde (`tag = "kind"`) · ts-rs 12 · Vitest pour le côté TS

**Spec :** `specs/05d-proxy-en-enumeration.md`

---

## Ce qu'il faut savoir avant de commencer

**Le champ garde son nom.** `EnvironmentVariant.tunnel` ne devient pas `proxy`. Le renommer
toucherait `config/query.rs`, `config/enregistrer.rs`, `engine/commands.rs`, `registry.rs`, le
front, et alourdirait la migration — pour un gain nul : le panneau de `A2` s'appelle
littéralement « Proxy / tunnel ». La forme **interne** de la valeur change, pas sa clé.

**Pourquoi imbriqué et non `#[serde(flatten)]`.** Aplatir donnerait un JSON plus proche de
l'actuel (`{"localPort":null,"kind":"ssh","bastionHost":…}`) et une migration réduite à
l'ajout d'une clé. Écarté : `flatten` combiné à une énumération étiquetée en interne est le
coin le moins éprouvé de ts-rs, et la projection est vérifiée en CI par diff — un générateur
qui rend une intersection inattendue bloquerait tout le plan. La forme imbriquée est
prévisible, et la migration est de toute façon testée sur des octets.

**L'ordre des tâches n'est pas négociable.** La tâche 2 casse la compilation de plusieurs
fichiers ; les tâches 3 et 4 la réparent. Ne pas commiter entre 2 et 4 autre chose qu'un état
compilable — voir la note de commit de la tâche 4.

---

## Structure de fichiers

| Fichier | Responsabilité | Action |
| --- | --- | --- |
| `src-tauri/src/config/model.rs` | `Tunnel`, `Proxy`, `ProxySsh`, `ProxyCloudSql` | modifier |
| `src-tauri/src/config/store.rs` | `VERSION_COURANTE = 2`, migration v1 → v2 | modifier |
| `src-tauri/src/engine/tunnel/mod.rs` | `SshTunnel::ouvrir` prend un `&ProxySsh` | modifier |
| `src-tauri/src/engine/postgres/mod.rs` | aiguillage minimal (le vrai vient en `06g`) | modifier |
| `src/domain/config.ts` | projection **générée** — ne jamais éditer à la main | régénérer |
| `src/screens/NewConnection/draftToRequest.ts` | émet la forme imbriquée | modifier |
| `src/screens/NewConnection/enregistrerLaBase.ts` | idem | modifier |
| `src/screens/NewConnection/TunnelPanel.tsx` | lit `tunnel.proxy` — provisoire, `08k` refait | modifier |

---

## Tâche 1 : les types, en rouge d'abord

**Fichiers :** modifier `src-tauri/src/config/model.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

À ajouter dans le `mod tests` en bas de `model.rs` :

```rust
    #[test]
    fn un_proxy_ssh_se_serialise_avec_son_etiquette() {
        let tunnel = Tunnel {
            local_port: None,
            proxy: Proxy::Ssh(ProxySsh {
                bastion_host: "bastion.internal".into(),
                bastion_port: 22,
                username: "dora".into(),
                private_key_path: "/home/dora/.ssh/id_ed25519".into(),
            }),
        };

        let json = serde_json::to_value(&tunnel).expect("sérialisation");
        // L'étiquette est **dans** l'objet du proxy, et vaut la forme kebab attendue par
        // le front. La vérifier ici plutôt qu'en `08k` : c'est le contrat de l'IPC.
        assert_eq!(json["proxy"]["kind"], "ssh");
        assert_eq!(json["proxy"]["bastionHost"], "bastion.internal");
        assert!(json["localPort"].is_null());
    }

    #[test]
    fn un_proxy_cloud_sql_se_serialise_avec_son_etiquette() {
        let tunnel = Tunnel {
            local_port: Some(5433),
            proxy: Proxy::CloudSql(ProxyCloudSql {
                instance_connection_name: "acme-prod:europe-west1:analytics".into(),
                credentials_file_path: None,
            }),
        };

        let json = serde_json::to_value(&tunnel).expect("sérialisation");
        assert_eq!(json["proxy"]["kind"], "cloud-sql");
        assert_eq!(
            json["proxy"]["instanceConnectionName"],
            "acme-prod:europe-west1:analytics"
        );
        // `None` signifie « identifiants par défaut de l'application » : une valeur, pas un
        // trou. Elle doit donc traverser explicitement, et non disparaître.
        assert!(json["proxy"]["credentialsFilePath"].is_null());
        assert_eq!(json["localPort"], 5433);
    }

    #[test]
    fn un_proxy_relu_est_celui_ecrit() {
        // Aller-retour, parce que la sérialisation seule ne prouve pas que `serde` sait
        // retrouver la variante depuis son étiquette.
        for proxy in [
            Proxy::Ssh(ProxySsh {
                bastion_host: "b".into(),
                bastion_port: 2222,
                username: "u".into(),
                private_key_path: "/k".into(),
            }),
            Proxy::CloudSql(ProxyCloudSql {
                instance_connection_name: "p:r:i".into(),
                credentials_file_path: Some("/sa.json".into()),
            }),
        ] {
            let tunnel = Tunnel {
                local_port: None,
                proxy,
            };
            let brut = serde_json::to_string(&tunnel).expect("écriture");
            let relu: Tunnel = serde_json::from_str(&brut).expect("relecture");
            assert_eq!(relu, tunnel);
        }
    }

    #[test]
    fn une_etiquette_inconnue_est_refusee() {
        // Un fichier écrit par une version future, ou trafiqué à la main, ne doit pas
        // produire un proxy par défaut : `05b` met en quarantaine ce qu'il ne sait pas lire.
        let brut = r#"{"localPort":null,"proxy":{"kind":"socks5","host":"h"}}"#;
        assert!(serde_json::from_str::<Tunnel>(brut).is_err());
    }
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml config::model`

Attendu : ÉCHEC de compilation — `cannot find struct ProxySsh`, `no field local_port`.

- [ ] **Étape 3 : remplacer `Tunnel` dans `model.rs`**

Remplacer le bloc `TunnelKind` + `Tunnel` existant (repère : le commentaire « Proxy /
tunnel du panneau de `A2` ») par :

```rust
/// Les sortes de proxy que le panneau « Proxy / tunnel » de `A2` sait décrire.
///
/// **Distincte de `Proxy`**, qui porte les données : cette énumération sert au sélecteur
/// « Type » de l'écran, qui doit pouvoir nommer une sorte avant d'en avoir les champs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "config.ts")]
#[serde(rename_all = "kebab-case")]
pub enum TunnelKind {
    Ssh,
    CloudSql,
}

/// Un bastion SSH. Le **chemin** de la clé privée est de la configuration, pas un
/// secret — voir `specs/05c` § Hors périmètre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct ProxySsh {
    pub bastion_host: String,
    pub bastion_port: u16,
    pub username: String,
    pub private_key_path: String,
}

/// Le Cloud SQL Auth Proxy de Google. Ouvert par `06g`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct ProxyCloudSql {
    /// `projet:région:instance`, la forme exigée par le proxy. **Non validée ici** :
    /// `06g` refuse à l'ouverture, avec le message du proxy lui-même.
    pub instance_connection_name: String,
    /// `None` signifie **« identifiants par défaut de l'application »** — le cas courant,
    /// quand l'utilisateur a fait `gcloud auth application-default login`. Ce n'est pas un
    /// champ oublié, et le nommer ainsi évite qu'un lecteur le prenne pour tel.
    ///
    /// Un **chemin**, donc pas un secret : même raison que la clé privée SSH.
    pub credentials_file_path: Option<String>,
}

/// Ce qui **diffère** entre les deux sortes de proxy.
///
/// **Une énumération et non des champs optionnels.** Un `Tunnel` plat portant les champs
/// des deux autoriserait `kind: "cloud-sql"` avec un bastion renseigné et aucune instance.
/// `05a` pose que les invariants sont portés par le typage plutôt qu'en commentaire ; c'en
/// est un. Le coût — un `match` là où il y avait un accès de champ — est le bénéfice :
/// l'ajout d'une troisième sorte fera échouer la compilation aux endroits à traiter.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "kebab-case")]
#[ts(export_to = "config.ts")]
pub enum Proxy {
    Ssh(ProxySsh),
    CloudSql(ProxyCloudSql),
}

impl Proxy {
    /// La sorte, pour le sélecteur « Type » de `A2` et pour les journaux.
    pub fn kind(&self) -> TunnelKind {
        match self {
            Self::Ssh(_) => TunnelKind::Ssh,
            Self::CloudSql(_) => TunnelKind::CloudSql,
        }
    }
}

/// Le panneau « Proxy / tunnel » de `A2`, tel qu'il est configuré.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "config.ts")]
pub struct Tunnel {
    /// `None` signifie « auto » — le port local est choisi à l'ouverture par `06`.
    ///
    /// **Hors de `Proxy`, et c'est le point** : il est vrai des deux sortes. Le dupliquer
    /// dans chaque variante obligerait chaque lecteur à faire un `match` pour lire une
    /// donnée qui ne varie pas.
    pub local_port: Option<u16>,
    pub proxy: Proxy,
}
```

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml config::model`

Attendu : les quatre nouveaux tests passent. Les autres fichiers **ne compilent plus** —
c'est la tâche 3. Si `cargo test` refuse de bâtir la crate entière, passer directement à la
tâche 3 et revenir vérifier ici : l'ordre rouge/vert est conservé, la barrière est
mécanique.

- [ ] **Étape 5 : ne pas commiter encore**

L'arbre ne compile pas. Le commit vient en tâche 4.

---

## Tâche 2 : un `match` non exhaustif doit échouer

**Fichiers :** modifier `src-tauri/src/config/model.rs`

Cette tâche ne produit pas de code de production : elle **vérifie l'affirmation centrale**
de la spec (« un `match` non exhaustif fait échouer la compilation »), qu'aucun test
d'exécution ne peut prouver.

- [ ] **Étape 1 : vérifier à la main que le compilateur refuse**

Ajouter temporairement dans `model.rs` :

```rust
fn _preuve_temporaire(proxy: &Proxy) -> &'static str {
    match proxy {
        Proxy::Ssh(_) => "ssh",
    }
}
```

Commande : `cargo check --manifest-path src-tauri/Cargo.toml`

Attendu : `E0004 — non-exhaustive patterns: &Proxy::CloudSql(_) not covered`.

- [ ] **Étape 2 : retirer la fonction de preuve**

Elle a fait son travail. La laisser serait du code mort, et un `#[allow]` de plus.

- [ ] **Étape 3 : consigner la preuve dans un commentaire de doc**

Sur `enum Proxy`, ajouter en fin de doc :

```rust
/// Vérifié : un `match` omettant `CloudSql` échoue en `E0004` (relevé le 19 août 2026).
```

---

## Tâche 3 : réparer les appelants Rust

**Fichiers :** modifier `src-tauri/src/engine/tunnel/mod.rs`,
`src-tauri/src/engine/postgres/mod.rs`

- [ ] **Étape 1 : lister ce qui est cassé**

Commande : `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "^error" | sort -u`

Attendu : des erreurs dans `engine/tunnel/mod.rs` (accès à `tunnel.bastion_host`, `match
tunnel.kind`) et `engine/postgres/mod.rs` (appel de `SshTunnel::ouvrir`).

- [ ] **Étape 2 : `SshTunnel::ouvrir` prend ce dont elle a besoin, et rien de plus**

Dans `engine/tunnel/mod.rs`, remplacer l'import et la signature :

```rust
use crate::config::ProxySsh;
```

```rust
    /// Ouvre un tunnel et met en place la redirection vers `hote_cible:port_cible`.
    ///
    /// **Prend un `&ProxySsh` et non un `&Tunnel`** depuis `05d` : le `match tunnel.kind`
    /// qui ouvrait cette fonction était un garde-fou décoratif — il vérifiait à l'exécution
    /// ce que le type peut affirmer. L'aiguillage vit maintenant en `06g`, en un seul
    /// endroit, et cette fonction ne peut plus être appelée pour un proxy Cloud SQL.
    ///
    /// `port_local_demande` est l'ancien `tunnel.local_port` : il vient de `Tunnel`, qui
    /// n'est plus passé entier.
    pub async fn ouvrir(
        proxy: &ProxySsh,
        port_local_demande: Option<u16>,
        hote_cible: &str,
        port_cible: u16,
        known_hosts: &Path,
    ) -> Result<Self, EngineError> {
```

Puis, dans le corps :

- supprimer le bloc `match tunnel.kind { TunnelKind::Ssh => {} }` et son commentaire — la
  remarque qu'il portait est désormais dans la doc ci-dessus ;
- supprimer l'import de `TunnelKind` et de `Tunnel` s'ils deviennent inutilisés ;
- remplacer chaque `tunnel.` par `proxy.` (`private_key_path`, `bastion_host`,
  `bastion_port`, `username`) ;
- remplacer `port::ouvrir_ecouteur(tunnel.local_port)` par
  `port::ouvrir_ecouteur(port_local_demande)`.

- [ ] **Étape 3 : aiguiller dans `postgres/mod.rs`, provisoirement**

Remplacer le bloc `let tunnel = match &variante.tunnel { … }` de `connect_via` par :

```rust
        // Aiguillage **provisoire** : `06g` le remplace par `ProxyOuvert`, qui portera les
        // deux sortes. Ici, Cloud SQL est refusé avec un message qui dit pourquoi — le
        // modèle sait le décrire (`05d`) avant que le moteur sache l'ouvrir, et c'est un
        // état cohérent, pas un oubli.
        let tunnel = match &variante.tunnel {
            Some(Tunnel {
                local_port,
                proxy: Proxy::Ssh(ssh),
            }) => Some(
                SshTunnel::ouvrir(ssh, *local_port, &variante.host, variante.port, known_hosts)
                    .await?,
            ),
            Some(Tunnel {
                proxy: Proxy::CloudSql(_),
                ..
            }) => {
                return Err(EngineError::local(
                    "cette base est configurée derrière le proxy Cloud SQL, que cette version \
                     ne sait pas encore ouvrir",
                ));
            }
            None => None,
        };
```

et ajouter `Proxy, Tunnel` à l'import `use crate::config::…`.

- [ ] **Étape 4 : réparer les fixtures de test**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | grep -E "^error" | sort -u`

Le seul endroit à corriger est `variante_a_tunnel()` dans `engine/postgres/mod.rs` (aux
alentours de la ligne 469), qui construit un `Tunnel` à plat :

```rust
        variante.tunnel = Some(crate::config::Tunnel {
            local_port: None,
            proxy: crate::config::Proxy::Ssh(crate::config::ProxySsh {
                bastion_host: hote,
                bastion_port: port,
                username: utilisateur,
                private_key_path: cle,
            }),
        });
```

Reprendre les valeurs exactes déjà présentes dans la fonction — ne pas les réinventer.

- [ ] **Étape 5 : vérifier que tout compile et que rien n'a régressé**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml`

Attendu : PASS. Les tests exigeant Docker ou un serveur SSH s'ignorent d'eux-mêmes, comme
avant.

- [ ] **Étape 6 : vérifier que le refus de Cloud SQL est bien un refus**

Ajouter dans le `mod tests` de `engine/postgres/mod.rs` :

```rust
    #[tokio::test]
    async fn un_proxy_cloud_sql_est_refuse_tant_que_06f_n_existe_pas() {
        // **Un refus explicite, pas une connexion directe.** Se connecter en direct
        // contournerait la consigne de sécurité de l'utilisateur — c'est le même principe
        // que `preparer` applique déjà à un tunnel sans redirection.
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
            .expect_err("Cloud SQL doit être refusé, pas connecté en direct");
        assert!(erreur.message.contains("Cloud SQL"), "{erreur}");
    }
```

Adapter le nom de la fixture : reprendre celle qu'emploie déjà
`une_connexion_directe_ne_rapporte_aucun_tunnel` dans ce même module.

**Ce test est temporaire** : `06g` le remplacera par le test du chemin réel. Le marquer d'un
commentaire `// Retiré par 06f.` pour qu'il ne survive pas par inadvertance.

Commande : `cargo test --manifest-path src-tauri/Cargo.toml postgres`

Attendu : PASS.

---

## Tâche 4 : la migration v1 → v2, testée sur des octets

**Fichiers :** modifier `src-tauri/src/config/store.rs`

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans le `mod tests` de `store.rs` :

```rust
    /// Un fichier de version 1 tel que l'application **écrivait** réellement, en octets.
    ///
    /// **Littéral et non sérialisé depuis une structure Rust** : la forme v1 n'existe plus
    /// dans le code, donc la reconstruire avec `serde` d'aujourd'hui testerait la
    /// sérialisation actuelle contre elle-même et ne prouverait rien de la migration.
    const V1_AVEC_TUNNEL: &str = r#"{
      "version": 1,
      "projects": [{
        "name": "acme",
        "activeEnvironment": "dev",
        "databases": [{
          "name": "analytics",
          "engine": "postgresql",
          "variants": [{
            "environment": "dev",
            "host": "db.internal",
            "port": 5432,
            "defaultDatabase": "analytics",
            "username": "dora_ro",
            "password": null,
            "sslMode": "require",
            "readOnly": true,
            "reconnectOnStartup": false,
            "tunnel": {
              "kind": "ssh",
              "bastionHost": "bastion.internal",
              "bastionPort": 2222,
              "username": "dora",
              "privateKeyPath": "/home/dora/.ssh/id_ed25519",
              "localPort": null
            }
          }]
        }]
      }]
    }"#;

    #[test]
    fn un_fichier_v1_a_tunnel_migre_vers_la_forme_imbriquee() {
        let repertoire = tempdir();
        let cible = repertoire.join("config.json");
        std::fs::write(&cible, V1_AVEC_TUNNEL).expect("écriture v1");

        let issue = load(&cible);

        let LoadOutcome::Loaded(projets) = issue else {
            panic!("un fichier v1 doit se lire après migration, obtenu {issue:?}");
        };
        let variante = &projets[0].databases[0].variants()[0];
        let tunnel = variante.tunnel.as_ref().expect("le tunnel doit survivre");
        assert_eq!(tunnel.local_port, None);
        let Proxy::Ssh(ssh) = &tunnel.proxy else {
            panic!("un tunnel v1 est nécessairement SSH");
        };
        assert_eq!(ssh.bastion_host, "bastion.internal");
        assert_eq!(ssh.bastion_port, 2222);
        assert_eq!(ssh.username, "dora");
        assert_eq!(ssh.private_key_path, "/home/dora/.ssh/id_ed25519");
    }

    #[test]
    fn la_migration_laisse_une_sauvegarde_de_l_original() {
        let repertoire = tempdir();
        let cible = repertoire.join("config.json");
        std::fs::write(&cible, V1_AVEC_TUNNEL).expect("écriture v1");

        let _ = load(&cible);

        // `05b` § « Version et migration » : la sauvegarde est ce qui rend une migration
        // fautive réparable. Elle doit contenir les **octets d'origine**, non réécrits.
        let sauvegarde = std::fs::read_to_string(repertoire.join("config.v1.json"))
            .expect("une sauvegarde doit exister");
        assert_eq!(sauvegarde, V1_AVEC_TUNNEL);
    }

    #[test]
    fn un_fichier_v1_sans_tunnel_migre_aussi() {
        // Ne rien avoir à faire est un chemin, pas un cas oublié : la très grande majorité
        // des configurations existantes n'a aucun tunnel.
        let sans = V1_AVEC_TUNNEL
            .split("\"tunnel\":")
            .next()
            .map(|debut| format!("{debut}\"tunnel\": null }}]}}]}}]}}"))
            .expect("découpe");
        let repertoire = tempdir();
        let cible = repertoire.join("config.json");
        std::fs::write(&cible, &sans).expect("écriture");

        let issue = load(&cible);
        let LoadOutcome::Loaded(projets) = issue else {
            panic!("obtenu {issue:?}");
        };
        assert!(projets[0].databases[0].variants()[0].tunnel.is_none());
    }

    #[test]
    fn un_fichier_v2_se_lit_sans_migration() {
        let repertoire = tempdir();
        let cible = repertoire.join("config.json");
        // Écrit par le code d'aujourd'hui : c'est le chemin direct, sans sauvegarde.
        sauver_pour_test(&cible, projets_avec_tunnel_cloud_sql());

        let issue = load(&cible);
        assert!(matches!(issue, LoadOutcome::Loaded(_)), "{issue:?}");
        assert!(
            !repertoire.join("config.v2.json").exists(),
            "aucune sauvegarde ne doit être créée sans migration"
        );
    }
```

**Note pour l'agent :** `tempdir()`, `load` et l'équivalent de `sauver_pour_test` /
`projets_avec_tunnel_cloud_sql` existent peut-être déjà sous d'autres noms dans ce `mod
tests`. **Lire le module avant d'écrire** et réemployer les aides présentes plutôt que d'en
ajouter des doublons ; n'écrire que celles qui manquent.

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml config::store`

Attendu : ÉCHEC — la version courante étant 1, `V1_AVEC_TUNNEL` est lu en direct et la
désérialisation échoue sur la forme du tunnel, donc mise en quarantaine (`Unreadable`).

- [ ] **Étape 3 : passer la version à 2 et écrire la migration**

Dans `store.rs`, remplacer la constante :

```rust
/// Version du format sur disque. À incrémenter pour tout changement de forme, en
/// ajoutant la migration correspondante dans `migrer`.
///
/// v2 (`05d`) : `tunnel` porte désormais `{ localPort, proxy: { kind, … } }` au lieu de
/// quatre champs SSH à plat.
pub const VERSION_COURANTE: u32 = 2;
```

Puis remplacer le bras de `migrer` par une chaîne à deux étapes :

```rust
    // La chaîne est **explicite** : chaque version se hisse d'un cran, et un fichier v0
    // traverse donc v1 avant d'atteindre v2. Sauter des crans obligerait à écrire une
    // migration par couple de versions.
    let mut valeur: serde_json::Value = match serde_json::from_str(brut) {
        Ok(valeur) => valeur,
        Err(erreur) => {
            return LoadOutcome::Unreadable {
                reason: format!("migration impossible, JSON invalide : {erreur}"),
                quarantined_to: sauvegarde,
            };
        }
    };

    let mut version = depuis;
    while version < VERSION_COURANTE {
        match version {
            // v0 → v1 : la v0 n'a jamais été diffusée, sa forme est celle de la v1.
            0 => {}
            1 => hisser_v1_vers_v2(&mut valeur),
            _ => {
                return LoadOutcome::Unreadable {
                    reason: format!("aucune migration connue depuis la version {version}"),
                    quarantined_to: sauvegarde,
                };
            }
        }
        version += 1;
    }

    match serde_json::from_value::<ConfigFile>(valeur) {
        Ok(fichier) => LoadOutcome::Loaded(fichier.projects),
        Err(erreur) => LoadOutcome::Unreadable {
            reason: format!("migration depuis la version {depuis} impossible : {erreur}"),
            quarantined_to: sauvegarde,
        },
    }
```

et ajouter, sous `migrer` :

```rust
/// v1 → v2 : le tunnel plat devient `{ localPort, proxy: { kind: "ssh", … } }`.
///
/// **Purement structurelle, sans perte possible** : en v1, un tunnel était nécessairement
/// SSH — `TunnelKind` n'avait qu'un membre. L'étiquette est donc connue sans avoir à la
/// deviner, ce qui fait de celle-ci une bonne première migration réelle.
///
/// Écrite en manipulant du `serde_json::Value` et non en désérialisant vers une structure
/// « v1 » qu'il faudrait garder en vie : cette forme n'a plus de type dans le code, et lui
/// en fabriquer un obligerait à le maintenir à chaque évolution ultérieure.
fn hisser_v1_vers_v2(valeur: &mut serde_json::Value) {
    let Some(projets) = valeur.get_mut("projects").and_then(|v| v.as_array_mut()) else {
        return;
    };

    for projet in projets {
        let Some(bases) = projet.get_mut("databases").and_then(|v| v.as_array_mut()) else {
            continue;
        };
        for base in bases {
            let Some(variantes) = base.get_mut("variants").and_then(|v| v.as_array_mut()) else {
                continue;
            };
            for variante in variantes {
                let Some(tunnel) = variante.get_mut("tunnel") else {
                    continue;
                };
                // `null` est le cas courant : rien à faire, et c'est un chemin couvert.
                let Some(objet) = tunnel.as_object_mut() else {
                    continue;
                };

                let port_local = objet.remove("localPort").unwrap_or(serde_json::Value::Null);
                // `kind` était déjà là en v1, et valait « ssh ». Le laisser en place fait de
                // lui l'étiquette du proxy, exactement ce que `#[serde(tag = "kind")]`
                // attend — un renommage suffirait donc, mais l'écrire explicitement rend la
                // migration lisible sans connaître la v1.
                objet.insert("kind".to_owned(), serde_json::Value::from("ssh"));

                let proxy = serde_json::Value::Object(std::mem::take(objet));
                *tunnel = serde_json::json!({ "localPort": port_local, "proxy": proxy });
            }
        }
    }
}
```

Ajouter en tête de fichier : `use super::model::{Project, Proxy};` — ou seulement `Proxy`
dans le `mod tests` si le module de production n'en a pas besoin.

- [ ] **Étape 4 : lancer les tests pour vérifier qu'ils passent**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml config::store`

Attendu : PASS, y compris le test préexistant du mécanisme de migration (celui à version
factice). S'il échoue, c'est que la boucle a changé son comportement pour v0 — le corriger
sans toucher au test : c'est lui qui décrit le contrat.

- [ ] **Étape 5 : vérifier que le nom de la sauvegarde suit la version d'origine**

Lire `sauvegarde_de_migration` et confirmer qu'un fichier v1 produit bien
`config.v1.json`. Si la convention diffère, **corriger le test**, pas la fonction : le nom
existant est déjà un contrat.

Commande : `cargo test --manifest-path src-tauri/Cargo.toml config::store -- --nocapture`

- [ ] **Étape 6 : lancer toute la suite Rust**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml`

Attendu : PASS.

- [ ] **Étape 7 : commiter le Rust en un seul morceau**

Les tâches 1 à 4 forment **un seul commit** : entre elles, l'arbre ne compile pas, et
découper produirait des commits cassés.

```bash
git add src-tauri/src/config/model.rs src-tauri/src/config/store.rs \
        src-tauri/src/engine/tunnel/mod.rs src-tauri/src/engine/postgres/mod.rs
git commit -m "feat(config): 05d — le proxy en énumération à données

\`Tunnel\` garde le seul champ commun aux deux sortes — le port local — et
délègue le reste à \`Proxy\`, étiquetée en interne sur \`kind\`. Un
\`Proxy::CloudSql\` portant un bastion ne compile plus, et un \`match\` non
exhaustif échoue en E0004 (vérifié).

\`SshTunnel::ouvrir\` prend un \`&ProxySsh\` : le \`match tunnel.kind\` qui
l'ouvrait vérifiait à l'exécution ce que le type peut affirmer.

Le fichier de configuration passe en version 2, avec la première migration
réelle du mécanisme de 05b — jusqu'ici exercé sur une version factice
seulement. Purement structurelle : en v1 un tunnel était nécessairement SSH,
l'étiquette est donc connue sans avoir à la deviner. Testée sur des octets
littéraux, pas sur une structure Rust reconstruite : la forme v1 n'existe plus
dans le code.

Cloud SQL est refusé par le moteur avec un message qui le dit — 06f l'ouvrira.
Le modèle sait le décrire avant que le moteur sache l'ouvrir, et c'est un état
cohérent."
```

---

## Tâche 5 : régénérer la projection TypeScript et réparer le front

**Fichiers :** régénérer `src/domain/config.ts` ; modifier
`src/screens/NewConnection/draftToRequest.ts`,
`src/screens/NewConnection/enregistrerLaBase.ts`,
`src/screens/NewConnection/TunnelPanel.tsx`

- [ ] **Étape 1 : régénérer**

Commande : `pnpm domain:build`

Attendu : `src/domain/config.ts` modifié, avec `export type Proxy = { "kind": "ssh" } & …`
ou la forme équivalente que ts-rs produit pour une énumération étiquetée en interne.

**Ne pas éditer ce fichier à la main** : `pnpm domain:check` échouerait en CI.

- [ ] **Étape 2 : lire la forme réellement générée**

Commande : `grep -A2 "export type Proxy\|export type Tunnel\|export type TunnelKind" src/domain/config.ts`

Attendu : `Proxy` est une union discriminée sur `kind`, `Tunnel` porte `localPort` et
`proxy`, `TunnelKind` vaut `"ssh" | "cloud-sql"`.

Si ts-rs a produit autre chose qu'une union — une intersection, ou un `kind` optionnel —
**s'arrêter et le signaler** : c'est le seul risque technique de ce plan, et la parade est
la forme aplatie écartée en tête de document.

- [ ] **Étape 3 : constater que le front ne compile plus**

Commande : `pnpm typecheck`

Attendu : erreurs dans `draftToRequest.ts`, `enregistrerLaBase.ts`, `TunnelPanel.tsx`.

- [ ] **Étape 4 : émettre la forme imbriquée dans les deux convertisseurs**

Dans `draftToRequest.ts` **et** `enregistrerLaBase.ts`, remplacer le littéral de tunnel par :

```ts
      tunnel: draft.tunnel
        ? {
            // Toujours `null` : le port local est **choisi par l'app** à l'ouverture,
            // jamais saisi. `06e` se lie au port 0 et rend celui que le système attribue.
            localPort: null,
            proxy: {
              kind: 'ssh',
              bastionHost: draft.tunnel.bastionHost,
              bastionPort: Number.isFinite(bastionPort) ? bastionPort : 0,
              username: draft.tunnel.username,
              privateKeyPath: draft.tunnel.privateKeyPath,
            },
          }
        : null,
```

`'ssh'` reste codé en dur ici : `TunnelDraft` ne porte pas encore de sorte, et c'est `08k`
qui la lui donnera. Ajouter le commentaire :

```ts
            // `'ssh'` en dur tant que `08k` n'a pas donné une sorte à `TunnelDraft` : le
            // panneau n'a qu'une option, donc il n'y a rien à choisir.
```

- [ ] **Étape 5 : `TunnelPanel` lit la forme imbriquée, provisoirement**

Le panneau lit `tunnel.localPort`, qui vient de `TunnelDraft` et **n'a pas changé** — la
seule modification attendue est le port local si le composant lisait le type généré. Vérifier
avec :

Commande : `pnpm typecheck 2>&1 | grep TunnelPanel`

S'il n'y a rien, ne rien toucher : le panneau travaille sur `TunnelDraft`, pas sur `Tunnel`,
et `08k` refera l'un et l'autre ensemble.

- [ ] **Étape 6 : vérifier la chaîne complète**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm domain:check
```

Attendu : PASS partout. `pnpm domain:check` doit rendre un diff **vide** — s'il ne l'est
pas, c'est que `src/domain/config.ts` a été touché à la main.

- [ ] **Étape 7 : commiter**

```bash
git add src/domain/config.ts src/screens/NewConnection/
git commit -m "feat(domain): 05d — la projection TypeScript devient une union discriminée

Régénérée par \`pnpm domain:build\`, jamais recopiée. Lire \`bastionHost\` sans
avoir rétréci sur \`kind\` ne compile plus : c'est ce qui remplace la maquette
absente comme garde-fou en 08f, Cloud SQL n'étant pas dans le handoff.

Les deux convertisseurs de A2 émettent la forme imbriquée. \`'ssh'\` y reste en
dur tant que 08f n'a pas donné une sorte à \`TunnelDraft\` — le panneau n'a
qu'une option, il n'y a rien à choisir."
```

---

## Tâche 6 : vérifier que la CI garde la projection honnête

**Fichiers :** aucun — vérification seule

- [ ] **Étape 1 : introduire délibérément une divergence**

```bash
printf '\nexport type Divergence = never\n' >> src/domain/config.ts
pnpm domain:check
```

Attendu : ÉCHEC, `git diff --exit-code` rendant un diff non vide.

- [ ] **Étape 2 : rétablir**

```bash
git checkout src/domain/config.ts
pnpm domain:check
```

Attendu : PASS.

- [ ] **Étape 3 : consigner**

Ajouter à `REPRISE.md`, § 3, la ligne : le garde-fou de projection a été **réexercé** en
`05d` sur un changement de forme réel, pas seulement sur un champ ajouté.

```bash
git add REPRISE.md && git commit -m "docs: 05d — garde-fou de projection réexercé sur un changement de forme"
```

---

## Terminé quand

Les huit critères de `specs/05d-proxy-en-enumeration.md` § « Terminé quand » sont vérifiés.
Deux ne se lisent pas dans un test et demandent une observation explicite, consignée dans le
commit ou dans `REPRISE.md` :

- le refus de compilation d'un `match` non exhaustif (tâche 2) ;
- l'échec de `pnpm domain:check` sur divergence (tâche 6).
