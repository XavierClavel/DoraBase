import { describe, expect, it } from 'vitest'
import { limiteDe, poserLaLimite } from './limite'

describe('limiteDe', () => {
  it('lit le `limit` qui termine l’instruction, ponctuation finale comprise', () => {
    expect(limiteDe('select * from t limit 500')).toBe(500)
    expect(limiteDe('select * from t\nLIMIT 25;')).toBe(25)
    expect(limiteDe('select * from t limit 10 offset 20')).toBe(10)
    expect(limiteDe('select * from t limit 10 -- essai')).toBe(10)
  })

  it('ne lit ni la sous-requête, ni la chaîne, ni le script', () => {
    // Le `limit` d'une sous-requête n'est pas la limite de la requête.
    expect(limiteDe('select * from (select 1 limit 5) x')).toBeNull()
    // Un `limit 99` enfermé dans une chaîne finale n'est pas une clause.
    expect(limiteDe("select 'limit 99' from t")).toBeNull()
    // Un script : le stepper parlerait de la dernière instruction, pas de « la requête ».
    expect(limiteDe('select 1 limit 5; select 2 limit 7')).toBeNull()
    expect(limiteDe('select * from t')).toBeNull()
  })
})

describe('poserLaLimite', () => {
  it('remplace le nombre du `limit` final, sans toucher au reste', () => {
    expect(poserLaLimite('select * from t limit 500', 100)).toBe('select * from t limit 100')
    // Le `;`, la casse du mot-clé et l'`offset` restent à l'octet près.
    expect(poserLaLimite('select * from t\nLIMIT 25 offset 50;', 5000)).toBe(
      'select * from t\nLIMIT 5000 offset 50;',
    )
  })

  it('ajoute un `limit` à un `select` qui n’en porte pas, avant la ponctuation finale', () => {
    expect(poserLaLimite('select * from t', 500)).toBe('select * from t\nlimit 500')
    expect(poserLaLimite('select * from t;', 500)).toBe('select * from t\nlimit 500;')
    // Un `--` enfermé dans une chaîne finale n'est pas de la ponctuation : écrire à sa place
    // aurait inséré le `limit` au milieu du littéral.
    expect(poserLaLimite("select '-- a' from t", 100)).toBe("select '-- a' from t\nlimit 100")
  })

  it('refuse d’écrire là où un `limit` pourrait changer le sens ou échouer', () => {
    // `update … limit` est refusé par PostgreSQL et **change le sens** en MySQL.
    expect(poserLaLimite('update t set a = 1', 500)).toBeNull()
    expect(poserLaLimite('db.orders.find({})', 500)).toBeNull()
    expect(poserLaLimite('select 1; update t set a = 1', 500)).toBeNull()
    expect(poserLaLimite('', 500)).toBeNull()
  })
})
