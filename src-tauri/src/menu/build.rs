//! Construit le menu natif de Tauri depuis [`super::MenuSpec`]. Ce module ne décrit rien —
//! ça, c'est `mod.rs` — il traduit la description en appels muda.
//!
//! **Les tests de ce module vivent dans `tests/menu_build.rs`, pas ici.** Construire un
//! vrai menu avec `tauri::test::mock_app()` appelle muda, qui sur macOS exige d'être
//! appelé depuis le thread principal du **processus** (`MainThreadMarker::new()`,
//! `platform_impl/macos/mod.rs`) — pas un thread quelconque nommé « thread 1 ». Le harness
//! `libtest` par défaut exécute chaque `#[test]` sur un thread de travail qu'il spawn lui-
//! même : jamais le vrai thread principal. Un test de ce module paniquerait donc
//! systématiquement avec « can only be created on the main thread », y compris à
//! `--test-threads=1`. `tests/menu_build.rs` porte `harness = false` (déclaré dans
//! `Cargo.toml`) : son `main()` est appelé directement par cargo sur le thread principal
//! réel, seul terrain où muda peut construire quoi que ce soit sur macOS.

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

use super::{Item, MenuSpec, Predefini};

/// Construit le menu natif depuis [`MenuSpec::actuelle`], en remplacement du menu par
/// défaut de Tauri.
pub fn construire<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let spec = MenuSpec::actuelle();
    let mut sous_menus: Vec<Submenu<R>> = Vec::with_capacity(spec.sous_menus.len());

    for sous_menu in &spec.sous_menus {
        let items: Vec<Box<dyn IsMenuItem<R>>> = sous_menu
            .items
            .iter()
            .map(|item| construire_item(app, item))
            .collect::<tauri::Result<_>>()?;
        let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(AsRef::as_ref).collect();
        sous_menus.push(Submenu::with_id_and_items(
            app,
            sous_menu.id,
            sous_menu.libelle,
            true,
            &refs,
        )?);
    }

    let refs: Vec<&dyn IsMenuItem<R>> = sous_menus
        .iter()
        .map(|sous_menu| sous_menu as &dyn IsMenuItem<R>)
        .collect();
    Menu::with_items(app, &refs)
}

fn construire_item<R: Runtime>(
    app: &AppHandle<R>,
    item: &Item,
) -> tauri::Result<Box<dyn IsMenuItem<R>>> {
    Ok(match item {
        Item::Separateur => Box::new(PredefinedMenuItem::separator(app)?),
        Item::Predefini(predefini) => construire_predefini(app, *predefini)?,
        Item::Commande {
            id,
            libelle,
            accelerateur,
        } => Box::new(MenuItem::with_id(app, *id, *libelle, true, *accelerateur)?),
    })
}

/// Le seul endroit qui fasse correspondre un [`Predefini`] à son constructeur muda. Aucun
/// bras `_ =>` : ajouter une variante à `Predefini` sans l'appairer ici doit casser cette
/// compilation, pas disparaître en silence dans un menu construit que rien d'autre ne voit.
fn construire_predefini<R: Runtime>(
    app: &AppHandle<R>,
    predefini: Predefini,
) -> tauri::Result<Box<dyn IsMenuItem<R>>> {
    let libelle = Some(predefini.libelle());
    let item: Box<dyn IsMenuItem<R>> = match predefini {
        Predefini::APropos => Box::new(PredefinedMenuItem::about(app, libelle, None)?),
        Predefini::Services => Box::new(PredefinedMenuItem::services(app, libelle)?),
        Predefini::Masquer => Box::new(PredefinedMenuItem::hide(app, libelle)?),
        Predefini::MasquerLesAutres => Box::new(PredefinedMenuItem::hide_others(app, libelle)?),
        Predefini::Quitter => Box::new(PredefinedMenuItem::quit(app, libelle)?),
        Predefini::FermerFenetre => Box::new(PredefinedMenuItem::close_window(app, libelle)?),
        Predefini::Annuler => Box::new(PredefinedMenuItem::undo(app, libelle)?),
        Predefini::Retablir => Box::new(PredefinedMenuItem::redo(app, libelle)?),
        Predefini::Couper => Box::new(PredefinedMenuItem::cut(app, libelle)?),
        Predefini::Copier => Box::new(PredefinedMenuItem::copy(app, libelle)?),
        Predefini::Coller => Box::new(PredefinedMenuItem::paste(app, libelle)?),
        Predefini::ToutSelectionner => Box::new(PredefinedMenuItem::select_all(app, libelle)?),
        Predefini::PleinEcran => Box::new(PredefinedMenuItem::fullscreen(app, libelle)?),
        Predefini::Reduire => Box::new(PredefinedMenuItem::minimize(app, libelle)?),
        Predefini::Zoom => Box::new(PredefinedMenuItem::maximize(app, libelle)?),
    };
    Ok(item)
}
