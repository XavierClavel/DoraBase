import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { Preferences } from '../../domain/config'
import { PreferencesDialog } from './PreferencesDialog'
import { HAUTEUR_MIN, PREFERENCES_PAR_DEFAUT } from './preferences'

function monter(preferences: Preferences = PREFERENCES_PAR_DEFAUT) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <>
      <Sprite />
      <PreferencesDialog
        preferences={preferences}
        onChange={onChange}
        onClose={onClose}
        version="DoraBase 0.4.2 (arm64)"
      />
    </>,
  )
  return { onChange, onClose }
}

function allerA(nom: string) {
  return userEvent.click(screen.getByRole('tab', { name: nom }))
}

describe('la coquille (`15a`)', () => {
  it('liste les sept sections du mockup et affiche la version', () => {
    monter()
    expect(screen.getAllByRole('tab')).toHaveLength(7)
    expect(screen.getByText('DoraBase 0.4.2 (arm64)')).toBeInTheDocument()
  })

  it('ouvre sur Apparence, la seule section qui a du contenu', () => {
    monter()
    // Ouvrir sur « Général » montrerait d'abord une section qui annonce ce qu'elle portera.
    expect(screen.getByRole('tab', { name: 'Apparence' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Thème' })).toBeInTheDocument()
  })

  it('les sections sans contenu disent ce qu’elles porteront', async () => {
    monter()
    for (const nom of ['Général', 'Éditeur SQL', 'Connexions', 'Raccourcis']) {
      await allerA(nom)
      // **Ni cachées ni vides** : cacher ferait croire à une interface plus pauvre qu'elle ne sera,
      // laisser vide ferait croire à un défaut. La règle de `09f`, appliquée à une section.
      expect(screen.getByText(/Cette section portera/)).toBeInTheDocument()
    }
  })

  it('« Terminé » ferme sans valider : il n’y a rien à valider', async () => {
    const { onChange, onClose } = monter()
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    // Pas de bouton « Appliquer », donc pas de formulaire tampon : « Terminé » n'écrit rien de plus
    // que ce que chaque réglage a déjà écrit.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('« Réinitialiser » demande confirmation, et la confirmation dit ce qui revient', async () => {
    const { onChange } = monter({
      ...PREFERENCES_PAR_DEFAUT,
      theme: 'nuit',
      guards: { ...PREFERENCES_PAR_DEFAUT.guards, prodReadOnly: false },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }))

    // Elle dit **ce qui** revient, pas « êtes-vous sûr ? » — la règle de `08j` et `11d`.
    expect(screen.getByText(/garde-fous d’écriture seront réactivés/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /valeurs d’origine/ }))
    expect(onChange).toHaveBeenCalledWith(PREFERENCES_PAR_DEFAUT)
  })
})

describe('l’apparence (`15b`)', () => {
  it('les trois thèmes se choisissent, et l’actif est marqué', async () => {
    const { onChange } = monter()
    const groupe = screen.getByRole('radio', { name: /Cahier/ })
    expect(groupe).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: /Nuit/ }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'nuit' }))
  })

  it('dit que « Nuit » est incomplet, et ne le dit pas pour les autres', () => {
    monter({ ...PREFERENCES_PAR_DEFAUT, theme: 'nuit' })
    // **Dit, et non caché** : `tokens.json` n'a qu'une valeur par jeton. Cacher le réglage cacherait
    // aussi la raison de son absence.
    // **Le `role="status"` plutôt que le texte** : la phrase est coupée par un `<strong>`, donc un
    // sélecteur de texte trouve à la fois le paragraphe et ses ancêtres. Et le rôle est ce qui
    // compte — la réserve doit s'annoncer, pas seulement s'afficher.
    const reserve = screen.getByRole('status')
    expect(reserve.textContent).toMatch(/« Nuit » est\s+incomplet/)
  })

  it('le thème clair ne porte aucune réserve', () => {
    monter()
    expect(screen.queryByText(/incomplet/)).toBeNull()
  })

  it('les six accents sont nommés, pas seulement colorés', async () => {
    const { onChange } = monter()
    // Une couleur seule n'est pas un nom : « terracotta » doit s'annoncer à la voix.
    expect(
      screen.getAllByRole('radio', { name: /terracotta|framboise|brique|sauge|ardoise|violette/ }),
    ).toHaveLength(6)

    await userEvent.click(screen.getByRole('radio', { name: 'sauge' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ accent: 'sauge' }))
  })
})

describe('la grille et le code (`15c`)', () => {
  it('la densité se règle, et sa valeur s’affiche', async () => {
    const { onChange } = monter()
    await allerA('Grille de données')
    const curseur = screen.getByRole('slider', { name: 'Densité des lignes' })
    expect(screen.getByText('26px')).toBeInTheDocument()

    // **`fireEvent` sur un `input[type=range]`** : `userEvent.type` n'y produit pas d'événement de
    // changement, et `clear` refuse un contrôle non éditable. Le geste réel est un glissement, que
    // jsdom ne sait pas simuler — Playwright le fait, sur la géométrie.
    fireEvent.change(curseur, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ rowHeight: 30 }))
  })

  it('un corps de police élevé relève le plancher du curseur, et le dit', async () => {
    monter({ ...PREFERENCES_PAR_DEFAUT, codeFontTenths: 160, rowHeight: 26 })
    await allerA('Grille de données')

    const curseur = screen.getByRole('slider', { name: 'Densité des lignes' })
    // **La contrainte est portée par le curseur lui-même** : proposer une position que le disque
    // refuserait ferait remonter la valeur toute seule, ce qui se lirait comme un bogue.
    expect(Number(curseur.getAttribute('min'))).toBeGreaterThan(HAUTEUR_MIN)
    // Et la phrase dit pourquoi il ne descend plus.
    expect(screen.getByText(/le texte des cellules serait rogné/)).toBeInTheDocument()
  })

  it('au corps par défaut, aucune contrainte n’est annoncée', async () => {
    monter()
    await allerA('Grille de données')
    const curseur = screen.getByRole('slider', { name: 'Densité des lignes' })
    // Le mockup montre le curseur allant jusqu'à « compact » : la borne du handoff doit être
    // atteignable tel que le produit est livré.
    expect(Number(curseur.getAttribute('min'))).toBe(HAUTEUR_MIN)
    expect(screen.queryByText(/serait rogné/)).toBeNull()
  })

  it('la police du code se règle', async () => {
    const { onChange } = monter()
    await allerA('Grille de données')
    fireEvent.change(screen.getByRole('slider', { name: /Corps de la police/ }), {
      target: { value: '140' },
    })
    // 140 dixièmes, soit 14 px : le plancher de densité monte avec, ce que `borner` applique.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ codeFontTenths: 140 }))
  })
})

describe('les garde-fous (`15d`)', () => {
  it('les quatre apparaissent, et chacun dit ce qu’il protège', async () => {
    monter()
    await allerA('Sécurité & écriture')
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(4)
    // Chaque bascule dit **ce qu'elle protège**, pas comment elle marche — et ce qui arrive quand on
    // l'éteint, ce que `11d` réclamait avant de les rendre réglables.
    expect(screen.getByText(/part directement dans la base/)).toBeInTheDocument()
    expect(screen.getByText(/s’ouvre modifiable/)).toBeInTheDocument()
  })

  it('les trois premiers se règlent', async () => {
    const { onChange } = monter()
    await allerA('Sécurité & écriture')
    await userEvent.click(screen.getByRole('switch', { name: /lecture seule/ }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        guards: expect.objectContaining({ prodReadOnly: false }),
      }),
    )
  })

  it('« Garder le patch inverse » est désactivé avec sa raison, pas allumé sans effet', async () => {
    monter()
    await allerA('Sécurité & écriture')
    const bascule = screen.getByRole('switch', { name: /patch inverse/ })
    // **La leçon du défaut n° 36** : un réglage qui ne fait rien est pire qu'un réglage absent.
    // `11c` et `11d` avaient annoncé cette promesse puis l'avaient retirée, faute de persister.
    expect(bascule).toBeDisabled()
    expect(screen.getByText(/ce n’est pas encore tranché/)).toBeInTheDocument()
  })

  it('les quatre sont actifs sur des préférences neuves', async () => {
    monter()
    await allerA('Sécurité & écriture')
    const actifs = screen
      .getAllByRole('switch')
      .filter((bascule) => bascule.getAttribute('aria-checked') === 'true')
    // Trois allumés, le quatrième désactivé : le défaut du modèle est `true` pour les quatre, et
    // c'est ce qui compte — un défaut à `false` transformerait une mise à jour en levée
    // silencieuse des garde-fous.
    expect(actifs).toHaveLength(3)
  })
})

describe('la navigation', () => {
  it('changer de section ne perd pas les réglages affichés', async () => {
    monter({ ...PREFERENCES_PAR_DEFAUT, rowHeight: 32 })
    await allerA('Grille de données')
    expect(screen.getByText('32px')).toBeInTheDocument()
    await allerA('Apparence')
    await allerA('Grille de données')
    // L'état vient des propriétés, pas d'un état local de section : le contraire ferait revenir la
    // valeur par défaut au retour.
    expect(screen.getByText('32px')).toBeInTheDocument()
  })

  it('la modale porte son nom accessible', () => {
    monter()
    const modale = screen.getByRole('dialog', { name: 'Préférences' })
    expect(within(modale).getByRole('tablist', { name: /Sections/ })).toBeInTheDocument()
  })
})
