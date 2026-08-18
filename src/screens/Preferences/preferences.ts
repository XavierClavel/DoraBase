import type { Accent, Preferences, Theme } from '../../domain/config'

/**
 * Ce que les préférences règlent, en fonctions **pures** (`15a` → `15d`).
 *
 * Isolé du rendu pour la raison habituelle : l'application des jetons, les bornes et la contrainte
 * du corps de police sur la densité se testent sans DOM.
 */

/** Les valeurs par défaut, **les mêmes que côté Rust**. Voir `PREFERENCES_PAR_DEFAUT` ci-dessous. */
export const PREFERENCES_PAR_DEFAUT: Preferences = {
  theme: 'cahier',
  accent: 'terracotta',
  rowHeight: 26,
  codeFontTenths: 125,
  guards: {
    pendingBeforeWrite: true,
    prodReadOnly: true,
    refuseUnrestrictedWrites: true,
    keepInversePatch: true,
  },
}

/**
 * La palette d'accent, **fermée**.
 *
 * Les six valeurs viennent des propriétés que le handoff déclare lui-même
 * (`accent.options` de son script de démonstration) — pas d'un choix fait ici. Un sélecteur de
 * couleur libre permettrait un accent illisible sur le fond du produit.
 */
export const PALETTE: readonly { valeur: Accent; couleur: string; nom: string }[] = [
  { valeur: 'terracotta', couleur: '#F2653A', nom: 'terracotta' },
  { valeur: 'framboise', couleur: '#DB3753', nom: 'framboise' },
  { valeur: 'brique', couleur: '#E4573F', nom: 'brique' },
  { valeur: 'sauge', couleur: '#2E9E6B', nom: 'sauge' },
  { valeur: 'ardoise', couleur: '#3B82C4', nom: 'ardoise' },
  { valeur: 'violette', couleur: '#7C5CD6', nom: 'violette' },
]

/** Les trois thèmes, avec le nom que le mockup leur donne. */
export const THEMES: readonly { valeur: Theme; nom: string; detail: string }[] = [
  { valeur: 'cahier', nom: 'Cahier', detail: 'le thème clair du handoff' },
  { valeur: 'nuit', nom: 'Nuit', detail: 'incomplet — voir la mention' },
  { valeur: 'systeme', nom: 'Système', detail: 'suit le réglage de macOS' },
]

/** Les bornes de `10a`, redites ici pour que l'écran n'en invente pas d'autres. */
export const HAUTEUR_MIN = 20
export const HAUTEUR_MAX = 36
export const CORPS_MIN = 100
export const CORPS_MAX = 160

/**
 * La densité la plus compacte qu'un corps de police autorise (`15c`).
 *
 * **La même formule que côté Rust**, et ce doublon est assumé : le curseur doit connaître sa borne
 * *avant* d'envoyer une valeur, sans quoi il proposerait une position que le disque refuserait — et
 * l'écran afficherait autre chose que ce qui est enregistré. Un aller-retour par mouvement de
 * curseur serait le seul moyen de l'éviter, et il coûterait une écriture par pixel.
 *
 * Le facteur `1,3` est calibré sur le handoff : il rend exactement 20 px — la borne `--rowh-min` —
 * au corps par défaut de 12,5. Voir `Preferences::hauteur_minimale_pour` côté Rust.
 */
export function hauteurMinimalePour(corpsDixiemes: number): number {
  const plancher = Math.ceil((corpsDixiemes / 10) * 1.3) + 2
  return Math.min(Math.max(plancher, HAUTEUR_MIN), HAUTEUR_MAX)
}

/** Ramène les valeurs numériques dans leurs bornes, comme le fait `Preferences::borner`. */
export function borner(preferences: Preferences): Preferences {
  const corps = Math.min(Math.max(preferences.codeFontTenths, CORPS_MIN), CORPS_MAX)
  const plancher = hauteurMinimalePour(corps)
  return {
    ...preferences,
    codeFontTenths: corps,
    rowHeight: Math.min(Math.max(preferences.rowHeight, plancher), HAUTEUR_MAX),
  }
}

/**
 * Les jetons CSS que les préférences redéfinissent, et **rien de plus**.
 *
 * **Sur la racine, pas composant par composant.** `--rowh` atteint la grille, `--font-mono`
 * l'éditeur, les blocs SQL et le JSON d'un coup. Les appliquer composant par composant en
 * oublierait un — et c'est le genre d'oubli qui ne se voit que sur l'écran qu'on n'a pas regardé.
 */
export function jetonsDe(preferences: Preferences): Record<string, string> {
  const accent = PALETTE.find((entree) => entree.valeur === preferences.accent)
  return {
    '--rowh': `${preferences.rowHeight}px`,
    // Le corps du code, en dixièmes de point dans le modèle pour rester exact au fil des
    // sérialisations (voir `Preferences::code_font_tenths`).
    '--text-code': `${preferences.codeFontTenths / 10}px`,
    ...(accent ? { '--accent': accent.couleur } : {}),
  }
}

/**
 * L'attribut `data-theme` de la racine, ou `null` pour « Système ».
 *
 * **`null` et non `'systeme'`** : sans attribut, c'est la requête média `prefers-color-scheme` qui
 * décide, donc le thème suit l'OS sans rechargement. Poser un attribut « système » obligerait le CSS
 * à traiter un troisième cas qui ne décrit aucune couleur.
 */
export function themeApplique(preferences: Preferences): 'cahier' | 'nuit' | null {
  return preferences.theme === 'systeme' ? null : preferences.theme
}

/**
 * Vrai quand ce thème est **incomplet** (`15b`).
 *
 * `tokens.json` n'a qu'une valeur par jeton : le sombre demande une seconde valeur pour chacun, ce
 * qui est un travail de design que le handoff ne fournit pas. L'écran le dit plutôt que de laisser
 * découvrir un écran à moitié illisible.
 */
export function themeIncomplet(theme: Theme): boolean {
  return theme === 'nuit'
}
