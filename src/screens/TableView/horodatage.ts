import type { Value } from '../../domain/engine'

/**
 * Lire une colonne d'entiers comme des horodatages depuis l'époque — en fonctions **pures**, comme
 * `tri.ts` et `ajustement.ts`.
 *
 * # Pourquoi rien n'est deviné
 *
 * Un `bigint` qui porte une époque et un `bigint` qui compte des centimes sont **le même type
 * déclaré**. Aucune règle ne les sépare : un nom en `_at` peut porter une durée, et une plage de
 * valeurs plausible l'est aussi pour un identifiant. Le moteur, lui, déclare franchement un nombre —
 * le réinterpréter d'office reviendrait à contredire le catalogue au jugé, et un montant affiché en
 * date de 1970 est un mensonge silencieux dans l'outil dont le métier est de montrer ce qui est
 * stocké.
 *
 * **C'est donc l'utilisateur qui le dit**, colonne par colonne, depuis le menu de l'en-tête — comme
 * il dit déjà quelle colonne masquer et quelle largeur lui donner. L'échantillon ne sert qu'à
 * **suggérer** l'échelle dans le libellé du menu ; se tromper n'y coûte rien, puisque les trois
 * restent proposées.
 *
 * # Ce que la lecture ne touche pas
 *
 * **L'affichage seul.** La valeur stockée reste un nombre partout où elle est *écrite* — la cellule
 * qu'on édite montre l'entier, `row_as_insert` compose l'entier, et l'onglet JSON du panneau de
 * ligne porte l'entier, puisque c'est lui qui se réécrit. Une date convertie sur un de ces chemins
 * partirait vers une colonne numérique, et le moteur la refuserait — ou pire, l'accepterait.
 */
export type Echelle = 'secondes' | 'millisecondes' | 'microsecondes'

/** Les trois échelles, dans l'ordre du menu — de la moins précise à la plus. */
export const ECHELLES: readonly Echelle[] = ['secondes', 'millisecondes', 'microsecondes']

/** Combien de millisecondes vaut une unité de chaque échelle. */
const EN_MILLISECONDES: Record<Echelle, number> = {
  secondes: 1_000,
  millisecondes: 1,
  microsecondes: 1 / 1_000,
}

/**
 * L'échelle que l'échantillon suggère, d'après le **nombre de chiffres** — `undefined` quand aucune
 * valeur entière ne s'y trouve.
 *
 * **Le compte de chiffres est le seul discriminant fiable, et il ne l'est que parce qu'on sait déjà
 * qu'il s'agit d'une date.** Une même seconde s'écrit en 10 chiffres, en 13 en millisecondes et en
 * 16 en microsecondes ; les intervalles ne se recouvrent pas pour des dates réelles — 13 chiffres de
 * *secondes* seraient l'an 318857. Appliqué à un nombre quelconque, le même compte ne dirait rien du
 * tout : c'est bien pourquoi il ne sert qu'à suggérer, jamais à décider.
 */
export function echelleDeduite(valeurs: readonly Value[]): Echelle | undefined {
  const premiere = valeurs.find((valeur) => valeur.kind === 'int')
  if (premiere === undefined) return undefined
  const chiffres = Math.abs(premiere.value).toFixed(0).length
  if (chiffres <= 11) return 'secondes'
  if (chiffres <= 14) return 'millisecondes'
  return 'microsecondes'
}

/**
 * La valeur telle que la colonne se **lit** : un entier devient un horodatage, tout le reste passe
 * intact.
 *
 * **Rendre une `Value` plutôt qu'une chaîne** est ce qui fait suivre tout le reste sans une ligne de
 * plus : `texteDeValeur` la met en texte, `rendreValeur` en nœud, `estNumerique` la range à gauche
 * comme les autres horodatages, et l'ajustement de largeur mesure la date et non le nombre. Un
 * `NULL` reste un `NULL`, et un `decimal` — un entier trop grand pour un `double` — reste tel quel :
 * il voyage en texte pour garder sa précision, et une époque n'a jamais besoin de cette précision-là.
 */
export function valeurRelue(value: Value, echelle: Echelle | undefined): Value {
  if (echelle === undefined || value.kind !== 'int') return value
  const rendu = horodatageDe(value.value * EN_MILLISECONDES[echelle])
  // Une valeur que `Date` ne sait pas situer — au-delà de ±8,64e15 ms — reste le nombre qu'elle est.
  // « Invalid Date » dans une cellule serait moins informatif que la valeur brute.
  return rendu === null ? value : { kind: 'timestamp', value: rendu }
}

/**
 * `2026-03-05 00:00:00`, **en UTC**, ou `null` si l'instant n'existe pas.
 *
 * **UTC et non l'heure locale.** Une époque est un instant absolu, sans fuseau : en choisir un
 * ferait dépendre ce que l'écran affiche de la machine qui l'affiche — donc aussi ce que chaque test
 * et chaque capture de fidélité mesurent (la leçon de `DORABASE_VERSION_DECOR`). C'est surtout la
 * cohérence avec le filtre qui décide : la borne d'un « avant le » est minuit **UTC**, et une date
 * affichée dans un autre fuseau que celle qui filtre se lirait comme un décalage d'un jour.
 */
export function horodatageDe(millisecondes: number): string | null {
  if (!Number.isFinite(millisecondes)) return null
  const instant = new Date(millisecondes)
  if (Number.isNaN(instant.getTime())) return null
  const deux = (nombre: number) => String(nombre).padStart(2, '0')
  const jour = `${instant.getUTCFullYear()}-${deux(instant.getUTCMonth() + 1)}-${deux(instant.getUTCDate())}`
  const heure = `${deux(instant.getUTCHours())}:${deux(instant.getUTCMinutes())}:${deux(instant.getUTCSeconds())}`
  return `${jour} ${heure}`
}

/**
 * La borne à envoyer au serveur pour une date choisie dans le calendrier — `2026-03-05` devient
 * l'entier de **minuit UTC** à cette échelle, en texte.
 *
 * `''` pour une date vide ou illisible : c'est ce que `filtreDe` traite comme « pas de filtre », donc
 * vider le champ retire le filtre comme partout ailleurs.
 */
export function borneDepuisLaDate(date: string, echelle: Echelle): string {
  const millisecondes = Date.parse(`${date.trim()}T00:00:00Z`)
  if (Number.isNaN(millisecondes)) return ''
  return String(Math.round(millisecondes / EN_MILLISECONDES[echelle]))
}

/**
 * L'inverse, pour **remplir** le champ de date avec le filtre en place — sans quoi un champ
 * `type="date"` recevrait un nombre et l'écarterait, se vidant sous les yeux de qui vient de choisir
 * une date.
 */
export function dateDepuisLaBorne(borne: string, echelle: Echelle): string {
  const nombre = Number(borne)
  if (borne.trim() === '' || !Number.isFinite(nombre)) return ''
  return horodatageDe(nombre * EN_MILLISECONDES[echelle])?.slice(0, 10) ?? ''
}
