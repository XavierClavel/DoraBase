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
  viseeParLId,
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

describe('la cible d’un retrait (`08j`)', () => {
  const idDe = (projet: string, base: string) => `${projet}/${base}/prod::public.orders`

  it('vise les onglets de la base nommée, et pas ceux d’une voisine', () => {
    const cible = { kind: 'database' as const, project: 'Print', database: 'analytics' }
    expect(viseeParLId(cible, idDe('Print', 'analytics'))).toBe(true)
    expect(viseeParLId(cible, idDe('Print', 'shop'))).toBe(false)
  })

  it('ne confond pas deux noms dont l’un est le préfixe de l’autre', () => {
    // **Un test de préfixe de chaîne emporterait les onglets du voisin.** `Print` est un préfixe de
    // `Printemps`, et `analytics` de `analytics_old` : deux projets ou deux bases distincts dont
    // l'un ferait disparaître les onglets de l'autre. La comparaison porte sur les coordonnées
    // découpées, jamais sur le début de la chaîne.
    const projet = { kind: 'project' as const, project: 'Print' }
    expect(viseeParLId(projet, idDe('Printemps', 'analytics'))).toBe(false)

    const base = { kind: 'database' as const, project: 'Print', database: 'analytics' }
    expect(viseeParLId(base, idDe('Print', 'analytics_old'))).toBe(false)
  })

  it('un projet vise toutes ses bases', () => {
    const cible = { kind: 'project' as const, project: 'Print' }
    expect(viseeParLId(cible, idDe('Print', 'analytics'))).toBe(true)
    expect(viseeParLId(cible, idDe('Print', 'shop'))).toBe(true)
    expect(viseeParLId(cible, idDe('Outils', 'analytics'))).toBe(false)
  })
})
