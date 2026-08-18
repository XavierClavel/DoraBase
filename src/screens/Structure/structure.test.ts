import { describe, expect, it } from 'vitest'
import type { ColumnInfo, ConstraintInfo, Relation } from '../../domain/engine'
import { annotationDe, defautLisible, resumeDeCheck } from './structure'

function colonne(partiel: Partial<ColumnInfo> = {}): ColumnInfo {
  return {
    position: 1,
    name: 'id',
    typeName: 'bigint',
    category: 'number',
    nullable: false,
    default: null,
    identity: null,
    key: null,
    comment: null,
    frequency: null,
    ...partiel,
  }
}

describe('defautLisible', () => {
  it('nomme l’identité, que PostgreSQL ne met pas dans le défaut', () => {
    expect(defautLisible(colonne({ identity: 'byDefault' }))).toBe('identity')
    expect(defautLisible(colonne({ identity: 'always' }))).toBe('identity (always)')
  })

  it('rend le défaut tel que le catalogue le donne', () => {
    expect(defautLisible(colonne({ default: "'pending'::text" }))).toBe("'pending'::text")
    expect(defautLisible(colonne())).toBeNull()
  })
})

describe('annotationDe', () => {
  const relations: Relation[] = [
    {
      constraintName: 'orders_user_fk',
      direction: 'outgoing',
      columns: ['user_id'],
      targetSchema: 'public',
      targetTable: 'users',
      targetColumns: ['id'],
    },
    {
      constraintName: 'items_order_fk',
      direction: 'incoming',
      columns: ['id'],
      targetSchema: 'public',
      targetTable: 'order_items',
      targetColumns: ['order_id'],
    },
  ]
  const contraintes: ConstraintInfo[] = [
    {
      name: 'orders_status_chk',
      definition: "CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'shipped'::text])))",
    },
  ]

  it('préfère le commentaire écrit à toute déduction', () => {
    const annotation = annotationDe(
      colonne({ name: 'user_id', comment: 'le client' }),
      relations,
      contraintes,
    )
    expect(annotation).toEqual({ texte: 'le client', deduit: false })
  })

  it('donne la cible d’une clé étrangère sortante', () => {
    expect(annotationDe(colonne({ name: 'user_id' }), relations, contraintes)).toEqual({
      texte: '→ users.id',
      deduit: true,
    })
  })

  it('ignore une relation entrante : elle ne décrit pas cette colonne', () => {
    // `id` est référencée par `order_items`, ce qui ne dit rien de ce que `id` contient.
    expect(annotationDe(colonne({ name: 'id' }), relations, [])).toBeNull()
  })

  it('résume la contrainte check qui porte sur la colonne', () => {
    expect(annotationDe(colonne({ name: 'status' }), relations, contraintes)).toEqual({
      texte: 'check ∈ 3 valeurs',
      deduit: true,
    })
  })

  it('ne prête pas à une colonne la contrainte d’une colonne dont le nom la contient', () => {
    // Le sens qui mord : la contrainte porte sur `status_extra`, la colonne s'appelle `status`.
    // Sans borne de mot, `definition.includes('status')` est vrai et la colonne hérite d'une
    // contrainte qui ne la concerne pas.
    const voisine: ConstraintInfo[] = [
      { name: 'orders_extra_chk', definition: 'CHECK ((status_extra = ANY (ARRAY[1, 2, 3])))' },
    ]
    expect(annotationDe(colonne({ name: 'status' }), relations, voisine)).toBeNull()
    // Et l'inverse, qui ne mordait pas mais reste vrai.
    expect(annotationDe(colonne({ name: 'status_extra' }), relations, contraintes)).toBeNull()
  })

  it('ne rend rien plutôt qu’un tiret : la cellule décide de son vide', () => {
    expect(annotationDe(colonne({ name: 'note' }), relations, contraintes)).toBeNull()
  })
})

describe('resumeDeCheck', () => {
  it('compte les valeurs d’un in (…)', () => {
    expect(resumeDeCheck("CHECK (channel in ('web', 'app'))")).toBe('check ∈ 2 valeurs')
  })

  it('ne compte pas une égalité déguisée en liste d’un élément', () => {
    expect(resumeDeCheck("CHECK (channel in ('web'))")).toBe('check')
  })

  it('se replie sur « check » quand l’expression n’énumère rien', () => {
    expect(resumeDeCheck('CHECK ((total_cents >= 0))')).toBe('check')
  })
})
