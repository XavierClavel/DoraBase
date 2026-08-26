import { describe, expect, it } from 'vitest'
import type { Preferences } from '../../domain/config'
import {
  borner,
  HAUTEUR_MAX,
  HAUTEUR_MIN,
  hauteurMinimalePour,
  jetonsDe,
  PALETTE,
  PREFERENCES_PAR_DEFAUT,
  themeApplique,
} from './preferences'

function avec(partiel: Partial<Preferences>): Preferences {
  return { ...PREFERENCES_PAR_DEFAUT, ...partiel }
}

describe('hauteurMinimalePour', () => {
  it('rend exactement la borne du handoff au corps par défaut', () => {
    // **Calibré, pas choisi** : le mockup montre le curseur allant jusqu'à « compact », donc 20 px
    // doit être atteignable tel que le produit est livré. Un facteur de 1,45 rendait 21 px et
    // interdisait cette position.
    expect(hauteurMinimalePour(125)).toBe(HAUTEUR_MIN)
  })

  it('relève le plancher quand le corps grandit', () => {
    expect(hauteurMinimalePour(160)).toBeGreaterThan(HAUTEUR_MIN)
  })

  it('ne dépasse jamais la borne haute', () => {
    expect(hauteurMinimalePour(9999)).toBe(HAUTEUR_MAX)
  })
})

describe('borner', () => {
  it('ramène une hauteur trop petite au plancher du corps courant', () => {
    expect(borner(avec({ rowHeight: 3 })).rowHeight).toBe(HAUTEUR_MIN)
  })

  it('un corps élevé interdit la densité la plus compacte', () => {
    // La contrainte de `15c` : du code en 16 px dans une grille de 20 px serait rogné.
    const serrees = borner(avec({ codeFontTenths: 160, rowHeight: HAUTEUR_MIN }))
    expect(serrees.rowHeight).toBeGreaterThan(HAUTEUR_MIN)
  })

  it('ramène un corps hors bornes sans toucher au reste', () => {
    const bornees = borner(avec({ codeFontTenths: 9999 }))
    expect(bornees.codeFontTenths).toBe(160)
    expect(bornees.guards).toEqual(PREFERENCES_PAR_DEFAUT.guards)
  })

  it('donne la même réponse que le modèle Rust au corps par défaut', () => {
    // Le doublon de formule est assumé (voir `hauteurMinimalePour`) : ce test est ce qui garantit
    // qu'il ne dérive pas silencieusement. Les valeurs viennent des tests Rust de `store.rs`.
    expect(borner(avec({ rowHeight: 26 })).rowHeight).toBe(26)
    expect(borner(avec({ codeFontTenths: 100, rowHeight: 20 })).rowHeight).toBe(20)
  })
})

describe('jetonsDe', () => {
  it('redéfinit la hauteur de ligne, le corps du code et l’accent', () => {
    const jetons = jetonsDe(avec({ rowHeight: 32, codeFontTenths: 110, accent: 'sauge' }))
    expect(jetons['--rowh']).toBe('32px')
    expect(jetons['--text-code']).toBe('11px')
    expect(jetons['--accent']).toBe('#2E9E6B')
  })

  it('ne redéfinit rien d’autre : une préférence n’est pas un thème complet', () => {
    // Redéfinir plus de jetons ici ferait de cet écran une seconde source de vérité pour le design,
    // à côté de `tokens.json`.
    expect(Object.keys(jetonsDe(PREFERENCES_PAR_DEFAUT)).sort()).toEqual([
      '--accent',
      '--rowh',
      '--text-code',
    ])
  })

  it('les six accents de la palette sont ceux que le handoff déclare', () => {
    expect(PALETTE.map((entree) => entree.couleur)).toEqual([
      '#F2653A',
      '#DB3753',
      '#E4573F',
      '#2E9E6B',
      '#3B82C4',
      '#7C5CD6',
    ])
  })
})

describe('themeApplique', () => {
  it('rend null pour « Système », pour que prefers-color-scheme décide', () => {
    // Poser un attribut « système » obligerait le CSS à traiter un troisième cas qui ne décrit
    // aucune couleur.
    expect(themeApplique(avec({ theme: 'systeme' }))).toBeNull()
    expect(themeApplique(avec({ theme: 'nuit' }))).toBe('nuit')
    expect(themeApplique(avec({ theme: 'cahier' }))).toBe('cahier')
  })
})
