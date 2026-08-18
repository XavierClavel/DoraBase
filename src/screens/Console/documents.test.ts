import { describe, expect, it } from 'vitest'
import type { QueryResult } from '../../domain/engine'
import { documentsDe } from './documents'

function resultat(partiel: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: [],
    rows: [],
    sql: 'db.commandes.find({})',
    durationMs: 4,
    appliedLimit: null,
    ...partiel,
  }
}

describe('documentsDe', () => {
  it('reconstitue un document depuis ses colonnes et ses valeurs', () => {
    const documents = documentsDe(
      resultat({
        columns: ['reference', 'montant', 'paye'],
        rows: [
          [
            { kind: 'text', value: 'CMD-0001' },
            { kind: 'int', value: 12900 },
            { kind: 'bool', value: false },
          ],
        ],
      }),
    )
    expect(documents).toEqual([{ reference: 'CMD-0001', montant: 12900, paye: false }])
  })

  it('un document imbriqué redevient un objet, pas une chaîne', () => {
    // Sans cela, l'arbre de `13b` n'aurait rien à déplier : `livraison` s'afficherait comme une
    // longue ligne de texte.
    const documents = documentsDe(
      resultat({
        columns: ['livraison'],
        rows: [[{ kind: 'json', value: '{"pays":"FR","ville":"Toulouse"}' }]],
      }),
    )
    expect(documents[0]).toEqual({ livraison: { pays: 'FR', ville: 'Toulouse' } })
  })

  it('un JSON illisible est rendu tel quel plutôt que perdu', () => {
    const documents = documentsDe(
      resultat({ columns: ['brut'], rows: [[{ kind: 'json', value: '{ tronqué' }]] }),
    )
    expect(documents[0]).toEqual({ brut: '{ tronqué' })
  })

  it('les valeurs sont brutes : un nombre reste copiable en JSON', () => {
    // Formaté, `12900` deviendrait « 12 900 » avec une espace insécable — et l'arbre ne serait
    // plus du JSON valide.
    const documents = documentsDe(
      resultat({ columns: ['n'], rows: [[{ kind: 'int', value: 12900 }]] }),
    )
    expect(JSON.parse(JSON.stringify(documents[0]))).toEqual({ n: 12900 })
  })

  it('une colonne absente de la ligne devient null, comme un champ absent', () => {
    // La perte nommée dans `18e` : le modèle ne distingue pas l'absent du nul.
    const documents = documentsDe(resultat({ columns: ['a', 'b'], rows: [[{ kind: 'null' }]] }))
    expect(documents[0]).toEqual({ a: null, b: null })
  })
})
