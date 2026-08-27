import { expect, test } from 'vitest'
import type { Dictionnaire } from '../types'
import { DICTIONNAIRES } from './index'

/**
 * Que les deux dictionnaires portent **exactement** les mêmes clés.
 *
 * `useT` retombe sur le français quand une clé manque en anglais — un choix délibéré, pour
 * qu'une traduction oubliée n'affiche pas la clé brute. Le revers est qu'**une clé oubliée ne
 * se voit pas** : l'interface reste lisible, en français, au milieu d'un écran anglais. Ce
 * test est le seul endroit où l'oubli fait du bruit.
 */
function chemins(dictionnaire: Dictionnaire, prefixe = ''): string[] {
  return Object.entries(dictionnaire).flatMap(([cle, valeur]) =>
    valeur !== null && typeof valeur === 'object'
      ? chemins(valeur as Dictionnaire, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  )
}

test('les deux langues portent les mêmes clés', () => {
  const fr = chemins(DICTIONNAIRES.fr as unknown as Dictionnaire).sort()
  const en = chemins(DICTIONNAIRES.en as unknown as Dictionnaire).sort()

  expect(fr.filter((cle) => !en.includes(cle))).toEqual([])
  expect(en.filter((cle) => !fr.includes(cle))).toEqual([])
})

test('les deux langues s’accordent sur ce qui est une fonction', () => {
  // Une entrée paramétrée d'un côté et fixe de l'autre perd ses paramètres en silence :
  // « Importer dans commandes » deviendrait « Import into » sans nom de base.
  const formes = (dictionnaire: Dictionnaire, prefixe = ''): [string, string][] =>
    Object.entries(dictionnaire).flatMap(([cle, valeur]) =>
      valeur !== null && typeof valeur === 'object'
        ? formes(valeur as Dictionnaire, `${prefixe}${cle}.`)
        : [[`${prefixe}${cle}`, typeof valeur] as [string, string]],
    )

  const fr = new Map(formes(DICTIONNAIRES.fr as unknown as Dictionnaire))
  const en = new Map(formes(DICTIONNAIRES.en as unknown as Dictionnaire))
  const desaccords = [...fr.entries()]
    .filter(([cle, forme]) => en.has(cle) && en.get(cle) !== forme)
    .map(([cle]) => cle)

  expect(desaccords).toEqual([])
})

test('la parité se mesure sur un vrai contenu, pas sur deux objets vides', () => {
  // Contrôle positif : sans lui, les deux tests ci-dessus passeraient sur des dictionnaires
  // vides — et resteraient verts si `index.ts` cessait d'assembler les écrans.
  const fr = chemins(DICTIONNAIRES.fr as unknown as Dictionnaire)
  expect(fr.length).toBeGreaterThan(200)
  expect(fr).toContain('dump.verdict.readyExport')
})
