import { describe, expect, it } from 'vitest'
import type { ColumnInfo, Relation } from '../../domain/engine'
import { champsLisibles, relationDe, valeurDeCle } from './ligneLiee'

const colonne = (name: string): ColumnInfo => ({
  position: 1,
  name,
  typeName: 'text',
  category: 'text',
  nullable: true,
  default: null,
  identity: null,
  key: null,
  comment: null,
  frequency: null,
})

const relation = (over: Partial<Relation> = {}): Relation => ({
  constraintName: 'orders_user_id_fkey',
  direction: 'outgoing',
  columns: ['user_id'],
  targetSchema: 'public',
  targetTable: 'users',
  targetColumns: ['id'],
  ...over,
})

describe('règle « ligne liée »', () => {
  it('retient les champs de la liste blanche, quelle que soit la casse', () => {
    const trouves = champsLisibles([
      colonne('id'),
      colonne('Email'),
      colonne('firstName'),
      colonne('tenant_id'),
    ])
    expect(trouves.map((c) => c.name)).toEqual(['Email', 'firstName'])
  })

  it('une table cible sans champ lisible n’autorise aucun aperçu', () => {
    // **Le bord qui compte.** Un aperçu automatique qui déverse une ligne référencée transforme
    // un clic distrait en fuite de données : ce cas doit rendre du vide, et pas « les colonnes
    // qu'on a sous la main ».
    expect(
      champsLisibles([colonne('id'), colonne('tenant_id'), colonne('hashed_password')]),
    ).toEqual([])
  })

  it('ne suit que les relations sortantes', () => {
    const sortante = relation()
    const entrante = relation({
      constraintName: 'invoices_order_id_fkey',
      direction: 'incoming',
      columns: ['id'],
      targetTable: 'invoices',
    })

    expect(relationDe([sortante, entrante], 'user_id')).toBe(sortante)
    // Une relation entrante dit qui référence cette table : elle ne désigne aucune ligne
    // précise à prévisualiser.
    expect(relationDe([entrante], 'id')).toBeUndefined()
  })

  it('une clé nulle ou binaire ne désigne aucune ligne', () => {
    expect(valeurDeCle({ kind: 'null' })).toBeNull()
    expect(valeurDeCle({ kind: 'binary', base64: 'AQ==' })).toBeNull()
    expect(valeurDeCle(undefined)).toBeNull()
  })

  it('une clé numérique ou textuelle devient une chaîne, comme `Filter` l’attend', () => {
    expect(valeurDeCle({ kind: 'int', value: 90_233 })).toBe('90233')
    expect(valeurDeCle({ kind: 'text', value: 'abc' })).toBe('abc')
  })
})
