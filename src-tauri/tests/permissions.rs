//! Que la surface de permissions Tauri reste **minimale et explicite**.
//!
//! `01` a réduit les permissions de 92 (le jeu par défaut) à six, délibérément. Rien ne
//! gardait ce choix : ajouter `dialog:default` pour un seul sélecteur de fichier aurait
//! ouvert au passage la sauvegarde, les messages et la confirmation — sans qu'aucune
//! vérification ne le remarque.
//!
//! Ce test est en `tests/` et non dans la bibliothèque : il lit un fichier de configuration,
//! pas du code, et n'a aucune raison d'être compilé dans le binaire livré.

use std::collections::BTreeSet;

/// Les permissions attendues, une par ligne, avec la raison de chacune.
///
/// **Modifier cette liste est le geste qui doit être délibéré.** Un ajout ici est visible en
/// revue ; un ajout dans `capabilities/default.json` seul fait échouer ce test.
const ATTENDUES: &[(&str, &str)] = &[
    (
        "core:path:default",
        "résoudre le répertoire de configuration (05b)",
    ),
    ("core:event:default", "les événements de fenêtre"),
    ("core:window:default", "la fenêtre elle-même"),
    ("core:webview:default", "la webview"),
    ("core:app:default", "les métadonnées de l'application"),
    ("core:resources:default", "les ressources embarquées"),
    (
        "core:window:allow-start-dragging",
        "déplacer la fenêtre par sa barre de titre (`data-tauri-drag-region`) — `core:window:default` \
         n'accorde aucune permission d'écriture, et l'attribut seul ne suffisait donc pas",
    ),
    (
        "core:webview:allow-set-webview-zoom",
        "le zoom au geste à pas fin (`useZoom`) — le pas natif de WKWebView va de 10 à 25 % par cran, \
         et aucun réglage ne l'expose ; `core:webview:default` n'accorde que la lecture de position \
         et de taille",
    ),
    (
        "dialog:allow-open",
        "le bouton « Parcourir… » de la clé privée (08c) — ouverture seule",
    ),
    (
        "dialog:allow-save",
        "le sélecteur de destination du dump (22b) — sauvegarde seule, pas `dialog:default`",
    ),
    (
        "log:allow-log",
        "les journaux du front, qui rendent le pont IPC observable (08d) — `log` seul",
    ),
];

fn permissions_declarees() -> Vec<String> {
    let chemin = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json");
    let brut =
        std::fs::read_to_string(chemin).expect("capabilities/default.json doit être lisible");
    let json: serde_json::Value = serde_json::from_str(&brut).expect("JSON valable");

    json["permissions"]
        .as_array()
        .expect("le tableau `permissions`")
        .iter()
        .map(|valeur| {
            valeur
                .as_str()
                .expect("les permissions de ce projet sont toutes des chaînes")
                .to_owned()
        })
        .collect()
}

#[test]
fn la_liste_des_permissions_est_exactement_celle_qui_est_justifiee() {
    let declarees: BTreeSet<String> = permissions_declarees().into_iter().collect();
    let attendues: BTreeSet<String> = ATTENDUES.iter().map(|(nom, _)| (*nom).to_owned()).collect();

    let en_trop: Vec<_> = declarees.difference(&attendues).collect();
    let manquantes: Vec<_> = attendues.difference(&declarees).collect();

    assert!(
        en_trop.is_empty(),
        "permission(s) non justifiée(s) : {en_trop:?} — ajoutez-la à ATTENDUES avec sa raison, \
         ou retirez-la de capabilities/default.json"
    );
    assert!(
        manquantes.is_empty(),
        "permission(s) manquante(s) : {manquantes:?}"
    );
}

/// Le cas précis que `08c` demande de refuser.
///
/// Le sélecteur de fichier n'a besoin que de l'**ouverture**. `dialog:default` accorde aussi
/// `allow-save`, `allow-message`, `allow-ask` et `allow-confirm` : quatre capacités que rien
/// dans le produit ne réclame, dont une qui écrit sur le disque.
#[test]
fn aucune_permission_par_defaut_de_plugin_n_est_prise() {
    for permission in permissions_declarees() {
        let est_core = permission.starts_with("core:");
        let est_defaut = permission.ends_with(":default");
        assert!(
            est_core || !est_defaut,
            "« {permission} » prend le jeu par défaut d'un plugin. Nommez les capacités une \
             par une — `dialog:allow-open` plutôt que `dialog:default`."
        );
    }
}

#[test]
fn la_surface_reste_tres_inferieure_au_jeu_par_defaut_de_tauri() {
    // 92 permissions dans le jeu par défaut, relevé au plan `01`. Le chiffre exact importe
    // moins que l'ordre de grandeur : ce test attrape une dérive lente.
    let compte = permissions_declarees().len();
    assert!(
        compte <= 12,
        "{compte} permissions : la surface dérive (six au plan 01, sept depuis 08c, huit depuis 10g)"
    );
}
