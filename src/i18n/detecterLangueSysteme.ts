import type { Locale } from './types'

/**
 * La langue du système, pour le réglage « Système » de `Preferences.language`.
 *
 * **`navigator.language`, pas un plugin Tauri.** La webview la porte déjà, sans dépendance
 * Rust ni aller-retour IPC — le même arbitrage que le port dans `18b` : le champ existe déjà,
 * pas besoin d'aller le chercher ailleurs. Seul le préfixe compte (`fr-CA` vaut `fr`), et tout
 * le reste retombe sur l'anglais — la seule langue que l'application peut promettre de ne
 * jamais manquer.
 */
export function detecterLangueSysteme(): Locale {
  const brute = typeof navigator === 'undefined' ? '' : navigator.language
  return brute.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
