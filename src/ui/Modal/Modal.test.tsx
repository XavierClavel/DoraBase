import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { Modal } from './Modal'

function monter(ui: React.ReactNode) {
  return render(<LanguageProvider preferences={{ language: 'fr' }}>{ui}</LanguageProvider>)
}

/**
 * L'ordre des focalisables d'une modale montée avec ce décor est, dans le DOM :
 * `Fermer` (en-tête), `premier`, `dernier` (corps). Les tests ci-dessous s'appuient
 * dessus explicitement, parce qu'un piège de focus ne se raisonne pas dans le vide.
 */
function Ouvrable({ children }: { children?: React.ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}>
        Ouvrir
      </button>
      {ouvert && (
        <Modal title="Nouvelle connexion" icon="db" onClose={() => setOuvert(false)}>
          {children ?? (
            <>
              <button type="button">premier</button>
              <button type="button">dernier</button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

function Simple({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <Modal title="Nouvelle connexion" icon="db" onClose={onClose}>
      <button type="button">champ</button>
    </Modal>
  )
}

test('s’annonce comme une boîte de dialogue modale, nommée par son titre', () => {
  monter(<Simple />)
  expect(screen.getByRole('dialog', { name: 'Nouvelle connexion' })).toHaveAttribute(
    'aria-modal',
    'true',
  )
})

test('esc ferme', async () => {
  const onClose = vi.fn()
  monter(<Simple onClose={onClose} />)
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

test('esc dans un champ rend le focus à la modale, il ne la ferme pas', async () => {
  const onClose = vi.fn()
  monter(
    <Modal title="Nouvelle connexion" icon="db" onClose={onClose}>
      <input aria-label="Hôte" defaultValue="localhost" />
    </Modal>,
  )

  const champ = screen.getByLabelText('Hôte')
  champ.focus()
  await userEvent.keyboard('{Escape}')

  // **Une frappe destinée à sortir d'un champ ne doit pas jeter le formulaire.** L'utilisateur
  // qui vient de saisir dix valeurs les perdrait.
  expect(onClose).not.toHaveBeenCalled()
  expect(champ).not.toHaveFocus()
  expect(screen.getByRole('dialog')).toHaveFocus()

  // Le focus étant revenu sur la coquille, un second `esc` ferme comme attendu.
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

test('esc depuis un bouton ferme sans détour', async () => {
  const onClose = vi.fn()
  monter(<Simple onClose={onClose} />)

  // Un bouton n'a pas de saisie à abandonner : exiger deux `esc` serait une friction sans raison.
  screen.getByRole('button', { name: 'champ' }).focus()
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledOnce()
})

test('la croix ferme', async () => {
  const onClose = vi.fn()
  monter(<Simple onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))
  expect(onClose).toHaveBeenCalledOnce()
})

test('un clic sur le voile ferme', async () => {
  const onClose = vi.fn()
  monter(<Simple onClose={onClose} />)
  await userEvent.click(screen.getByTestId('veil'))
  expect(onClose).toHaveBeenCalledOnce()
})

// Le complément du précédent : un `onClick` posé sur le voile fermerait aussi la modale à
// chaque clic *dans* la coquille, par propagation. C'est le défaut classique de ce motif.
test('un clic dans la coquille ne ferme pas', async () => {
  const onClose = vi.fn()
  monter(<Simple onClose={onClose} />)
  await userEvent.click(screen.getByRole('dialog'))
  await userEvent.click(screen.getByRole('button', { name: 'champ' }))
  expect(onClose).not.toHaveBeenCalled()
})

// --- Les trois exigences du piège de focus, vérifiées séparément (spec `08a`) ---

// Le focus va au premier focalisable du **corps**, pas de la modale entière.
//
// La croix précède le corps dans le DOM, donc « premier focalisable de la modale » serait
// elle. Or ouvrir une modale focus sur sa croix signifie qu'un `Entrée` réflexe la referme
// aussitôt — et l'utilisateur qui voulait remplir un formulaire recommence. Le corps
// d'abord est le seul choix défendable.
test('1. le focus va au premier champ du corps, pas à la croix', async () => {
  monter(<Ouvrable />)
  await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
  expect(screen.getByRole('button', { name: 'premier' })).toHaveFocus()
})

test('2. Tab depuis le dernier focalisable revient au premier de la modale', async () => {
  monter(<Ouvrable />)
  await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))

  await userEvent.tab() // premier → dernier
  expect(screen.getByRole('button', { name: 'dernier' })).toHaveFocus()
  await userEvent.tab() // dernier → boucle sur la croix, premier du DOM
  expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
})

test('2b. Shift+Tab depuis le premier focalisable va au dernier', async () => {
  monter(<Ouvrable />)
  await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))

  await userEvent.tab({ shift: true }) // premier → croix
  expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
  await userEvent.tab({ shift: true }) // croix → boucle sur le dernier
  expect(screen.getByRole('button', { name: 'dernier' })).toHaveFocus()
})

test('3. le focus revient à son origine à la fermeture', async () => {
  monter(<Ouvrable />)
  const declencheur = screen.getByRole('button', { name: 'Ouvrir' })
  await userEvent.click(declencheur)
  await userEvent.keyboard('{Escape}')
  // Sans restitution, le focus reste sur `<body>` et la navigation clavier repart du haut
  // de la page. C'est l'exigence qu'on oublie.
  expect(declencheur).toHaveFocus()
})

// **Ce test a d'abord été écrit trop faible** : il tabulait quatre fois puis vérifiait que
// « derrière » n'avait pas le focus. Sous sabotage — piège de tabulation retiré — il restait
// vert, parce que l'ordre de tabulation de jsdom ne l'y amenait pas en quatre coups. Un test
// qui passe quand le sujet est cassé ne vérifie rien.
//
// La version qui mord : après **chaque** tabulation, le focus doit être dans la coquille.
// Le piège retiré, il en sort dès la troisième.
test('le focus reste dans la coquille à chaque tabulation', async () => {
  monter(
    <>
      <button type="button">avant</button>
      <Modal title="T" icon="db" onClose={() => {}}>
        <button type="button">dedans</button>
      </Modal>
      <button type="button">derrière</button>
    </>,
  )
  const coquille = screen.getByRole('dialog')

  for (let i = 0; i < 6; i++) {
    await userEvent.tab()
    expect(coquille.contains(document.activeElement)).toBe(true)
  }
})

test('une modale sans corps focalisable met le focus sur sa croix', async () => {
  // Le repli : sans lui le focus resterait sur `<body>`, hors de la modale, et le piège
  // n'aurait rien à retenir.
  monter(
    <Modal title="T" icon="db" onClose={() => {}}>
      <p>rien de focalisable</p>
    </Modal>,
  )
  expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
})

test('le pied est rendu quand il est fourni', () => {
  monter(
    <Modal title="T" icon="db" onClose={() => {}} footer={<button type="button">Annuler</button>}>
      <p>corps</p>
    </Modal>,
  )
  expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
})

test('sans pied, aucune bande de pied n’est rendue', () => {
  monter(
    <Modal title="T" icon="db" onClose={() => {}}>
      <p>corps</p>
    </Modal>,
  )
  expect(screen.queryByTestId('modal-footer')).not.toBeInTheDocument()
})

// --- Modales superposées (A3 par-dessus A2) ---

// **Ce test manquait à `08a`**, qui n'exerçait qu'une modale à la fois. Le défaut est apparu en
// `08d` : chaque instance écoute `keydown` sur `document`, donc un `esc` fermait `A2` et `A3`
// ensemble. `stopPropagation` n'y aurait rien changé — les deux écouteurs sont sur la même
// cible. Seule la modale du sommet doit répondre.
test('esc ne ferme que la modale du dessus', async () => {
  const fermerDessous = vi.fn()
  const fermerDessus = vi.fn()
  monter(
    <>
      <Modal title="Dessous" icon="db" onClose={fermerDessous}>
        <button type="button">champ</button>
      </Modal>
      <Modal title="Dessus" icon="warn" nested onClose={fermerDessus}>
        <button type="button">fermer</button>
      </Modal>
    </>,
  )

  await userEvent.keyboard('{Escape}')
  expect(fermerDessus).toHaveBeenCalledOnce()
  expect(fermerDessous).not.toHaveBeenCalled()
})

test('après la fermeture du dessus, esc ferme celle du dessous', async () => {
  const fermerDessous = vi.fn()
  function Superposees() {
    const [dessus, setDessus] = useState(true)
    return (
      <>
        <Modal title="Dessous" icon="db" onClose={fermerDessous}>
          <button type="button">champ</button>
        </Modal>
        {dessus && (
          <Modal title="Dessus" icon="warn" nested onClose={() => setDessus(false)}>
            <button type="button">fermer</button>
          </Modal>
        )}
      </>
    )
  }
  monter(<Superposees />)

  await userEvent.keyboard('{Escape}') // ferme celle du dessus
  await userEvent.keyboard('{Escape}') // doit maintenant atteindre celle du dessous
  expect(fermerDessous).toHaveBeenCalledOnce()
})
