import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import { ColonneDroite } from './ColonneDroite'

function monter(props: Partial<Parameters<typeof ColonneDroite>[0]> = {}) {
  return render(
    <>
      <Sprite />
      <ColonneDroite {...props}>
        <p>corps</p>
      </ColonneDroite>
    </>,
  )
}

describe('le cadre de la colonne de droite (`22`)', () => {
  it('porte le couple de vues, et dit laquelle est à l’écran', async () => {
    const utilisateur = userEvent.setup()
    const onVueChange = vi.fn()
    monter({ vue: 'donnees', onVueChange })

    expect(screen.getByRole('button', { name: 'Données' })).toHaveAttribute('aria-pressed', 'true')
    // **`aria-pressed`, et non la seule pastille sombre.** Une couleur ne s'annonce pas à la voix, et
    // deux libellés du même gris ne diraient pas laquelle des deux vues est affichée.
    expect(screen.getByRole('button', { name: 'Structure' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await utilisateur.click(screen.getByRole('button', { name: 'Structure' }))
    expect(onVueChange).toHaveBeenCalledWith('structure')
  })

  it('sans table ouverte, il ne propose pas de basculer une structure', () => {
    monter({})
    // En `A4`, il n'y a pas de table dont on basculerait la structure. Rendre le couple inerte
    // annoncerait une bascule qui ne répond pas — le défaut n° 36.
    expect(screen.queryByRole('button', { name: 'Structure' })).toBeNull()
  })

  it('les flèches n’apparaissent qu’avec une navigation, et se désactivent aux bords', () => {
    const { unmount } = monter({ vue: 'donnees' })
    // Pas de ligne sélectionnée : pas de flèches. Les rendre désactivées ferait promettre un
    // parcours au-dessus d'un corps vide.
    expect(screen.queryByRole('button', { name: 'Ligne suivante' })).toBeNull()
    unmount()

    monter({ vue: 'donnees', navigation: { rang: 1, total: 2, onNavigate: () => {} } })
    expect(screen.getByRole('button', { name: 'Ligne précédente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ligne suivante' })).toBeEnabled()
  })

  it('au bout de la fenêtre, la flèche se désactive plutôt que de boucler', () => {
    monter({ vue: 'donnees', navigation: { rang: 2, total: 2, onNavigate: () => {} } })
    // Boucler ferait croire à un parcours infini sur une fenêtre de 500 lignes.
    expect(screen.getByRole('button', { name: 'Ligne suivante' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ligne précédente' })).toBeEnabled()
  })

  it('naviguer demande le rang voisin, il ne le décide pas seul', async () => {
    const utilisateur = userEvent.setup()
    const onNavigate = vi.fn()
    monter({ vue: 'donnees', navigation: { rang: 1, total: 3, onNavigate } })

    await utilisateur.click(screen.getByRole('button', { name: 'Ligne suivante' }))
    expect(onNavigate).toHaveBeenCalledWith(2)
  })

  it('le corps peut être vide, l’en-tête reste', () => {
    render(
      <>
        <Sprite />
        <ColonneDroite vue="donnees" onVueChange={() => {}} />
      </>,
    )
    // **C'est toute la raison d'être du cadre.** Le couple était dans `RowPanel` — il aurait disparu
    // avec lui dès qu'aucune ligne n'est sélectionnée, et disparu en vue Structure, où il est
    // justement ce qui permet de revenir aux données.
    expect(screen.getByRole('button', { name: 'Données' })).toBeInTheDocument()
  })
})
