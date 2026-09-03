import { describe, expect, it } from 'vitest'
import type { Value } from '../../domain/engine'
import {
  borneDepuisLaDate,
  dateDepuisLaBorne,
  echelleDeduite,
  horodatageDe,
  valeurRelue,
} from './horodatage'

/** L'instant de référence des tests : 2026-03-05 00:00:00 UTC, dans les trois échelles. */
const MINUIT = {
  secondes: 1_772_668_800,
  millisecondes: 1_772_668_800_000,
  microsecondes: 1_772_668_800_000_000,
} as const

const entier = (value: number): Value => ({ kind: 'int', value })

describe('horodatage rangé dans un entier', () => {
  it('les trois échelles rendent le même instant', () => {
    // Le contrôle qui compte : la même date, écrite trois fois, doit se relire trois fois pareil.
    // Un décor où deux échelles donneraient deux instants différents ne dirait pas si la
    // conversion est juste ou si c'est le décor qui les distingue (règle n° 5).
    expect(valeurRelue(entier(MINUIT.secondes), 'secondes')).toEqual({
      kind: 'timestamp',
      value: '2026-03-05 00:00:00',
    })
    expect(valeurRelue(entier(MINUIT.millisecondes), 'millisecondes')).toEqual({
      kind: 'timestamp',
      value: '2026-03-05 00:00:00',
    })
    expect(valeurRelue(entier(MINUIT.microsecondes), 'microsecondes')).toEqual({
      kind: 'timestamp',
      value: '2026-03-05 00:00:00',
    })
  })

  it('une échelle appliquée à la place d’une autre se voit', () => {
    // Contrôle positif du test précédent : sans lui, une conversion qui ignorerait l'échelle
    // passerait pour juste sur l'une des trois.
    expect(valeurRelue(entier(MINUIT.millisecondes), 'secondes')).toEqual({
      kind: 'timestamp',
      value: '58143-08-22 00:00:00',
    })
  })

  it('sans lecture, la valeur ne bouge pas', () => {
    expect(valeurRelue(entier(MINUIT.secondes), undefined)).toEqual(entier(MINUIT.secondes))
  })

  it('seul un entier est relu — ni `NULL`, ni texte, ni décimal', () => {
    // Un `decimal` voyage en texte pour garder sa précision, et une époque n'a pas besoin de
    // celle-là : le relire demanderait de parser, pour rien.
    const autres: Value[] = [
      { kind: 'null' },
      { kind: 'text', value: '1772668800' },
      { kind: 'decimal', value: '1772668800' },
      { kind: 'float', value: 1_772_668_800 },
      { kind: 'bool', value: true },
    ]
    for (const valeur of autres) {
      expect(valeurRelue(valeur, 'secondes')).toEqual(valeur)
    }
  })

  it('un entier que `Date` ne sait pas situer reste le nombre qu’il est', () => {
    // « Invalid Date » dans une cellule serait moins informatif que la valeur brute.
    const enorme = entier(9_000_000_000_000_000)
    expect(valeurRelue(enorme, 'millisecondes')).toEqual(enorme)
    expect(horodatageDe(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('l’époque est lue en UTC, pas dans le fuseau de la machine', () => {
    // Un fuseau local ferait dépendre l'affichage du poste, donc chaque test et chaque capture de
    // fidélité de la machine qui les exécute. C'est aussi la seule façon d'être d'accord avec la
    // borne du filtre, qui est minuit UTC.
    expect(horodatageDe(0)).toBe('1970-01-01 00:00:00')
    expect(horodatageDe(MINUIT.millisecondes + 13 * 3_600_000 + 42 * 60_000 + 7_000)).toBe(
      '2026-03-05 13:42:07',
    )
  })

  it('l’échelle se déduit du nombre de chiffres, pas de la valeur', () => {
    expect(echelleDeduite([entier(MINUIT.secondes)])).toBe('secondes')
    expect(echelleDeduite([entier(MINUIT.millisecondes)])).toBe('millisecondes')
    expect(echelleDeduite([entier(MINUIT.microsecondes)])).toBe('microsecondes')
    // Le premier entier de l'échantillon, les nuls sautés — une colonne nullable commence souvent
    // par des vides.
    expect(echelleDeduite([{ kind: 'null' }, entier(MINUIT.millisecondes)])).toBe('millisecondes')
    // Aucun entier : rien à suggérer, et surtout pas une échelle par défaut.
    expect(echelleDeduite([{ kind: 'null' }, { kind: 'text', value: 'x' }])).toBeUndefined()
    // Un négatif — une date d'avant 1970 — compte ses chiffres sans son signe.
    expect(echelleDeduite([entier(-MINUIT.secondes)])).toBe('secondes')
  })

  it('la date choisie devient minuit UTC, à l’échelle de la colonne', () => {
    expect(borneDepuisLaDate('2026-03-05', 'secondes')).toBe(String(MINUIT.secondes))
    expect(borneDepuisLaDate('2026-03-05', 'millisecondes')).toBe(String(MINUIT.millisecondes))
    expect(borneDepuisLaDate('2026-03-05', 'microsecondes')).toBe(String(MINUIT.microsecondes))
  })

  it('une date vide ou illisible ne produit pas de borne', () => {
    // `''` est ce que `filtreDe` traite comme « pas de filtre » : vider le champ retire donc le
    // filtre, comme partout ailleurs.
    expect(borneDepuisLaDate('', 'secondes')).toBe('')
    expect(borneDepuisLaDate('   ', 'secondes')).toBe('')
    expect(borneDepuisLaDate('le mois dernier', 'secondes')).toBe('')
  })

  it('la borne revient à sa date, pour remplir le champ', () => {
    // Sans ce retour, un champ `type="date"` recevrait un nombre et l'écarterait : il se viderait
    // sous les yeux de qui vient de choisir une date.
    for (const echelle of ['secondes', 'millisecondes', 'microsecondes'] as const) {
      expect(dateDepuisLaBorne(String(MINUIT[echelle]), echelle)).toBe('2026-03-05')
      // Et l'aller-retour est stable, ce qui est ce que le champ exige.
      expect(borneDepuisLaDate(dateDepuisLaBorne(String(MINUIT[echelle]), echelle), echelle)).toBe(
        String(MINUIT[echelle]),
      )
    }
    expect(dateDepuisLaBorne('', 'secondes')).toBe('')
    expect(dateDepuisLaBorne('pas un nombre', 'secondes')).toBe('')
  })
})
