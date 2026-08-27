import { describe, expect, it } from 'vitest'
import type { ColumnInfo, Value } from '../../domain/engine'
import {
  ajouterUneLigne,
  annulerLaDerniere,
  estEditable,
  estEditableALAjout,
  estIdentique,
  estMarqueePourSuppression,
  lignesAjoutees,
  lignesModifiees,
  type Modification,
  type ModificationDeCellule,
  marquerPourSuppression,
  modificationDe,
  raisonDuRefus,
  retenir,
  retirer,
  saisirDansLaLigne,
  texteBrutDe,
  valeurDeLaLigne,
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

/** La modification de cellule attendue à ce rang — les assertions portent sur ses champs. */
function cellule(modification: Modification | undefined): ModificationDeCellule {
  if (modification === undefined || modification.sorte !== 'cellule') {
    throw new Error('une modification de cellule était attendue')
  }
  return modification
}
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
    expect(cellule(a[0]).avant).toEqual({ kind: 'text', value: 'paid' })
    expect(cellule(a[0]).apres).toEqual(saisie('shipped'))
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
    expect(cellule(a[0]).avant).toEqual({ kind: 'text', value: 'paid' })
    expect(cellule(a[0]).apres).toEqual(saisie('refunded'))
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
    expect(retirer(a, '1', 'status').map((m) => cellule(m).column)).toEqual(['note'])
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

describe('ajouter une ligne', () => {
  it('chaque appel en ajoute une, numérotée dans l’ordre', () => {
    let a = ajouterUneLigne([])
    a = ajouterUneLigne(a)
    expect(lignesAjoutees(a).map((ligne) => ligne.rang)).toEqual([1, 2])
    // Deux lignes ajoutées sont deux entrées **distinctes** : leurs identités locales ne doivent pas
    // se confondre, sans quoi une saisie dans l'une apparaîtrait dans l'autre.
    expect(new Set(a.map((m) => m.cle)).size).toBe(2)
  })

  it('une ligne neuve n’a aucune valeur : tout est au défaut de la base', () => {
    const [ligne] = lignesAjoutees(ajouterUneLigne([]))
    expect(ligne?.valeurs).toEqual({})
  })

  it('un retrait libère son numéro, comme pour les consoles', () => {
    let a = ajouterUneLigne(ajouterUneLigne([]))
    const premiere = lignesAjoutees(a)[0]
    a = retirer(a, premiere?.cle ?? '', '')
    a = ajouterUneLigne(a)
    // Le plus petit numéro libre, sinon les numéros affichés finiraient troués — « +2, +3 » après
    // avoir retiré la première, alors qu'il n'y en a que deux.
    expect(
      lignesAjoutees(a)
        .map((ligne) => ligne.rang)
        .sort(),
    ).toEqual([1, 2])
  })

  it('une ligne ajoutée compte pour une seule entrée, quelles que soient ses valeurs', () => {
    let a = ajouterUneLigne([])
    a = saisirDansLaLigne(a, 'nouvelle-1', 'status', saisie('pending'))
    a = saisirDansLaLigne(a, 'nouvelle-1', 'note', saisie('urgent'))
    // **Le compte est celui des écritures qui partiront** : deux cellules remplies dans une ligne
    // neuve font un seul `INSERT`, et les compter deux annoncerait une écriture qui n'existe pas.
    expect(a).toHaveLength(1)
  })

  it('retirer une ligne ajoutée l’enlève entière, quelle que soit la colonne passée', () => {
    let a = ajouterUneLigne([])
    a = saisirDansLaLigne(a, 'nouvelle-1', 'status', saisie('pending'))
    // Sa carte ne porte qu'une croix : il n'y a pas de colonne à retirer isolément.
    expect(retirer(a, 'nouvelle-1', 'peu importe')).toHaveLength(0)
  })

  it('⌘Z défait le dernier geste, ajout de ligne compris', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = ajouterUneLigne(a)
    a = annulerLaDerniere(a)
    expect(lignesAjoutees(a)).toHaveLength(0)
    expect(a).toHaveLength(1)
  })
})

describe('marquer pour suppression', () => {
  it('marque une ligne lue, comptée pour une entrée', () => {
    const a = marquerPourSuppression([], '1', 3)
    expect(a).toHaveLength(1)
    expect(estMarqueePourSuppression(a, '1')).toBe(true)
  })

  it('le geste bascule : marquer une ligne déjà marquée annule la marque', () => {
    let a = marquerPourSuppression([], '1', 3)
    a = marquerPourSuppression(a, '1', 3)
    expect(a).toHaveLength(0)
    expect(estMarqueePourSuppression(a, '1')).toBe(false)
  })

  it('marquer efface les modifications de cellule en attente de cette ligne', () => {
    let a = poser([], '1', 'status', { kind: 'text', value: 'a' }, 'z')
    a = poser(a, '2', 'note', { kind: 'text', value: 'b' }, 'y')
    a = marquerPourSuppression(a, '1', 1)
    // La cellule de la ligne 1 a disparu, celle de la ligne 2 reste intacte.
    expect(a.filter((m) => m.sorte === 'cellule').map((m) => m.cle)).toEqual(['2'])
    expect(estMarqueePourSuppression(a, '1')).toBe(true)
  })

  it('marquer une ligne ajoutée, pas encore écrite, la retire entière', () => {
    let a = ajouterUneLigne([])
    a = saisirDansLaLigne(a, 'nouvelle-1', 'status', saisie('pending'))
    a = marquerPourSuppression(a, 'nouvelle-1', 1)
    // Rien à marquer, rien à écrire pour annuler : le même geste que la croix du panneau sur une
    // carte « nouvelle ligne ».
    expect(a).toHaveLength(0)
    expect(lignesAjoutees(a)).toHaveLength(0)
  })

  it('retirer(cle, colonne) enlève aussi une marque de suppression', () => {
    const a = marquerPourSuppression([], '1', 3)
    expect(retirer(a, '1', '')).toHaveLength(0)
  })
})

describe('saisir dans une ligne ajoutée', () => {
  it('la valeur saisie se relit par sa colonne', () => {
    const a = saisirDansLaLigne(ajouterUneLigne([]), 'nouvelle-1', 'status', saisie('pending'))
    expect(valeurDeLaLigne(a, 'nouvelle-1', 'status')).toEqual(saisie('pending'))
    expect(valeurDeLaLigne(a, 'nouvelle-1', 'note')).toBeUndefined()
  })

  it('vider une cellule la rend au défaut, et ce n’est pas la chaîne vide', () => {
    let a = saisirDansLaLigne(ajouterUneLigne([]), 'nouvelle-1', 'note', saisie('x'))
    a = saisirDansLaLigne(a, 'nouvelle-1', 'note', null)
    // **Absente, pas vide** : une colonne absente laisse la base appliquer son défaut, une colonne à
    // `''` écrit une chaîne vide. Les confondre volerait à la table ses valeurs par défaut.
    expect(valeurDeLaLigne(a, 'nouvelle-1', 'note')).toBeUndefined()
    expect(lignesAjoutees(a)[0]?.valeurs).toEqual({})
  })

  it('un NULL demandé reste une valeur', () => {
    const a = saisirDansLaLigne(ajouterUneLigne([]), 'nouvelle-1', 'note', NUL)
    expect(valeurDeLaLigne(a, 'nouvelle-1', 'note')).toEqual(NUL)
  })

  it('saisir dans une ligne ne touche pas les autres', () => {
    let a = ajouterUneLigne(ajouterUneLigne([]))
    a = saisirDansLaLigne(a, 'nouvelle-1', 'status', saisie('x'))
    expect(valeurDeLaLigne(a, 'nouvelle-2', 'status')).toBeUndefined()
  })

  it('la clé primaire est saisissable à l’ajout, contrairement à la modification', () => {
    const cle = colonne('id', { key: 'primary', category: 'number' })
    // Il n'y a aucun `WHERE` à déplacer : refuser la clé interdirait d'ajouter une ligne à une table
    // dont la clé est un code saisi.
    expect(estEditable(cle)).toBe(false)
    expect(estEditableALAjout(cle)).toBe(true)
    // Le binaire reste refusé, pour la raison qui ne change pas.
    expect(estEditableALAjout(colonne('blob', { category: 'binary' }))).toBe(false)
  })
})
