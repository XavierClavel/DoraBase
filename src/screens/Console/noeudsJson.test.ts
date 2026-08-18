import { describe, expect, it } from 'vitest'
import { basculer, genreDe, noeudsVisibles, ouvertsParDefaut, resume, texteDe } from './noeudsJson'

const DOCUMENT = {
  _id: { $oid: '64b7f9a2c3d4e5f60718293a' },
  reference: 'CMD-0001',
  montant: 12900,
  paye: false,
  note: null,
  cree_le: { $date: '2026-03-04T09:12:00Z' },
  livraison: { pays: 'FR', ville: 'Toulouse' },
  lignes: [{ article: 'ART-77' }, { article: 'ART-19' }],
  vide: {},
}

describe('genreDe', () => {
  it('reconnaît un ObjectId et une date du JSON étendu', () => {
    // Sans cela, un identifiant s'afficherait comme un objet à un champ `$oid`, et on perdrait ce
    // qu'il est — ce que `13b` demande de distinguer.
    expect(genreDe({ $oid: 'abc' })).toBe('objectId')
    expect(genreDe({ $date: '2026-03-04T09:12:00Z' })).toBe('date')
  })

  it('un objet à deux champs dont l’un est $oid reste un objet', () => {
    // La reconnaissance porte sur la **forme entière**, pas sur la présence d'une clé : un document
    // qui aurait un champ nommé `$oid` parmi d'autres ne serait pas un identifiant.
    expect(genreDe({ $oid: 'abc', autre: 1 })).toBe('objet')
  })

  it('distingue les cinq genres du JSON', () => {
    expect(genreDe(null)).toBe('nul')
    expect(genreDe('a')).toBe('chaine')
    expect(genreDe(1)).toBe('nombre')
    expect(genreDe(true)).toBe('booleen')
    expect(genreDe([])).toBe('tableau')
  })
})

describe('noeudsVisibles', () => {
  it('replié, ne rend que la racine', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set())
    expect(noeuds).toHaveLength(1)
    expect(noeuds[0]?.depliable).toBe(true)
    expect(noeuds[0]?.enfants).toBe(9)
  })

  it('déplié d’un cran, rend les champs sans descendre plus bas', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['']))
    // La racine plus ses neuf champs. Les sous-champs de `livraison` ne sont **pas** là : les
    // afficher noierait la lecture des clés, ce que `13b` refuse.
    expect(noeuds).toHaveLength(10)
    expect(noeuds.map((n) => n.cle)).toContain('livraison')
    expect(noeuds.map((n) => n.cle)).not.toContain('ville')
  })

  it('un ObjectId et une date sont des feuilles, malgré leur forme d’objet', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['', '_id', 'cree_le']))
    const id = noeuds.find((n) => n.cle === '_id')
    expect(id?.depliable).toBe(false)
    expect(id?.texte).toBe('64b7f9a2c3d4e5f60718293a')
    // Déplier `_id` ne doit rien ajouter, même si son chemin est dans les ouverts.
    expect(noeuds.filter((n) => n.cle === '$oid')).toHaveLength(0)
  })

  it('un objet vide est une feuille qui dit son vide', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['']))
    const vide = noeuds.find((n) => n.cle === 'vide')
    // `{}` est une **valeur** : l'afficher vide le confondrait avec un champ absent.
    expect(vide?.depliable).toBe(false)
    expect(vide?.texte).toBe('{}')
  })

  it('un tableau se déplie par indices, et ses éléments gardent leur chemin', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['', 'lignes']))
    const elements = noeuds.filter((n) => n.niveau === 2)
    expect(elements.map((n) => n.chemin)).toEqual(['lignes.0', 'lignes.1'])
  })

  it('le chemin porte l’identité, pas la clé — deux champs du même nom ne se confondent pas', () => {
    const document = { a: { nom: 'x' }, b: { nom: 'y' } }
    // Déplier `a` ne doit pas déplier `b` : leurs enfants s'appellent tous deux `nom`.
    const noeuds = noeudsVisibles(document, new Set(['', 'a']))
    expect(noeuds.map((n) => n.chemin)).toEqual(['', 'a', 'a.nom', 'b'])
  })

  it('un chemin de racine donné préfixe tous les enfants', () => {
    // C'est ce qui permet à plusieurs documents de coexister dans le même arbre sans que leurs
    // chemins se télescopent.
    const noeuds = noeudsVisibles({ x: { y: 1 } }, new Set(['2', '2.x']), '2')
    expect(noeuds.map((n) => n.chemin)).toEqual(['2', '2.x', '2.x.y'])
  })
})

describe('ouvertsParDefaut', () => {
  it('ouvre chaque document d’un cran, et rien de plus', () => {
    const ouverts = ouvertsParDefaut([{}, {}, {}])
    expect([...ouverts].sort()).toEqual(['0', '1', '2'])
  })
})

describe('basculer', () => {
  it('ouvre ce qui est fermé et ferme ce qui est ouvert', () => {
    expect([...basculer(new Set(), 'a')]).toEqual(['a'])
    expect([...basculer(new Set(['a']), 'a')]).toEqual([])
  })

  it('ne modifie pas l’ensemble reçu', () => {
    const initial = new Set(['a'])
    basculer(initial, 'b')
    expect([...initial]).toEqual(['a'])
  })
})

describe('texteDe et resume', () => {
  it('une chaîne garde ses guillemets, un nul dit « null »', () => {
    // Sans guillemets, la chaîne « null » et la valeur nulle s'afficheraient pareil.
    expect(texteDe('null', 'chaine')).toBe('"null"')
    expect(texteDe(null, 'nul')).toBe('null')
  })

  it('une date en JSON étendu canonique se lit aussi', () => {
    expect(texteDe({ $date: { $numberLong: '1772615520000' } }, 'date')).toContain('2026-')
  })

  it('le résumé compte, il ne montre pas un aperçu', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['']))
    const livraison = noeuds.find((n) => n.cle === 'livraison')
    // Un aperçu tronqué se lirait comme le contenu entier, et il faudrait déplier pour savoir
    // combien il en reste.
    expect(resume(livraison as never)).toBe('{ 2 champs }')
    const lignes = noeuds.find((n) => n.cle === 'lignes')
    expect(resume(lignes as never)).toBe('[ 2 ]')
  })

  it('une feuille n’a pas de résumé', () => {
    const noeuds = noeudsVisibles(DOCUMENT, new Set(['']))
    expect(resume(noeuds.find((n) => n.cle === 'reference') as never)).toBe('')
  })
})
