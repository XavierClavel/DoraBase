import { describe, expect, it } from 'vitest'
import { reordonnerLaProjection, repliDeLaProjection } from './projection'

/** Le SQL seul — la plupart des cas ne regardent pas le repli d'affichage. */
const sqlDe = (sql: string, colonnes: readonly string[]) =>
  reordonnerLaProjection(sql, colonnes)?.sql ?? null

describe('reordonnerLaProjection', () => {
  it('réordonne une liste plate, et ne touche à rien d’autre — casse et `;` compris', () => {
    expect(
      sqlDe('SELECT id, statut, total FROM commandes WHERE actif;', ['statut', 'total', 'id']),
    ).toBe('SELECT statut, total, id FROM commandes WHERE actif;')
  })

  it('reprend chaque élément tel qu’écrit : casse, citation, qualification', () => {
    // PostgreSQL replie `ID` en `id` dans le résultat ; l'élément écrit, lui, doit revenir tel
    // quel — réécrire `id` changerait un texte que l'utilisateur a choisi.
    expect(
      sqlDe('select ID, o."Total", u.name from commandes o join users u on 1=1', [
        'name',
        'Total',
        'id',
      ]),
    ).toBe('select u.name, o."Total", ID from commandes o join users u on 1=1')
  })

  it('développe `select *` dans l’ordre demandé — sans repli quand la liste tient sur sa ligne', () => {
    expect(reordonnerLaProjection('select * from orders', ['statut', 'id', 'total'])).toEqual({
      sql: 'select statut, id, total from orders',
      repli: null,
    })
  })

  it('refuse de développer `*` quand un nom demanderait des guillemets, ou serait un mot-clé', () => {
    // Le style de citation dépend du moteur, que la fonction ne connaît pas.
    expect(sqlDe('select * from t', ['Total Cents', 'id'])).toBeNull()
    expect(sqlDe('select * from t', ['ID', 'total'])).toBeNull()
    // `order` nu serait lu comme un mot-clé — la requête écrite échouerait.
    expect(sqlDe('select * from t', ['order', 'id'])).toBeNull()
  })

  it('replie une longue liste sur plusieurs lignes, `from` rendu à la sienne — jamais d’ellipse dans le texte', () => {
    const colonnes = [
      'identifiant_commande',
      'identifiant_client',
      'statut_livraison',
      'montant_total_cents',
      'devise_facturation',
      'date_de_creation',
      'date_expedition',
      'code_promotionnel',
    ]
    const reecriture = reordonnerLaProjection('select * from orders limit 50', colonnes)
    const reecrit = reecriture?.sql ?? ''
    expect(reecrit).toBe(
      'select identifiant_commande, identifiant_client, statut_livraison,\n' +
        '  montant_total_cents, devise_facturation, date_de_creation, date_expedition,\n' +
        '  code_promotionnel\n' +
        'from orders limit 50',
    )
    // La requête reste **entière** : chaque colonne y est, aucune `…` ne la rend inexécutable.
    for (const colonne of colonnes) expect(reecrit).toContain(colonne)

    // Le repli d'**affichage** couvre les lignes de continuation : du premier retour à la ligne à
    // la fin de la liste, le `\n` final exclu — `from` garde sa ligne une fois la liste pliée.
    // C'est l'éditeur qui les cache derrière une `…` cliquable ; le texte, lui, les porte.
    expect(reecriture?.repli).toEqual({
      de: reecrit.indexOf('\n'),
      a: reecrit.indexOf('\nfrom'),
    })
  })

  it('refuse tout ce qui n’est pas une liste plate de colonnes', () => {
    const ordre = ['a', 'b']
    // Une expression, une fonction, un alias, `distinct` : réécrire sans les comprendre
    // corromprait la requête — le refus laisse l'éditeur intact, la grille se réordonne quand même.
    expect(sqlDe('select a + b from t', ordre)).toBeNull()
    expect(sqlDe('select count(*) from t', ordre)).toBeNull()
    expect(sqlDe('select a as x, b from t', ordre)).toBeNull()
    expect(sqlDe('select distinct a, b from t', ordre)).toBeNull()
    expect(sqlDe('with t as (select 1) select a, b from t', ordre)).toBeNull()
    expect(sqlDe('select t.* from t', ordre)).toBeNull()
    expect(sqlDe('select a, -- b\n b from t', ordre)).toBeNull()
    expect(sqlDe("select 'a', b from t", ordre)).toBeNull()
    expect(sqlDe('select a, b', ordre)).toBeNull()
  })

  it('refuse un script de plusieurs instructions, mais pas un `;` dans une chaîne', () => {
    // La réécriture porte sur la requête dont les colonnes sont le résultat ; un script en a
    // exécuté d'autres, et réécrire la première parlerait d'un autre résultat.
    expect(sqlDe('select a, b from t; select c from u', ['a', 'b'])).toBeNull()
    expect(sqlDe("select a, b from t where x = ';'", ['b', 'a'])).toBe(
      "select b, a from t where x = ';'",
    )
  })

  it('retire du select ce qui n’est plus demandé — le masquage d’une colonne', () => {
    expect(sqlDe('select a, b, c from t', ['a', 'b'])).toBe('select a, b from t')
    // Masquer sur un `select *` développe le reste : la requête dit exactement ce qui s'affiche.
    expect(sqlDe('select * from t', ['a', 'b'])).toBe('select a, b from t')
  })

  it('rend au select une colonne réaffichée — nue, sa forme écrite étant partie avec le retrait', () => {
    expect(sqlDe('select a from t', ['a', 'b'])).toBe('select a, b from t')
    // Un nom qui demanderait des guillemets ne se regénère pas : le style de citation dépend du
    // moteur. La réécriture entière refuse, et la requête garde l'état du masquage.
    expect(sqlDe('select a from t', ['a', 'Total'])).toBeNull()
  })

  it('refuse deux colonnes homonymes, écrites ou demandées', () => {
    expect(sqlDe('select a, a from t', ['a', 'a'])).toBeNull()
  })

  it('ne réécrit pas un texte qui n’est pas un `select` — un pipeline mongo, une mise à jour', () => {
    expect(sqlDe('db.orders.find({})', ['a'])).toBeNull()
    expect(sqlDe('update t set a = 1', ['a'])).toBeNull()
    expect(sqlDe('', ['a'])).toBeNull()
  })
})

describe('repliDeLaProjection', () => {
  it('trouve les lignes de continuation d’une liste écrite à la main — pas seulement des nôtres', () => {
    const sql = 'select a, b,\n  c, d\nfrom t'
    expect(repliDeLaProjection(sql)).toEqual({ de: sql.indexOf('\n'), a: sql.indexOf('\nfrom') })
  })

  it('ne replie ni une liste sur sa ligne, ni un simple retour avant `from`, ni l’illisible', () => {
    expect(repliDeLaProjection('select a, b from t')).toBeNull()
    // Le retour seul avant `from` n'a pas de ligne de continuation à cacher.
    expect(repliDeLaProjection('select a, b\nfrom t')).toBeNull()
    expect(repliDeLaProjection('select count(*),\n  a\nfrom t')).toBeNull()
  })
})
