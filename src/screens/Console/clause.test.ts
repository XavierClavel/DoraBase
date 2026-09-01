import { describe, expect, it } from 'vitest'
import { accepteDesColonnes, clauseA, enPositionDeTable, motsClesDe } from './clause'

/** La clause au bout du texte — c'est là que le curseur est en train de taper. */
function clauseDe(texte: string) {
  return clauseA(texte, texte.length)
}

describe('la clause où se trouve le curseur (`12d`)', () => {
  it('reconnaît les clauses d’un `select`', () => {
    expect(clauseDe('')).toBe('debut')
    expect(clauseDe('sel')).toBe('debut')
    expect(clauseDe('select cou')).toBe('select')
    expect(clauseDe('select * from ord')).toBe('table')
    expect(clauseDe('select * from orders o join us')).toBe('table')
    expect(clauseDe('select * from orders o on o.i')).toBe('on')
    expect(clauseDe('select * from orders where sta')).toBe('where')
    expect(clauseDe('select * from orders group by st')).toBe('groupe')
    expect(clauseDe('select * from orders group by status having cou')).toBe('having')
    expect(clauseDe('select * from orders order by crea')).toBe('tri')
    expect(clauseDe('select * from orders order by created_at limit 1')).toBe('limite')
  })

  it('`order by` et `group by` ne sont pas lus comme un `order` ou un `group` nus', () => {
    // Le motif est ancré sur les deux mots : sans cela, `order` seul aurait ouvert une clause que
    // personne n'a écrite.
    expect(clauseDe('select * from orders order by x')).toBe('tri')
    expect(clauseDe('select * from orders group by x')).toBe('groupe')
  })

  it('les formes en deux mots ouvrent leur clause', () => {
    // **Aucune de leurs moitiés ne l'ouvre seule** : sans `insert into`, la ligne suivante ne
    // rencontre aucun mot-clé et passe pour un début d'instruction. C'est l'assertion qui mord ;
    // `delete from` tiendrait par son seul `from`, et ne prouve donc rien.
    expect(clauseDe('delete from ord')).toBe('table')
    expect(clauseDe('insert into ord')).toBe('table')
    expect(clauseDe('update ord')).toBe('table')
    expect(clauseDe('update orders set sta')).toBe('set')
    expect(clauseDe('update orders set status = 1 returning i')).toBe('returning')
  })

  it('la liste de colonnes d’un `insert` est une clause de colonnes', () => {
    // La parenthèse ouverte la distingue de la place de la table.
    expect(clauseDe('insert into orders (sta')).toBe('colonnes')
    expect(clauseDe('insert into orders (status) values (')).toBe('valeurs')
  })

  it('une sous-requête rend la clause de son propre `select`', () => {
    // Elle ne demande aucune règle : son `select` est le dernier mot-clé lu.
    expect(clauseDe('select * from (select cou')).toBe('select')
    expect(clauseDe('select * from (select * from orders) t where sta')).toBe('where')
  })

  it('un `;` recommence une instruction', () => {
    // Sans cela, la seconde hériterait de la clause de la première : `asc` proposé au lieu de
    // `select`.
    expect(clauseDe('select * from orders order by x; ')).toBe('debut')
    expect(clauseDe('select * from orders order by x; sel')).toBe('debut')
  })

  it('un mot-clé en commentaire n’ouvre aucune clause', () => {
    expect(clauseDe('select cou -- order by\n')).toBe('select')
    expect(clauseDe('/* order by */ sel')).toBe('debut')
  })

  it('reconnaît la place où seule une table a un sens', () => {
    expect(enPositionDeTable('select * from ord', 17)).toBe(true)
    expect(enPositionDeTable('select * from orders o join us', 30)).toBe(true)
    // Une seconde table après une virgule est une place de table.
    expect(enPositionDeTable('select * from orders o, us', 26)).toBe(true)
    // L'alias suit la table, pas le mot-clé : `o` n'est pas une place de table.
    expect(enPositionDeTable('select * from orders o', 22)).toBe(false)
    // Et partout ailleurs, ce sont les colonnes qu'on écrit.
    expect(enPositionDeTable('select * from orders o where sta', 32)).toBe(false)
    expect(enPositionDeTable('select sta', 10)).toBe(false)
    expect(enPositionDeTable('select * from orders order by crea', 34)).toBe(false)
    // Un `from` en commentaire ne place rien — le seul cas qui le montre est celui où le commentaire
    // **finit** par `from …`.
    expect(enPositionDeTable('select * from orders o where sta -- from us', 43)).toBe(false)
  })

  it('les colonnes ne sont acceptées que là où elles s’écrivent', () => {
    for (const clause of [
      'select',
      'colonnes',
      'where',
      'on',
      'groupe',
      'tri',
      'having',
      'set',
      'returning',
    ] as const) {
      expect(accepteDesColonnes(clause)).toBe(true)
    }
    // **Ni à la place d'une table, ni au début d'une instruction, ni dans un `limit`.**
    for (const clause of ['debut', 'table', 'valeurs', 'limite'] as const) {
      expect(accepteDesColonnes(clause)).toBe(false)
    }
  })

  it('les mots-clés sont ceux de la clause, et pas les autres', () => {
    // Ce que l'utilisateur a signalé : `select` et des tables proposés après un `order by`.
    expect(motsClesDe('tri')).toContain('desc')
    expect(motsClesDe('tri')).not.toContain('select')
    expect(motsClesDe('tri')).not.toContain('where')
    // Une instruction ne commence pas par `and`.
    expect(motsClesDe('debut')).toContain('select')
    expect(motsClesDe('debut')).not.toContain('and')
    // `asc` n'a de sens que dans un tri.
    expect(motsClesDe('where')).not.toContain('asc')
    expect(motsClesDe('where')).toContain('and')
    // Ce qui suit la clause en fait partie : c'est là qu'on l'écrit.
    expect(motsClesDe('where')).toContain('group by')
    expect(motsClesDe('select')).toContain('from')
  })
})
