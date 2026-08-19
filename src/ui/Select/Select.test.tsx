import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { choisirDansLaListe } from './pourLesTests'
import { Select } from './Select'

const MODES = [
  { value: 'disable', label: 'disable' },
  { value: 'prefer', label: 'prefer' },
  { value: 'require', label: 'require' },
] as const

function Piloté() {
  const [mode, setMode] = useState<'disable' | 'prefer' | 'require'>('prefer')
  return <Select label="Mode SSL" options={MODES} value={mode} onValueChange={setMode} />
}

test('l’étiquette nomme le champ', () => {
  render(<Piloté />)
  expect(screen.getByRole('combobox', { name: 'Mode SSL' })).toBeInTheDocument()
})

test('la valeur courante est celle affichée', () => {
  render(<Piloté />)
  // **`toHaveTextContent` et non `toHaveValue`.** Le champ n'est plus un `<select>` : il n'a pas de
  // `value`, il affiche le libellé de l'option choisie. Ce qui compte est ce que l'utilisateur lit.
  expect(screen.getByRole('combobox')).toHaveTextContent('prefer')
})

test('choisir une option remonte sa valeur', async () => {
  render(<Piloté />)
  await choisirDansLaListe(/Mode SSL/, 'require')
  expect(screen.getByRole('combobox')).toHaveTextContent('require')
})

test('la liste est fermée au départ, et ses options n’existent pas encore', () => {
  render(<Piloté />)
  // **Rien de caché : rien de rendu.** Un panneau monté mais invisible met ses options dans l'arbre
  // d'accessibilité, où un lecteur d'écran les annoncerait sans qu'on ait ouvert la liste.
  expect(screen.queryAllByRole('option')).toEqual([])
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
})

test('ouverte, elle rend toutes les options dans l’ordre, et marque la choisie', async () => {
  const utilisateur = userEvent.setup()
  render(<Piloté />)
  await utilisateur.click(screen.getByRole('combobox'))

  const liste = screen.getByRole('listbox')
  expect(
    within(liste)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['disable', 'prefer', 'require'])
  expect(within(liste).getByRole('option', { name: 'prefer' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

// **Le clavier était gratuit avec le natif, il est écrit maintenant.** Le commentaire de la version
// précédente de ce fichier annonçait précisément ce risque : « ce test garantit qu'on ne le perdra pas
// en passant à une liste maison sans y penser ». Vérifier le seul focus ne l'aurait pas garanti.
test('se pilote entièrement au clavier', async () => {
  const utilisateur = userEvent.setup()
  render(<Piloté />)

  await utilisateur.tab()
  const champ = screen.getByRole('combobox')
  expect(champ).toHaveFocus()

  // `↓` ouvre, puis parcourt depuis l'option courante — pas depuis le haut de la liste.
  await utilisateur.keyboard('{ArrowDown}')
  expect(champ).toHaveAttribute('aria-expanded', 'true')
  await utilisateur.keyboard('{ArrowDown}{Enter}')
  expect(champ).toHaveTextContent('require')
  // Et le focus revient au champ : sans cela, la tabulation suivante repartirait du `<body>`.
  expect(champ).toHaveFocus()
})

test('`Échap` referme sans rien choisir', async () => {
  const utilisateur = userEvent.setup()
  render(<Piloté />)
  await utilisateur.click(screen.getByRole('combobox'))
  await utilisateur.keyboard('{ArrowDown}{Escape}')

  expect(screen.queryByRole('listbox')).toBeNull()
  // La valeur d'avant, non celle qu'on parcourait : renoncer doit renoncer.
  expect(screen.getByRole('combobox')).toHaveTextContent('prefer')
})

test('la frappe d’une lettre saute à l’option correspondante', async () => {
  const utilisateur = userEvent.setup()
  render(<Piloté />)
  await utilisateur.click(screen.getByRole('combobox'))
  await utilisateur.keyboard('d{Enter}')
  expect(screen.getByRole('combobox')).toHaveTextContent('disable')
})

test('l’option parcourue s’annonce par `aria-activedescendant`', async () => {
  const utilisateur = userEvent.setup()
  render(<Piloté />)
  const champ = screen.getByRole('combobox')
  await utilisateur.click(champ)
  await utilisateur.keyboard('{End}')

  // **C'est ce qui remplace le focus sur l'option.** Le motif « combobox » garde le focus sur le
  // champ ; sans cet attribut, un lecteur d'écran n'annoncerait rien pendant qu'on parcourt.
  const designee = champ.getAttribute('aria-activedescendant')
  expect(designee).not.toBeNull()
  expect(document.getElementById(designee as string)).toHaveTextContent('require')
})

test('désactivé, il ne se pilote plus', async () => {
  const utilisateur = userEvent.setup()
  render(<Select label="Type" options={MODES} value="prefer" onValueChange={() => {}} disabled />)
  const champ = screen.getByRole('combobox')
  expect(champ).toBeDisabled()
  await utilisateur.tab()
  expect(champ).not.toHaveFocus()
})
