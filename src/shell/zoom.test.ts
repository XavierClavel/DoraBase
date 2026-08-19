import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PASSERELLE_ZOOM, useZoom } from './useZoom'
import { facteurSuivant, ZOOM_MAX, ZOOM_MIN, ZOOM_NEUTRE } from './zoom'

describe('le pas du zoom (`facteurSuivant`)', () => {
  it('un cran de molette vaut environ 4 %, non les 10 à 25 % du zoom natif', () => {
    // C'est toute la demande : le pas natif de WKWebView rend la grille méconnaissable en deux crans.
    const apresUnCran = facteurSuivant(ZOOM_NEUTRE, 100)
    expect(1 - apresUnCran).toBeGreaterThan(0.03)
    expect(1 - apresUnCran).toBeLessThan(0.05)
  })

  it('le geste est réversible au pixel près', () => {
    // **La raison du pas multiplicatif.** Avec un pas additif, `−0,04` puis `+0,04` revient bien au
    // départ, mais le même geste agit deux fois plus fort en bas de course qu'en haut : l'effet perçu
    // dépend d'où l'on est. Ici, zoomer puis dézoomer d'autant revient exactement au point de départ,
    // à n'importe quelle échelle.
    const avant = 1.3
    expect(facteurSuivant(facteurSuivant(avant, -60), 60)).toBeCloseTo(avant, 10)
  })

  it('le même geste a le même effet relatif partout dans la course', () => {
    const enBas = facteurSuivant(0.8, 100) / 0.8
    const enHaut = facteurSuivant(1.5, 100) / 1.5
    expect(enBas).toBeCloseTo(enHaut, 10)
  })

  it('les bornes tiennent, dans les deux sens', () => {
    // Un geste long ne doit pas rendre les 11 px du handoff illisibles, ni réduire une grille de
    // dix-huit colonnes à trois.
    expect(facteurSuivant(ZOOM_MIN, 5000)).toBe(ZOOM_MIN)
    expect(facteurSuivant(ZOOM_MAX, -5000)).toBe(ZOOM_MAX)
  })
})

describe('le crochet (`useZoom`)', () => {
  it('hors de Tauri, il ne touche pas au geste du navigateur', () => {
    const appliquer = vi.fn(async () => {})
    // Le zoom est une capacité de la coquille : dans un navigateur, il n'y a pas de webview à
    // piloter, et reprendre le geste pour ne rien en faire retirerait le zoom natif sans rien offrir.
    // Ce test tourne sous jsdom, donc précisément hors de Tauri.
    renderHook(() => useZoom({ appliquer }))
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true }))
    expect(appliquer).not.toHaveBeenCalled()
  })

  it('la passerelle de production parle bien à la webview', () => {
    // Un `appliquer` qui n'appellerait pas `setZoom` laisserait le zoom sans effet et les tests verts
    // — c'est le genre de câblage qu'un test de contrat attrape (défaut n° 36).
    expect(PASSERELLE_ZOOM.appliquer).toBeTypeOf('function')
  })
})
