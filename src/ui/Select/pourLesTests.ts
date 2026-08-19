import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Choisir une option dans une `ListeDeroulante`, depuis un test.
 *
 * # Pourquoi ce fichier existe
 *
 * `userEvent.selectOptions` ne parle qu'aux `<select>` natifs : il lit `HTMLSelectElement.options` et
 * déclenche `change`. Le remplacement du natif par un composant maison a donc cassé dix-huit tests
 * d'un coup, tous pour la même raison — non pas qu'ils vérifiaient le natif, mais qu'ils **le
 * pilotaient**.
 *
 * Le geste réel est en deux temps : ouvrir la liste, puis cliquer l'option. L'écrire une fois ici
 * évite de le recopier dix-huit fois, et laisse un seul endroit à corriger si le motif change.
 *
 * **Ce n'est pas un utilitaire de complaisance** : il passe par les rôles ARIA — `combobox`, puis
 * `option` — donc il échouerait si le composant cessait de les porter. Un test qui interrogerait les
 * classes CSS, lui, resterait vert sur un composant devenu inaccessible.
 */
export async function choisirDansLaListe(nomDuChamp: string | RegExp, libelleDeLOption: string) {
  const utilisateur = userEvent.setup()
  const champ = screen.getByRole('combobox', { name: nomDuChamp })
  await utilisateur.click(champ)
  // La liste est nommée comme le champ : deux listes ouvertes en même temps ne peuvent pas arriver,
  // mais chercher l'option dans **sa** liste rend le test lisible.
  const liste = screen.getByRole('listbox')
  await utilisateur.click(within(liste).getByRole('option', { name: libelleDeLOption }))
}

/**
 * Les libellés des options d'une `ListeDeroulante`, dans l'ordre.
 *
 * **Il faut ouvrir la liste pour les lire, et c'est le point.** Le natif gardait ses `<option>` dans le
 * DOM en permanence : plusieurs tests interrogeaient donc `combobox.querySelectorAll('option')` sans
 * jamais l'ouvrir. Un panneau monté mais invisible mettrait ses options dans l'arbre d'accessibilité,
 * où un lecteur d'écran les annoncerait sans qu'on ait rien demandé — la liste maison ne les rend donc
 * qu'ouverte, et les tests passent par le geste.
 */
export async function optionsDeLaListe(nomDuChamp: string | RegExp): Promise<string[]> {
  const utilisateur = userEvent.setup()
  await utilisateur.click(screen.getByRole('combobox', { name: nomDuChamp }))
  const options = within(screen.getByRole('listbox')).getAllByRole('option')
  const libelles = options.map((option) => option.textContent ?? '')
  // Refermée : un test qui laisse une liste ouverte fait échouer le suivant sur un `listbox` inattendu.
  await utilisateur.keyboard('{Escape}')
  return libelles
}
