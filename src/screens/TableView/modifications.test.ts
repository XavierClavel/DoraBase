import { describe, expect, it } from 'vitest'
import type { ColumnInfo, Value } from '../../domain/engine'
import {
  annulerLaDerniere,
  estEditable,
  estIdentique,
  lignesModifiees,
  type Modification,
  modificationDe,
  raisonDuRefus,
  retenir,
  retirer,
  texteBrutDe,
} from './modifications'

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

const saisie = (texte: string) => ({ kind: 'texte' as const, texte })
const NUL = { kind: 'null' as const }

function poser(
  attente: readonly Modification[],
  cle: string,
  column: string,
  avant: Value,
  apres: string | typeof NUL,
) {
  return retenir(attente, {
    cle,
    rang: 1,
    column,
    avant,
    apres: typeof apres === 'string' ? saisie(apres) : apres,
  })
}

describe('retenir une modification', () => {
  it('retient une saisie qui change la valeur', () => {
    const a = poser([], '184217', 'status', { kind: 'text', value: 'paid' }, 'shipped')
    expect(a).toHaveLength(1)
    expect(a[0]?.avant).toEqual({ kind: 'text', value: 'paid' })
    expect(a[0]?.apres).toEqual(saisie('shipped'))
  })

  it('retaper la valeur d’origine retire la modification', () => {
    // **En créer une qui ne change rien** ferait compter « 1 modification en attente » sur une
    // cellule intacte, et produirait un `UPDATE` inutile.
    let a = poser([], '184217', 'status', { kind: 'text', value: 'paid' }, 'shipped')
    a = poser(a, '184217', 'status', { kind: 'text', value: 'paid' }, 'paid')
    expect(a).toHaveLength(0)
  })

  it('deux saisies sur la même cellule n’en font qu’une, et `avant` reste l’originale', () => {
    let a = poser([], '184217', 'status', { kind: 'text', value: 'paid' }, 'shipped')
    // La seconde saisie donne l'ancienne valeur *courante* comme `avant` — le modèle doit garder
    // l'originale, sinon le diff comparerait la valeur à elle-même.
    a = poser(a, '184217', 'status', { kind: 'text', value: 'shipped' }, 'refunded')

    expect(a).toHaveLength(1)
    expect(a[0]?.avant).toEqual({ kind: 'text', value: 'paid' })
    expect(a[0]?.apres).toEqual(saisie('refunded'))
  })

  it('l’ordre de saisie est conservé', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = poser(a, '2', 'note', { kind: 'text', value: 'b' }, 'y')
    a = poser(a, '3', 'note', { kind: 'text', value: 'c' }, 'x')
    expect(a.map((m) => m.cle)).toEqual(['1', '2', '3'])
  })

  it('deux cellules de la même ligne font deux modifications', () => {
    let a = poser([], '184217', 'status', { kind: 'text', value: 'paid' }, 'shipped')
    a = poser(a, '184217', 'note', { kind: 'null' }, 'cadeau')
    expect(a).toHaveLength(2)
  })
})

describe('retirer et annuler', () => {
  it('retirer ne touche que la cellule visée', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = poser(a, '1', 'note', { kind: 'text', value: 'b' }, 'y')
    expect(retirer(a, '1', 'status').map((m) => m.column)).toEqual(['note'])
  })

  it('⌘Z retire la dernière retenue, pas la première', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = poser(a, '2', 'note', { kind: 'text', value: 'b' }, 'y')
    expect(annulerLaDerniere(a).map((m) => m.cle)).toEqual(['1'])
  })

  it('⌘Z sur rien ne casse pas', () => {
    expect(annulerLaDerniere([])).toEqual([])
  })
})

describe('un retour à l’origine se juge sur le texte, sauf pour NULL', () => {
  it('un nombre tapé à l’identique est un retour à l’origine', () => {
    // L'utilisateur tape des caractères : comparer les genres ferait de toute saisie une
    // modification.
    expect(estIdentique({ kind: 'int', value: 12_900 }, saisie('12900'))).toBe(true)
    expect(estIdentique({ kind: 'int', value: 12_900 }, saisie('12901'))).toBe(false)
  })

  it('NULL demandé sur NULL est inchangé', () => {
    expect(estIdentique({ kind: 'null' }, NUL)).toBe(true)
  })

  it('NULL demandé sur une chaîne vide **change**', () => {
    // C'est la distinction que `10c` a posée et qu'un client de bases ne doit pas brouiller.
    expect(estIdentique({ kind: 'text', value: '' }, NUL)).toBe(false)
    expect(estIdentique({ kind: 'null' }, saisie(''))).toBe(false)
  })
})

describe('le texte proposé à la saisie est brut', () => {
  it('un nombre n’est pas groupé', () => {
    // Le rendu de `cellule.tsx` affiche « 1 904 220 » : proposer cela à l'édition enverrait une
    // espace insécable à la base.
    expect(texteBrutDe({ kind: 'int', value: 1_904_220 })).toBe('1904220')
  })

  it('NULL propose une saisie vide, pas le mot « NULL »', () => {
    expect(texteBrutDe({ kind: 'null' })).toBe('')
  })

  it('un décimal garde sa précision exacte', () => {
    expect(texteBrutDe({ kind: 'decimal', value: '12345678.91' })).toBe('12345678.91')
  })
})

describe('ce qui n’est pas éditable', () => {
  it('la clé primaire ne l’est pas, et la raison est dite', () => {
    const cle = colonne('id', { key: 'primary', category: 'number' })
    expect(estEditable(cle)).toBe(false)
    expect(raisonDuRefus(cle)).toContain('identifie la ligne')
  })

  it('le binaire ne l’est pas non plus', () => {
    const blob = colonne('blob', { category: 'binary' })
    expect(estEditable(blob)).toBe(false)
    expect(raisonDuRefus(blob)).toContain('binaire')
  })

  it('une clé étrangère l’est : elle ne désigne pas cette ligne', () => {
    const fk = colonne('user_id', { key: 'foreign', category: 'number' })
    expect(estEditable(fk)).toBe(true)
    expect(raisonDuRefus(fk)).toBeNull()
  })
})

describe('les lignes modifiées', () => {
  it('une ligne à deux modifications ne compte qu’une fois', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = poser(a, '1', 'note', { kind: 'text', value: 'b' }, 'y')
    a = poser(a, '2', 'note', { kind: 'text', value: 'c' }, 'x')
    expect([...lignesModifiees(a)]).toEqual(['1', '2'])
  })

  it('une cellule modifiée se retrouve par sa ligne et sa colonne', () => {
    const a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    expect(modificationDe(a, '1', 'status')?.apres).toEqual(saisie('z'))
    expect(modificationDe(a, '1', 'note')).toBeUndefined()
    expect(modificationDe(a, '2', 'status')).toBeUndefined()
  })
})
