import { describe, expect, it } from 'vitest'
import type { DatabaseKey } from '../../domain/engine'
import {
  AUCUN_ONGLET,
  type EtatOnglets,
  fermer,
  idOnglet,
  ongletActif,
  ouvrir,
  reordonner,
} from './onglets'

const analytics: DatabaseKey = {
  project: 'Atelier Nord',
  database: 'analytics',
  environment: 'prod',
}
const shop: DatabaseKey = { project: 'Atelier Nord', database: 'shop', environment: 'prod' }

const orders = { key: analytics, schema: 'public', table: 'orders', kind: 'table' as const }
const items = { key: analytics, schema: 'public', table: 'order_items', kind: 'table' as const }

function avec(...ouverts: (typeof orders)[]): EtatOnglets {
  return ouverts.reduce(ouvrir, AUCUN_ONGLET)
}

describe('onglets', () => {
  it('ouvre une table et l’active', () => {
    const etat = ouvrir(AUCUN_ONGLET, orders)
    expect(etat.onglets).toHaveLength(1)
    expect(ongletActif(etat)).toEqual(orders)
  })

  it('rouvrir une table déjà ouverte l’active sans la dupliquer', () => {
    const etat = fermer(avec(orders, items), idOnglet(items))
    const rouvert = ouvrir(ouvrir(etat, items), orders)

    expect(rouvert.onglets).toHaveLength(2)
    expect(rouvert.actif).toBe(idOnglet(orders))
  })

  it('deux tables de même nom dans deux bases font deux onglets', () => {
    const autre = { ...orders, key: shop }
    const etat = ouvrir(ouvrir(AUCUN_ONGLET, orders), autre)

    expect(etat.onglets).toHaveLength(2)
    expect(idOnglet(orders)).not.toBe(idOnglet(autre))
  })

  it('fermer l’onglet actif active son voisin de droite', () => {
    const etat = { ...avec(orders, items), actif: idOnglet(orders) }
    expect(fermer(etat, idOnglet(orders)).actif).toBe(idOnglet(items))
  })

  it('fermer le dernier onglet de la bande active celui de gauche', () => {
    expect(fermer(avec(orders, items), idOnglet(items)).actif).toBe(idOnglet(orders))
  })

  it('fermer un onglet inactif ne change pas l’onglet actif', () => {
    const etat = { ...avec(orders, items), actif: idOnglet(items) }
    expect(fermer(etat, idOnglet(orders)).actif).toBe(idOnglet(items))
  })

  it('fermer le seul onglet laisse la bande sans actif, pas un écran fermé', () => {
    const etat = fermer(avec(orders), idOnglet(orders))
    expect(etat.onglets).toHaveLength(0)
    expect(etat.actif).toBeNull()
    expect(ongletActif(etat)).toBeNull()
  })

  it('réordonne, et refuse un ordre qui perdrait un onglet', () => {
    const etat = avec(orders, items)
    const inverse = reordonner(etat, [idOnglet(items), idOnglet(orders)])
    expect(inverse.onglets.map((o) => o.table)).toEqual(['order_items', 'orders'])

    const ampute = reordonner(etat, [idOnglet(items)])
    expect(ampute.onglets.map((o) => o.table)).toEqual(['orders', 'order_items'])
  })
})
