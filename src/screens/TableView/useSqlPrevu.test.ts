import { describe, expect, it } from 'vitest'
import type { LigneSupprimee } from './modifications'
import { planDuModele, suppressionDe } from './useSqlPrevu'

const CIBLE = { schema: 'atelier', table: 'fiches' }

describe('suppressionDe', () => {
  it('ne porte que la clé — aucune valeur attendue, contrairement à une modification', () => {
    const ligne: LigneSupprimee = { sorte: 'suppression', cle: '184217', rang: 3 }
    expect(suppressionDe(ligne)).toEqual({ key: '184217' })
  })
})

describe('planDuModele', () => {
  it('range une ligne marquée pour suppression dans `deletes`, à côté de `changes` et `inserts`', () => {
    const plan = planDuModele(CIBLE, 'id', [
      { sorte: 'suppression', cle: '184217', rang: 3 },
      { sorte: 'suppression', cle: '184218', rang: 4 },
    ])
    expect(plan.changes).toEqual([])
    expect(plan.inserts).toEqual([])
    expect(plan.deletes).toEqual([{ key: '184217' }, { key: '184218' }])
  })
})
