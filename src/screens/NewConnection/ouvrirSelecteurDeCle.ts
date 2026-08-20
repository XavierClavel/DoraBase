import { open } from '@tauri-apps/plugin-dialog'

/**
 * Ouvre le sélecteur de fichier de la clé privée, et rend son chemin.
 *
 * **Isolé dans son propre fichier**, et injecté dans `NewConnection` plutôt qu'appelé
 * directement : le plugin `dialog` ne répond que dans la webview de Tauri. Sous Vitest,
 * l'import lui-même passe mais l'appel rejette — un test du câblage du bouton devrait donc
 * simuler le module entier. Un paramètre suffit, et laisse ce fichier comme seul point de
 * contact avec le plugin.
 *
 * **La permission accordée est `dialog:allow-open`, et rien d'autre.** `dialog:default`
 * ajouterait `allow-save`, `allow-message`, `allow-ask` et `allow-confirm` — dont une qui
 * écrit sur le disque. Gardé par `src-tauri/tests/permissions.rs`.
 *
 * **Aucune lecture du fichier ici.** `06e` lit la clé à l'ouverture du tunnel, avec un
 * message qui nomme le chemin et le panneau en cas d'échec. Lire une clé privée pour
 * « valider » la saisie ferait entrer de la matière privée dans l'écran sans nécessité — et
 * un chemin peut devenir valable entre la saisie et la connexion.
 */
export async function ouvrirSelecteurDeCle(): Promise<string | null> {
  const choisi = await open({
    multiple: false,
    directory: false,
    title: 'Choisir une clé privée SSH',
    // `~/.ssh` est masqué dans le sélecteur de macOS ; le filtre ne sert donc qu'à guider
    // vers les noms usuels, sans empêcher de saisir un chemin quelconque.
    filters: [{ name: 'Clé privée', extensions: ['pem', 'key', ''] }],
  })

  // Le plugin rend `null` sur annulation, ou une chaîne quand `multiple: false`. Le tableau
  // est impossible ici, mais TypeScript ne le sait pas depuis la signature.
  return typeof choisi === 'string' ? choisi : null
}

/**
 * Ouvre le sélecteur du fichier de compte de service Google, et rend son chemin.
 *
 * **Dans ce fichier et non dans un module de plus** : les deux ne font qu'appeler le plugin
 * `dialog`, et c'est précisément ce fichier qui existe pour être le seul point de contact avec
 * lui. Les séparer multiplierait les endroits à simuler sous Vitest.
 *
 * **Aucune permission à ajouter.** `dialog:allow-open` est déjà accordée par `08c`, et elle
 * suffit : ouvrir un second sélecteur n'est pas une seconde capacité. Gardé par
 * `src-tauri/tests/permissions.rs`, qui compte les permissions et échouerait si l'on avait
 * pris `dialog:default`.
 *
 * **Aucune lecture du fichier ici**, comme pour la clé privée : il porte la clé privée d'un
 * compte de service, et la lire pour « valider » la saisie ferait entrer de la matière privée
 * dans l'écran sans nécessité. `06g` le passe au proxy, qui le lit.
 */
export async function ouvrirSelecteurDeCompteDeService(): Promise<string | null> {
  const choisi = await open({
    multiple: false,
    directory: false,
    title: 'Choisir un fichier de compte de service Google',
    // Google distribue ces clés en JSON. Le filtre guide sans empêcher de saisir un chemin
    // quelconque — même principe que pour la clé SSH.
    filters: [{ name: 'Compte de service', extensions: ['json'] }],
  })

  return typeof choisi === 'string' ? choisi : null
}
