//! Modèle de configuration : ce que l'utilisateur déclare — projets, bases, et leurs
//! déclinaisons par environnement. Voir `specs/05a-modele-configuration.md`.
//!
//! Ce module est **pur** : ni lecture, ni écriture, ni connexion. La persistance vient
//! avec `05b`, les secrets avec `05c`, l'introspection des bases avec `06`.

mod model;

pub use model::{
    Database, Engine, Environment, EnvironmentVariant, ModelError, Project, SecretRef, SslMode,
    Tunnel, TunnelKind,
};
