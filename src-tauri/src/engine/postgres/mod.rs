//! Adaptateur PostgreSQL. Voir `specs/06b-connexion-postgresql.md`.

#[cfg(all(test, feature = "db-tests"))]
mod tests_db {
    /// CONTRÔLE NÉGATIF TEMPORAIRE — doit faire échouer le job Linux de la CI.
    ///
    /// S'il passe, c'est que le job ne lance pas les tests de base, et que tout l'adaptateur
    /// partirait non vérifié. À retirer une fois la CI constatée rouge sur ce seul job.
    #[test]
    fn controle_negatif_le_job_linux_execute_bien_les_tests_de_base() {
        panic!("contrôle négatif — le job Linux doit échouer ici");
    }
}
