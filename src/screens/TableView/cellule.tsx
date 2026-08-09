import type { ReactNode } from 'react'
import type { Value } from '../../domain/engine'
import { formatInteger } from '../../ui/format'
import styles from './TableView.module.css'

/**
 * Le rendu d'une valeur de cellule, **par genre**.
 *
 * `06a` a délibérément rendu des valeurs typées plutôt que préformatées : « c'est donc l'écran
 * qui formate — lui seul connaît la densité et la locale ». Voici cette décision, isolée du
 * composant pour être testable valeur par valeur.
 */
export function rendreValeur(value: Value): ReactNode {
  switch (value.kind) {
    case 'null':
      // **`NULL` écrit, jamais du vide.** Une cellule vide se confondrait avec la chaîne vide,
      // qui est une valeur parfaitement différente — et la distinction est l'une des rares
      // choses qu'un client de bases doit absolument ne pas brouiller.
      return <span className={styles.nul}>NULL</span>
    case 'bool':
      return value.value ? 'true' : 'false'
    case 'int':
      return formatInteger(value.value)
    case 'float':
      // Pas de groupement ni d'arrondi : un flottant tronqué à l'affichage laisserait croire à
      // une valeur ronde. Le moteur rend déjà la représentation textuelle exacte.
      return String(value.value)
    case 'text':
      return value.value
    case 'timestamp':
      // Tel que le moteur le rend. Un reformatage local remplacerait la valeur stockée par une
      // interprétation — et un fuseau appliqué deux fois est un défaut invisible.
      return value.value
    case 'json':
      // Sur une ligne : la grille a 26 px de haut, et un JSON multiligne casserait la trame.
      // Le panneau de ligne (`10f`) le montre en entier.
      return value.value.replace(/\s+/g, ' ')
    case 'binary':
      // **Jamais le contenu.** Des octets rendus en texte produisent du charabia, parfois long ;
      // la taille est ce qui renseigne.
      return `\\x… ${formatInteger(tailleBase64(value.base64))} o`
  }
}

/** Un nombre s'aligne à droite, le reste à gauche — comme le mockup, et comme `DataTable`. */
export function estNumerique(value: Value): boolean {
  return value.kind === 'int' || value.kind === 'float'
}

/**
 * La taille en octets d'une chaîne base64, sans la décoder.
 *
 * La décoder pour en mesurer la longueur allouerait le contenu entier — précisément ce que le
 * rendu évite.
 */
function tailleBase64(base64: string): number {
  const rembourrage = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, (base64.length * 3) / 4 - rembourrage)
}
