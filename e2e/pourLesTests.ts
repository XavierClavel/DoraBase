import type { Page } from '@playwright/test'

/**
 * Déplie un projet, puis l'un de ses environnements, pour rendre ses connexions visibles.
 *
 * **L'arbre a cinq paliers depuis `25a`** : projet → environnement → connexion → console|schéma →
 * objet. Tous les environnements déclarés du projet sont listés, chacun dépliable indépendamment ; il
 * n'y a plus d'« environnement actif » dont l'arbre montrerait les seules connexions. Toute chaîne de
 * dépliage gagne donc un clic, et trente specs le recopieraient — d'où ce helper, à l'image
 * d'`ouvrirUneConsole` : le jour où un sixième palier arrive, il n'arrive qu'ici.
 *
 * Les valeurs par défaut sont celles du décor de `/?demo` : le projet « Atelier Nord », dont
 * l'environnement `prod` porte les deux connexions (`analytics` et `evenements`).
 *
 * **Le dépliage est un double-clic, et le clic simple ne déplie plus.** Il faisait les deux —
 * sélectionner et déplier — et regarder une connexion refermait le sous-arbre qu'on venait d'ouvrir.
 * Les deux voies sont désormais la flèche et le double-clic ; c'est le second que les specs
 * empruntent, la flèche faisant onze pixels et sa zone attrapable étant un pseudo-élément qui ne se
 * vise qu'au point. Le double-clic **sélectionne aussi** — ses deux clics font leur travail avant que
 * le geste ne déplie — donc une spec qui attend une ligne dépliée *et* désignée n'a rien à ajouter.
 *
 * **Le motif de l'environnement est ancré**, et ce n'est pas une précaution : le décor déclare
 * `preprod` à côté de `prod`, et `/prod/` désigne les deux — Playwright refuse alors de cliquer, la
 * résolution étant stricte. Le nom accessible d'une ligne d'environnement commence par son libellé,
 * suivi de son compte de connexions et de son badge (« prod 2 connexions PROD »), donc `^prod\b`
 * n'en désigne qu'une.
 */
export async function deplierUnEnvironnement(
  page: Page,
  environnement = 'prod',
  projet = 'Atelier Nord',
): Promise<void> {
  await page.getByRole('treeitem', { name: new RegExp(projet) }).dblclick()
  await page.getByRole('treeitem', { name: new RegExp(`^${environnement}\\b`) }).dblclick()
}

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
