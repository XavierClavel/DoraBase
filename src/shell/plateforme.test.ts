import { describe, expect, it } from 'vitest'
import {
  estWindows,
  modificateurActif,
  plateforme,
  raccourci,
  seulLeModificateur,
} from './plateforme'

/*
 * Les deux plateformes sont exercées **dans les deux sens**, sur la machine qui exécute les
 * tests, parce qu'elles sont passées en paramètre. Sans ce paramètre, `__APP_PLATFORM__` étant
 * figé à la compilation, une seule des deux branches aurait jamais été mesurée — et ce serait
 * celle qui marchait déjà.
 */

describe('raccourci', () => {
  it('écrit la convention macOS : symboles collés, ⌘ juste avant la touche', () => {
    expect(raccourci('N', {}, 'macos')).toBe('⌘N')
    expect(raccourci('E', { maj: true }, 'macos')).toBe('⇧⌘E')
    expect(raccourci('H', { alt: true }, 'macos')).toBe('⌥⌘H')
    expect(raccourci('↩', {}, 'macos')).toBe('⌘↩')
  })

  it('écrit la convention Windows : Ctrl en tête, jointure par +', () => {
    expect(raccourci('N', {}, 'windows')).toBe('Ctrl+N')
    expect(raccourci('E', { maj: true }, 'windows')).toBe('Ctrl+Shift+E')
    expect(raccourci('H', { alt: true }, 'windows')).toBe('Ctrl+Alt+H')
  })

  /**
   * **Le test qui justifie la fonction.** Un simple remplacement de `⌘` par `Ctrl+` aurait rendu
   * « Shift+Ctrl+E » : l'ordre des modificateurs s'inverse entre les deux conventions, et aucune
   * substitution de caractère ne peut l'exprimer.
   */
  it("inverse l'ordre des modificateurs, il ne substitue pas un symbole", () => {
    expect(raccourci('E', { maj: true }, 'macos')).toBe('⇧⌘E')
    expect(raccourci('E', { maj: true }, 'windows')).toBe('Ctrl+Shift+E')
    expect(raccourci('E', { maj: true }, 'windows')).not.toContain('Shift+Ctrl')
  })

  it('traduit le nom des touches que Windows écrit en mots', () => {
    expect(raccourci('↩', {}, 'windows')).toBe('Ctrl+Enter')
    // Une touche ordinaire traverse inchangée.
    expect(raccourci('0', {}, 'windows')).toBe('Ctrl+0')
  })
})

describe('modificateurActif', () => {
  it('macOS : ⌘ ouvre, ctrl non', () => {
    expect(modificateurActif({ metaKey: true, ctrlKey: false }, 'macos')).toBe(true)
    expect(modificateurActif({ metaKey: false, ctrlKey: true }, 'macos')).toBe(false)
  })

  /**
   * **Le défaut que ceci garde** : `metaKey` sous Windows est la touche Windows. Un
   * gestionnaire resté sur `metaKey` n'aurait pas levé d'erreur — le raccourci n'aurait jamais
   * répondu, pendant que son libellé continuait de l'annoncer.
   */
  it('Windows : Ctrl ouvre, la touche Windows non', () => {
    expect(modificateurActif({ metaKey: false, ctrlKey: true }, 'windows')).toBe(true)
    expect(modificateurActif({ metaKey: true, ctrlKey: false }, 'windows')).toBe(false)
  })
})

describe('seulLeModificateur', () => {
  const nu = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  it('macOS : ⌘ seul oui, ⇧⌘ non, ⌃⌘ non', () => {
    expect(seulLeModificateur({ ...nu, metaKey: true }, 'macos')).toBe(true)
    expect(seulLeModificateur({ ...nu, metaKey: true, shiftKey: true }, 'macos')).toBe(false)
    expect(seulLeModificateur({ ...nu, metaKey: true, ctrlKey: true }, 'macos')).toBe(false)
  })

  /**
   * **Le défaut qu'un portage naïf aurait laissé.** L'ancienne condition excluait `ctrlKey`
   * comme « un modificateur qui n'est pas le nôtre » ; sous Windows c'est le nôtre. Si la touche
   * exclue restait `ctrl`, la première assertion ci-dessous rendrait `false` et `Ctrl+N`
   * n'ouvrirait jamais rien — sans erreur, sans trace.
   */
  it('Windows : Ctrl seul oui, Ctrl+Shift non, Ctrl+Win non', () => {
    expect(seulLeModificateur({ ...nu, ctrlKey: true }, 'windows')).toBe(true)
    expect(seulLeModificateur({ ...nu, ctrlKey: true, shiftKey: true }, 'windows')).toBe(false)
    expect(seulLeModificateur({ ...nu, ctrlKey: true, metaKey: true }, 'windows')).toBe(false)
  })

  it("sans le modificateur, c'est non sur les deux", () => {
    expect(seulLeModificateur(nu, 'macos')).toBe(false)
    expect(seulLeModificateur(nu, 'windows')).toBe(false)
  })
})

describe('plateforme', () => {
  it('rend une des deux valeurs connues, quelle que soit la machine', () => {
    expect(['macos', 'windows']).toContain(plateforme())
  })

  it('estWindows suit son paramètre', () => {
    expect(estWindows('windows')).toBe(true)
    expect(estWindows('macos')).toBe(false)
  })
})
