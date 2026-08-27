import { describe, expect, it } from 'vitest'
import type { ColumnInfo, Value } from '../../domain/engine'
import {
  diffCreation,
  diffDocument,
  documentDepuisTexte,
  documentJson,
  saisieDeJson,
} from './documentJson'

const colonne = (name: string, over: Partial<ColumnInfo> = {}): ColumnInfo => ({
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
  ...over,
})

const COLONNES = [
  colonne('_id', { category: 'text', key: 'primary' }),
  colonne('nom'),
  colonne('actif', { category: 'boolean' }),
  colonne('adresse', { category: 'json' }),
]

const LIGNE: Value[] = [
  { kind: 'text', value: '64b7…' },
  { kind: 'text', value: 'Halle Nord' },
  { kind: 'bool', value: true },
  { kind: 'json', value: '{"ville":"Lyon"}' },
]

describe('documentJson', () => {
  it('rend chaque colonne dans son type JSON, pas en texte', () => {
    const texte = documentJson(COLONNES, LIGNE)
    expect(JSON.parse(texte)).toEqual({
      _id: '64b7…',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Lyon' },
    })
  })
})

describe('documentDepuisTexte', () => {
  it('analyse un objet valide', () => {
    const analyse = documentDepuisTexte('{"nom": "test"}')
    expect(analyse).toEqual({ ok: true, valeur: { nom: 'test' } })
  })

  it('refuse un JSON invalide, sans planter', () => {
    const analyse = documentDepuisTexte('{nom: }')
    expect(analyse.ok).toBe(false)
    expect(analyse.ok === false && analyse.erreur).toContain('JSON invalide')
  })

  it('refuse un tableau ou une valeur nue à la racine', () => {
    expect(documentDepuisTexte('[1, 2]').ok).toBe(false)
    expect(documentDepuisTexte('"texte"').ok).toBe(false)
    expect(documentDepuisTexte('null').ok).toBe(false)
  })
})

describe('diffDocument', () => {
  it('ne produit rien quand le document édité est identique', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: '64b7…',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Lyon' },
    })
    expect(diff).toEqual({ ok: true, modifications: [] })
  })

  it('un champ changé devient une modification, texte pour une chaîne', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: '64b7…',
      nom: 'Halle Sud',
      actif: true,
      adresse: { ville: 'Lyon' },
    })
    expect(diff).toEqual({
      ok: true,
      modifications: [
        {
          cle: '64b7…',
          rang: 1,
          column: 'nom',
          avant: { kind: 'text', value: 'Halle Nord' },
          apres: { kind: 'texte', texte: 'Halle Sud' },
        },
      ],
    })
  })

  it('un champ imbriqué changé part en texte JSON, comme une cellule json éditée', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: '64b7…',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Paris' },
    })
    expect(diff.ok).toBe(true)
    expect(diff.ok && diff.modifications).toEqual([
      {
        cle: '64b7…',
        rang: 1,
        column: 'adresse',
        avant: { kind: 'json', value: '{"ville":"Lyon"}' },
        apres: { kind: 'texte', texte: '{"ville":"Paris"}' },
      },
    ])
  })

  it('un champ retiré du document édité devient un NULL demandé, pas une chaîne vide', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: '64b7…',
      actif: true,
      adresse: { ville: 'Lyon' },
    })
    expect(diff.ok).toBe(true)
    expect(diff.ok && diff.modifications).toEqual([
      {
        cle: '64b7…',
        rang: 1,
        column: 'nom',
        avant: { kind: 'text', value: 'Halle Nord' },
        apres: { kind: 'null' },
      },
    ])
  })

  it('un champ nouveau, absent des colonnes déduites, part sans « avant »', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: '64b7…',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Lyon' },
      note: 'ajoutée à la main',
    })
    expect(diff.ok).toBe(true)
    expect(diff.ok && diff.modifications).toEqual([
      {
        cle: '64b7…',
        rang: 1,
        column: 'note',
        avant: { kind: 'null' },
        apres: { kind: 'texte', texte: 'ajoutée à la main' },
      },
    ])
  })

  it('refuse de changer la clé primaire, avec la même raison qu’une cellule', () => {
    const diff = diffDocument(COLONNES, LIGNE, 1, '64b7…', {
      _id: 'autre-chose',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Lyon' },
    })
    expect(diff).toEqual({ ok: false, erreur: expect.stringContaining('identifie la ligne') })
  })

  it('refuse de changer une colonne binaire', () => {
    const colonnes = [...COLONNES, colonne('photo', { category: 'binary' })]
    const ligne = [...LIGNE, { kind: 'binary' as const, base64: 'AAAA' }]
    const diff = diffDocument(colonnes, ligne, 1, '64b7…', {
      _id: '64b7…',
      nom: 'Halle Nord',
      actif: true,
      adresse: { ville: 'Lyon' },
      photo: 'BBBB',
    })
    expect(diff).toEqual({ ok: false, erreur: expect.stringContaining('binaire') })
  })
})

describe('diffCreation', () => {
  it('traduit chaque champ en Saisie, la clé primaire comprise', () => {
    const diff = diffCreation(COLONNES, { _id: 'nouveau', nom: 'Halle Est', actif: false })
    expect(diff).toEqual({
      ok: true,
      valeurs: {
        _id: { kind: 'texte', texte: 'nouveau' },
        nom: { kind: 'texte', texte: 'Halle Est' },
        actif: { kind: 'texte', texte: 'false' },
      },
    })
  })

  it('refuse une colonne binaire à la création', () => {
    const colonnes = [...COLONNES, colonne('photo', { category: 'binary' })]
    const diff = diffCreation(colonnes, { photo: 'BBBB' })
    expect(diff).toEqual({ ok: false, erreur: expect.stringContaining('binaire') })
  })
})

describe('saisieDeJson', () => {
  it('null devient une Saisie NULL explicite', () => {
    expect(saisieDeJson(null)).toEqual({ kind: 'null' })
  })

  it('une chaîne reste telle quelle, sans guillemets ajoutés', () => {
    expect(saisieDeJson('texte')).toEqual({ kind: 'texte', texte: 'texte' })
  })

  it('un nombre, un booléen ou un objet partent en texte JSON', () => {
    expect(saisieDeJson(42)).toEqual({ kind: 'texte', texte: '42' })
    expect(saisieDeJson(true)).toEqual({ kind: 'texte', texte: 'true' })
    expect(saisieDeJson({ a: 1 })).toEqual({ kind: 'texte', texte: '{"a":1}' })
  })
})
