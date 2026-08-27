//! L'implémentation PostgreSQL de `DumpTool`. La seule pour l'instant — les six autres
//! arrivent avec les specs `16`–`21`, et chacune ajoute son fichier sans toucher au reste.

use std::ffi::OsString;
use std::path::Path;

use super::{Cible, DumpTool};

/// `pg_dump` pour l'export, `psql` pour l'import.
pub struct PostgresDumpTool;

impl DumpTool for PostgresDumpTool {
    fn binaire_export(&self) -> &'static str {
        "pg_dump"
    }

    /// **`psql`, et non `pg_restore`** : le format produit est `plain`, donc un script SQL
    /// que seul `psql` rejoue. C'est aussi ce qui rend le fichier lisible et rejouable hors
    /// de DoraBase, ce qui est le point du format `plain`.
    fn binaire_import(&self) -> &'static str {
        "psql"
    }

    /// L'argv de l'export.
    ///
    /// **`--format=plain`** : le fichier doit rester lisible et rejouable par `psql` hors
    /// DoraBase. **`--no-password`** : sans lui, un mot de passe manquant fait attendre un
    /// terminal qui n'existe pas, et le dump semble figé au lieu d'échouer.
    ///
    /// **Aucun mot de passe ici**, jamais : `ps` l'exposerait à tout utilisateur de la
    /// machine. Il passe par `child_env`.
    fn export_argv(&self, cible: &Cible, fichier: &Path) -> Vec<OsString> {
        let mut argv = self.connexion_argv(cible);
        argv.push("--format=plain".into());
        // `--file` plutôt qu'une redirection du `stdout` : `pg_dump` écrit alors lui-même,
        // et la progression se lit sur la taille du fichier. Rien du dump ne traverse
        // l'IPC dans les deux cas — la webview ne reçoit que des octets comptés.
        argv.push("--file".into());
        argv.push(fichier.into());
        argv
    }

    /// L'argv de l'import : **tout ou rien**.
    ///
    /// `ON_ERROR_STOP=on` n'est pas redondant avec `--single-transaction` : sans lui, `psql`
    /// continuerait après l'erreur dans une transaction déjà avortée, et le rapport
    /// désignerait la mauvaise instruction.
    fn import_argv(&self, cible: &Cible, fichier: &Path) -> Vec<OsString> {
        let mut argv = self.connexion_argv(cible);
        argv.push("--single-transaction".into());
        argv.push("--set".into());
        argv.push("ON_ERROR_STOP=on".into());
        argv.push("--file".into());
        argv.push(fichier.into());
        argv
    }

    /// Le secret ne passe **que** par l'environnement du fils.
    ///
    /// Et jamais journalisé : le plugin de log cible `Webview` en développement, donc une
    /// trace égarée imprimerait le mot de passe dans la sortie de `pnpm tauri dev`.
    fn child_env(&self, mot_de_passe: &str) -> Vec<(String, String)> {
        vec![("PGPASSWORD".to_string(), mot_de_passe.to_string())]
    }
}

impl PostgresDumpTool {
    /// La partie commune aux deux argv : où se connecter, et sous quel nom.
    fn connexion_argv(&self, cible: &Cible) -> Vec<OsString> {
        vec![
            "--host".into(),
            cible.hote.clone().into(),
            "--port".into(),
            cible.port.to_string().into(),
            "--username".into(),
            cible.utilisateur.clone().into(),
            "--dbname".into(),
            cible.base.clone().into(),
            // Sans lui, un mot de passe manquant fait attendre un terminal absent : le
            // processus reste bloqué et l'export paraît figé au lieu d'échouer.
            "--no-password".into(),
        ]
    }
}
