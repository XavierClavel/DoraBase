//! Fonctions pures sur le modèle de configuration : résoudre, filtrer, valider.
//! Aucune I/O, aucun état — tout est testable sans système de fichiers.

use super::model::{Database, Environment, EnvironmentVariant, ModelError, Project};

/// La variante de `database` pour l'environnement actif de `project`.
///
/// Rend `None` quand la base n'est pas déclarée dans cet environnement — état réel du
/// domaine, pas une erreur : le handoff pose 1..n environnements, pas n.
pub fn active_variant<'a>(
    project: &Project,
    database: &'a Database,
) -> Option<&'a EnvironmentVariant> {
    database.variant(project.active_environment)
}

/// Les bases du projet déclarées dans `environment`.
///
/// C'est ce qui répond à « que montre l'arbre après un basculement d'environnement » :
/// une base absente de l'environnement cible n'a pas de serveur où se connecter.
/// Comment l'arbre la présente reste à trancher par `09` — le handoff ne le maquette pas.
pub fn databases_available(project: &Project, environment: Environment) -> Vec<&Database> {
    project
        .databases
        .iter()
        .filter(|database| database.variant(environment).is_some())
        .collect()
}

/// Vérifie la cohérence d'un projet entier.
///
/// Les invariants d'une base sont déjà garantis par `Database::new` ; il reste ceux qui
/// portent sur l'ensemble, et qu'aucun constructeur ne peut voir seul.
pub fn validate(project: &Project) -> Result<(), ModelError> {
    for (index, database) in project.databases.iter().enumerate() {
        if project.databases[..index]
            .iter()
            .any(|precedente| precedente.name == database.name)
        {
            return Err(ModelError::NomDeBaseEnDouble {
                project: project.name.clone(),
                database: database.name.clone(),
            });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::{Engine, SslMode};

    fn variante(env: Environment) -> EnvironmentVariant {
        EnvironmentVariant {
            environment: env,
            host: "db.internal".into(),
            port: 5432,
            default_database: "analytics".into(),
            username: "dora_ro".into(),
            password: None,
            ssl_mode: SslMode::Require,
            read_only: true,
            reconnect_on_startup: false,
            tunnel: None,
        }
    }

    /// `analytics` en dev + prod, `shop` en dev seulement. Environnement actif : prod.
    fn projet_de_test() -> Project {
        Project {
            name: "Atelier Nord".into(),
            active_environment: Environment::Prod,
            queries: Vec::new(),
            databases: vec![
                Database::new(
                    "analytics",
                    Engine::PostgreSql,
                    vec![variante(Environment::Dev), variante(Environment::Prod)],
                )
                .unwrap(),
                Database::new("shop", Engine::MySql, vec![variante(Environment::Dev)]).unwrap(),
            ],
        }
    }

    #[test]
    fn la_variante_active_suit_l_environnement_du_projet() {
        let projet = projet_de_test();
        let base = &projet.databases[0];
        let variante = active_variant(&projet, base).expect("prod existe sur cette base");
        assert_eq!(variante.environment, Environment::Prod);
    }

    #[test]
    fn une_base_absente_de_l_environnement_courant_ne_rend_rien() {
        let projet = projet_de_test();
        // `shop` n'est déclarée qu'en dev, or le projet est en prod.
        let base = &projet.databases[1];
        assert!(active_variant(&projet, base).is_none());
    }

    #[test]
    fn changer_l_environnement_du_projet_change_la_variante_resolue() {
        let mut projet = projet_de_test();
        let attendu_en_prod =
            active_variant(&projet, &projet.databases[0]).map(|variante| variante.environment);
        projet.active_environment = Environment::Dev;
        let attendu_en_dev =
            active_variant(&projet, &projet.databases[0]).map(|variante| variante.environment);

        assert_eq!(attendu_en_prod, Some(Environment::Prod));
        assert_eq!(attendu_en_dev, Some(Environment::Dev));
    }

    #[test]
    fn les_bases_disponibles_excluent_celles_absentes_de_l_environnement() {
        let projet = projet_de_test();
        assert_eq!(databases_available(&projet, Environment::Prod).len(), 1);
        assert_eq!(databases_available(&projet, Environment::Dev).len(), 2);
        assert_eq!(databases_available(&projet, Environment::Staging).len(), 0);
    }

    #[test]
    fn un_projet_sans_base_est_valide() {
        // C'est l'état créé par « Nouveau projet » en A1, avant toute connexion déclarée.
        let projet = Project {
            name: "Neuf".into(),
            active_environment: Environment::Dev,
            queries: Vec::new(),
            databases: vec![],
        };
        assert!(validate(&projet).is_ok());
    }

    #[test]
    fn un_projet_coherent_est_valide() {
        assert!(validate(&projet_de_test()).is_ok());
    }

    #[test]
    fn deux_bases_de_meme_nom_dans_un_projet_sont_refusees() {
        let projet = Project {
            name: "Atelier Nord".into(),
            active_environment: Environment::Dev,
            queries: Vec::new(),
            databases: vec![
                Database::new(
                    "analytics",
                    Engine::PostgreSql,
                    vec![variante(Environment::Dev)],
                )
                .unwrap(),
                Database::new("analytics", Engine::MySql, vec![variante(Environment::Dev)])
                    .unwrap(),
            ],
        };
        assert!(matches!(
            validate(&projet),
            Err(ModelError::NomDeBaseEnDouble { .. })
        ));
    }
}
