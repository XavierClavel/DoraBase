//! L'inspection d'un fichier de dump **avant** de le rejouer : en-tête de version, et pied
//! de complétude.
//!
//! # Le défaut qui a rendu ce fichier nécessaire
//!
//! Mesuré le 19 août 2026 contre PostgreSQL 17.6 avec `psql` 17.4 : **un dump tronqué au
//! milieu d'un bloc `COPY` s'importe partiellement et en silence.** Le dump complet de
//! `dorabase_test` coupé à 60 000 lignes puis rejoué avec
//! `psql --single-transaction --set ON_ERROR_STOP=on` rend `exit=0`, aucun message, et une
//! base cible portant 59 646 lignes sur 100 000 dans une table, les autres vides.
//!
//! La cause : `psql` lit les données de `COPY … FROM stdin` jusqu'au `\.` terminal. En
//! atteignant la fin de fichier avant, il traite l'EOF comme la **fin normale** des données.
//! La `COPY` réussit, le script se termine proprement, la transaction est **committée**.
//! `ON_ERROR_STOP` n'a aucune erreur sur laquelle se déclencher, parce qu'il n'y en a
//! aucune.
//!
//! Le remède est dans le fichier lui-même : `pg_dump --format=plain` termine par un pied,
//! absent d'un fichier tronqué. Il est donc lu ici, avant tout lancement.

use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use super::commands::DumpFailure;
use super::Version;

/// L'en-tête que `pg_dump --format=plain` écrit en cinquième ligne. Mesuré :
/// `-- Dumped from database version 17.6 (Debian 17.6-1.pgdg13+1)`.
const MARQUEUR_EN_TETE: &str = "-- Dumped from database version";

/// Le pied que `pg_dump --format=plain` écrit en dernier, et qu'un fichier tronqué n'a pas.
pub const MARQUEUR_PIED: &str = "-- PostgreSQL database dump complete";

/// Combien d'octets lire à chaque extrémité.
///
/// **Jamais le fichier entier** : un dump se compte en gigaoctets, et l'en-tête comme le
/// pied tiennent en dix lignes. 8 kio laissent de la marge pour les `SET` de tête.
const FENETRE: u64 = 8 * 1024;

/// Ce que la lecture des deux extrémités permet de dire, et rien de plus.
///
/// **Au-delà de l'en-tête et du pied, rien n'est validé** : le corps est un script SQL
/// arbitraire, et prétendre le vérifier serait mentir.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
#[ts(export_to = "dump.ts")]
pub enum Inspection {
    /// Un dump `pg_dump` complet, de la version annoncée.
    PgDump {
        origine: Version,
    },
    /// En-tête `pg_dump` présent, pied **absent** : le fichier est incomplet.
    Tronque,
    /// Le dump vient d'une majeure plus récente que la cible.
    TropRecent {
        origine: Version,
        cible: Version,
    },
    /// Aucun en-tête `pg_dump` reconnaissable : fichier étranger, accepté tel quel et
    /// **sans** contrôle de pied. Son échec éventuel sera rapporté par `psql`.
    Etranger,
    Vide,
    /// Le fichier n'a pas pu être lu — absent, droits, chemin devenu faux.
    Illisible {
        cause: String,
    },
}

/// Inspecte un fichier de dump face à la version du serveur cible.
///
/// L'ordre des règles **compte** : un fichier étranger n'a pas de pied à exiger, et un
/// fichier tronqué doit être refusé même si sa version est compatible.
pub fn inspecter(chemin: &Path, cible: Version) -> Inspection {
    let (tete, pied) = match extremites(chemin) {
        Ok(extremites) => extremites,
        Err(cause) => {
            return Inspection::Illisible {
                cause: cause.to_string(),
            }
        }
    };

    if tete.trim().is_empty() {
        return Inspection::Vide;
    }

    let Some(origine) = version_annoncee(&tete) else {
        return Inspection::Etranger;
    };

    if !pied.contains(MARQUEUR_PIED) {
        return Inspection::Tronque;
    }

    // La comparaison porte sur la **majeure** : un dump 17.6 se rejoue sur un serveur 17.4.
    if origine.majeure > cible.majeure {
        return Inspection::TropRecent { origine, cible };
    }

    Inspection::PgDump { origine }
}

/// Le refus, ou le feu vert, en une valeur que la commande peut rendre au front.
///
/// `Etranger` **passe** : un fichier venu d'ailleurs est accepté tel quel, et son échec
/// éventuel sera rapporté par `psql` avec la ligne fautive.
pub fn exiger_importable(chemin: &Path, cible: Version) -> Result<Inspection, DumpFailure> {
    let inspection = inspecter(chemin, cible);
    match &inspection {
        Inspection::PgDump { .. } | Inspection::Etranger => Ok(inspection),
        Inspection::Tronque => Err(super::run::DumpError::Tronque.into()),
        Inspection::TropRecent { origine, cible } => Err(DumpFailure {
            kind: "tropRecent".into(),
            message: format!(
                "ce dump vient d'un PostgreSQL {origine}, plus récent que le serveur cible \
                 ({cible}) : l'import a été refusé avant de lancer psql"
            ),
        }),
        Inspection::Vide => Err(DumpFailure {
            kind: "vide".into(),
            message: "le fichier est vide : il n'y a rien à importer".into(),
        }),
        Inspection::Illisible { cause } => Err(DumpFailure {
            kind: "illisible".into(),
            message: format!("le fichier n'a pas pu être lu : {cause}"),
        }),
    }
}

/// La version annoncée par l'en-tête, ou `None` si le fichier n'est pas un `pg_dump`.
fn version_annoncee(tete: &str) -> Option<Version> {
    let ligne = tete
        .lines()
        .find(|ligne| ligne.starts_with(MARQUEUR_EN_TETE))?;
    // La suite de la ligne est `17.6 (Debian 17.6-1.pgdg13+1)` : le premier jeton chiffré
    // est la version, et `analyser_version` sait déjà en tirer la majeure et la mineure.
    super::discover::analyser_version(&ligne[MARQUEUR_EN_TETE.len()..])
}

/// Les deux extrémités du fichier, sans jamais le lire en entier.
fn extremites(chemin: &Path) -> std::io::Result<(String, String)> {
    let mut fichier = std::fs::File::open(chemin)?;
    let taille = fichier.metadata()?.len();

    let mut tete = vec![0u8; FENETRE.min(taille) as usize];
    fichier.read_exact(&mut tete)?;

    let depart = taille.saturating_sub(FENETRE);
    fichier.seek(SeekFrom::Start(depart))?;
    let mut pied = Vec::new();
    fichier.read_to_end(&mut pied)?;

    Ok((
        String::from_utf8_lossy(&tete).into_owned(),
        String::from_utf8_lossy(&pied).into_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// L'en-tête **réel**, recopié d'un dump produit par `pg_dump` 17.4 contre le serveur
    /// 17.6 du conteneur de test. Un en-tête inventé aurait testé l'invention.
    const EN_TETE_REEL: &str = "\
--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6 (Debian 17.6-1.pgdg13+1)
-- Dumped by pg_dump version 17.4 (Homebrew)
";

    const PIED_REEL: &str = "\
--
-- PostgreSQL database dump complete
--
";

    fn fichier_avec(
        tete: &str,
        corps: &str,
        pied: &str,
    ) -> (tempfile::TempDir, std::path::PathBuf) {
        let dossier = tempfile::tempdir().expect("dossier temporaire");
        let chemin = dossier.path().join("dump.sql");
        std::fs::write(&chemin, format!("{tete}{corps}{pied}")).expect("écriture");
        (dossier, chemin)
    }

    #[test]
    fn un_fichier_complet_est_accepte() {
        let (_d, f) = fichier_avec(EN_TETE_REEL, "SELECT 1;\n", PIED_REEL);
        assert!(matches!(
            inspecter(&f, Version::new(17, 6)),
            Inspection::PgDump { origine } if origine.majeure == 17 && origine.mineure == 6
        ));
    }

    #[test]
    fn un_fichier_tronque_est_refuse_sans_lancer_psql() {
        // LE test de cette spec. Sans lui, `psql` importe 59 646 lignes sur 100 000 avec
        // exit=0 — mesuré le 19 août 2026.
        let (_d, f) = fichier_avec(EN_TETE_REEL, "COPY public.t (a) FROM stdin;\n1\n2\n", "");
        assert_eq!(inspecter(&f, Version::new(17, 6)), Inspection::Tronque);
        // Et le refus est bien un refus, pas seulement un verdict.
        assert!(exiger_importable(&f, Version::new(17, 6)).is_err());
    }

    #[test]
    fn un_dump_plus_recent_que_la_cible_est_signale() {
        let en_tete = EN_TETE_REEL.replace("version 17.6", "version 18.1");
        let (_d, f) = fichier_avec(&en_tete, "SELECT 1;\n", PIED_REEL);
        assert!(matches!(
            inspecter(&f, Version::new(17, 6)),
            Inspection::TropRecent { origine, cible }
                if origine.majeure == 18 && cible.majeure == 17
        ));
    }

    #[test]
    fn un_dump_plus_ancien_que_la_cible_passe() {
        // Contrôle positif du test précédent : sans lui, `TropRecent` pourrait être rendu
        // pour toute version différente, et le sens de la règle serait perdu.
        let en_tete = EN_TETE_REEL.replace("version 17.6", "version 15.4");
        let (_d, f) = fichier_avec(&en_tete, "SELECT 1;\n", PIED_REEL);
        assert!(matches!(
            inspecter(&f, Version::new(17, 6)),
            Inspection::PgDump { .. }
        ));
    }

    #[test]
    fn un_fichier_etranger_est_accepte_sans_controle_de_pied() {
        // Pas d'en-tête pg_dump : le fichier est étranger, et le pied n'est pas exigé.
        let (_d, f) = fichier_avec(
            "",
            "CREATE TABLE t (a int);\nINSERT INTO t VALUES (1);\n",
            "",
        );
        assert_eq!(inspecter(&f, Version::new(17, 6)), Inspection::Etranger);
        assert!(exiger_importable(&f, Version::new(17, 6)).is_ok());
    }

    #[test]
    fn un_fichier_vide_est_refuse() {
        let (_d, f) = fichier_avec("", "", "");
        assert_eq!(inspecter(&f, Version::new(17, 6)), Inspection::Vide);
        assert!(exiger_importable(&f, Version::new(17, 6)).is_err());
    }

    #[test]
    fn un_fichier_absent_est_illisible_et_non_vide() {
        // Les confondre dirait « rien à importer » d'un chemin qui n'existe pas.
        let verdict = inspecter(
            std::path::Path::new("/inexistant-22c.sql"),
            Version::new(17, 6),
        );
        assert!(
            matches!(verdict, Inspection::Illisible { .. }),
            "{verdict:?}"
        );
    }

    #[test]
    fn le_pied_est_trouve_meme_apres_un_gros_corps() {
        // La fenêtre de lecture ne doit pas dépendre de la taille du fichier : un dump réel
        // fait des centaines de mégaoctets, et lire le tout serait le défaut évident.
        let corps = "-- remplissage\n".repeat(100_000);
        let (_d, f) = fichier_avec(EN_TETE_REEL, &corps, PIED_REEL);
        assert!(matches!(
            inspecter(&f, Version::new(17, 6)),
            Inspection::PgDump { .. }
        ));
    }
}
