import type { Page } from '@playwright/test'

/**
 * Ouvre une console sur une connexion, depuis le menu « … » de sa ligne.
 *
 * **C'est le seul chemin depuis le 20 août 2026.** Le pied de la sidebar portait un bouton
 * « Nouvelle console », que huit specs employaient ; il a été retiré, une console appartenant à une
 * connexion et le pied ne sachant pas laquelle. Un helper plutôt que la séquence recopiée huit fois :
 * le jour où ce chemin change encore, il ne change qu'ici.
 *
 * La connexion doit être **visible dans l'arbre** — donc son projet déplié.
 *
 * **Le survol est obligatoire, et ce n'est pas une précaution.** Le « … » d'une ligne est en
 * `visibility: hidden` hors survol (`TreeRow.module.css`) : la boîte garde sa place pour que le méta
 * de la ligne ne bouge pas d'un pixel, mais Playwright refuse de cliquer un élément invisible. Sans
 * ce `hover`, l'attente expire au bout de trente secondes sans rien dire d'utile.
 */
export async function ouvrirUneConsole(page: Page, connexion: string): Promise<void> {
  await page
    .getByRole('treeitem', { name: new RegExp(connexion) })
    .first()
    .hover()
  await page.getByRole('button', { name: `Actions de ${connexion}` }).click()
  await page.getByRole('button', { name: /Nouvelle console/ }).click()
}
