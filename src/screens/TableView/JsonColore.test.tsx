import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { JsonColore } from './JsonColore'

/** La classe CSS appliquée au premier nœud portant ce texte. */
function classeDe(texte: string): string {
  return screen.getByText(texte, { selector: 'span' }).className
}

describe('JSON coloré', () => {
  it('distingue les clés des chaînes', () => {
    render(<JsonColore texte={'{\n  "email": "marie@example.com"\n}'} />)
    // Une clé est une chaîne **suivie de deux-points** : reconnue après la chaîne nue, toutes les
    // clés seraient colorées en chaînes.
    expect(classeDe('"email":')).toContain('cle')
    expect(classeDe('"marie@example.com"')).toContain('chaine')
  })

  it('colore nombres, booléens et null comme le mockup', () => {
    render(<JsonColore texte={'{"n": 42, "b": true, "v": null}'} />)
    expect(classeDe('42')).toContain('nombre')
    expect(classeDe('true')).toContain('nombre')
    expect(classeDe('null')).toContain('nombre')
  })

  it('rend le texte intact, sans en perdre ni en ajouter', () => {
    const texte = '{\n  "a": [1, 2],\n  "b": "x"\n}'
    const { container } = render(<JsonColore texte={texte} />)
    // Le découpage ne doit rien avaler : c'est le défaut classique d'une colorisation par
    // expression rationnelle.
    expect(container.textContent).toBe(texte)
  })

  it('un JSON vide ou une chaîne quelconque ne casse rien', () => {
    const { container } = render(<JsonColore texte="" />)
    expect(container.textContent).toBe('')
  })
})
