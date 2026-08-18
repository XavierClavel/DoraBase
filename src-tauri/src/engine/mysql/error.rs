//! Les échecs du pilote MySQL (`16a`).
//!
//! **Quatre familles au moins, chacune avec sa manœuvre** — la règle de `06b`, reprise en `18b`.
//!
//! **Aucun message ne contient le mot de passe.** Le pilote cite l'URL dans certaines de ses erreurs,
//! et une URL porte les identifiants : la propriété acquise en `05c` se perdrait ici sans le filtre.

use mysql_async::Error as MysqlError;

use crate::engine::EngineError;

/// L'échec du pilote, dans le modèle de `06a`.
///
/// Le `code` est celui de MySQL quand il y en a un — `1045` pour une authentification refusée,
/// `1049` pour une base inconnue, `1146` pour une table absente. Comme `SQLSTATE` en `06b`, il est
/// repris **tel quel** : c'est lui qui permet à un écran de distinguer les cas sans analyser une
/// chaîne traduite.
pub fn traduire(erreur: &MysqlError) -> EngineError {
    match erreur {
        MysqlError::Server(serveur) => {
            let message = expurger(&serveur.message);
            let manoeuvre = match serveur.code {
                // Les trois codes qu'on voit vraiment, et dont la manœuvre diffère. Les confondre
                // enverrait corriger un mot de passe là où c'est un pare-feu.
                1045 => " Vérifiez l'utilisateur et le mot de passe.",
                1049 => " Vérifiez le nom de la base par défaut.",
                1044 | 1142 => " L'utilisateur existe, mais n'a pas les droits sur cet objet.",
                _ => "",
            };
            EngineError::from_engine(serveur.code.to_string(), format!("{message}{manoeuvre}"))
        }
        MysqlError::Io(source) => EngineError::local(format!(
            "la connexion au serveur MySQL a échoué : {source}. Vérifiez l'hôte, le port, et que le \
             service écoute"
        )),
        MysqlError::Driver(source) => EngineError::local(expurger(&source.to_string())),
        MysqlError::Url(source) => EngineError::local(format!(
            "la déclaration de connexion est inutilisable : {}",
            expurger(&source.to_string())
        )),
        autre => EngineError::local(expurger(&autre.to_string())),
    }
}

/// Retire d'un message ce qui ressemble aux identifiants d'une URL.
///
/// `mysql://utilisateur:motdepasse@hote` devient `mysql://***@hote` — et le nom d'utilisateur part
/// avec, parce que le distinguer demanderait d'analyser l'URL et qu'un faux positif coûterait un
/// secret. Même fonction qu'en `18b`, écrite deux fois : les deux pilotes ont des messages différents,
/// et une abstraction partagée pour dix lignes se lirait moins bien que la règle elle-même.
fn expurger(message: &str) -> String {
    let mut sortie = String::with_capacity(message.len());
    let mut reste = message;
    while let Some(debut) = reste.find("mysql://") {
        let (avant, apres) = reste.split_at(debut + "mysql://".len());
        sortie.push_str(avant);
        let fin_autorite = apres.find(['/', ' ', ',', '"']).unwrap_or(apres.len());
        match apres[..fin_autorite].rfind('@') {
            Some(arobase) => {
                sortie.push_str("***@");
                reste = &apres[arobase + 1..];
            }
            None => reste = apres,
        }
    }
    sortie.push_str(reste);
    sortie
}

/// Distingue MariaDB de MySQL, depuis la chaîne de version du serveur.
///
/// **Les deux répondent au même protocole et divergent sur le catalogue.** Afficher « MySQL » devant
/// une MariaDB serait faux, et c'est le genre d'erreur qui fait chercher longtemps pourquoi une
/// requête d'introspection ne rend rien.
pub fn nom_du_serveur(version: &str) -> String {
    if version.to_lowercase().contains("mariadb") {
        format!("MariaDB {}", version.split('-').next().unwrap_or(version))
    } else {
        format!("MySQL {version}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_url_avec_identifiants_est_expurgee() {
        let message = expurger(
            "cannot connect to mysql://philomene:tr3s-secret@db.exemple.test:3306/atelier",
        );
        assert!(!message.contains("tr3s-secret"), "{message}");
        assert!(!message.contains("philomene"), "{message}");
        // L'hôte reste : c'est ce qui rend le message utile.
        assert!(message.contains("db.exemple.test:3306"), "{message}");
    }

    #[test]
    fn deux_url_dans_le_meme_message_sont_toutes_deux_expurgees() {
        let message = expurger("mysql://a:s1@h1:3306 et mysql://b:s2@h2:3306");
        assert!(!message.contains("s1"), "{message}");
        assert!(!message.contains("s2"), "{message}");
    }

    #[test]
    fn une_url_sans_identifiants_reste_intacte() {
        let message = expurger("connecting to mysql://localhost:3306/atelier failed");
        assert!(
            message.contains("mysql://localhost:3306/atelier"),
            "{message}"
        );
    }

    #[test]
    fn mariadb_ne_se_presente_pas_comme_mysql() {
        // **Les deux divergent sur le catalogue** : afficher le mauvais nom fait chercher longtemps
        // pourquoi une requête d'introspection ne rend rien.
        assert_eq!(
            nom_du_serveur("10.11.6-MariaDB-1:10.11.6+maria~ubu2204"),
            "MariaDB 10.11.6"
        );
        assert_eq!(nom_du_serveur("8.4.0"), "MySQL 8.4.0");
    }
}
