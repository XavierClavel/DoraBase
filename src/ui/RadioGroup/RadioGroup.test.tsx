import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RadioGroup } from './RadioGroup'

const MOTEURS = [
  { value: 'postgres', label: 'PostgreSQL', prefix: <span>Pg</span> },
  { value: 'mysql', label: 'MySQL', prefix: <span>My</span> },
  { value: 'sqlite', label: 'SQLite', prefix: <span>Sq</span> },
] as const

type Moteur = (typeof MOTEURS)[number]['value']

function Piloté({ initial = 'postgres' as Moteur }: { initial?: Moteur }) {
  const [moteur, setMoteur] = useState<Moteur>(initial)
  return <RadioGroup label="Moteur" options={MOTEURS} value={moteur} onValueChange={setMoteur} />
}

test('s’annonce comme un groupe nommé, contenant des radios', () => {
  render(<Piloté />)
  expect(screen.getByRole('group', { name: 'Moteur' })).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(3)
})

test('seule l’option courante est cochée', () => {
  render(<Piloté />)
  expect(screen.getByRole('radio', { name: /PostgreSQL/ })).toBeChecked()
  expect(screen.getByRole('radio', { name: /MySQL/ })).not.toBeChecked()
})

test('un clic sélectionne', async () => {
  render(<Piloté />)
  await userEvent.click(screen.getByRole('radio', { name: /MySQL/ }))
  expect(screen.getByRole('radio', { name: /MySQL/ })).toBeChecked()
  expect(screen.getByRole('radio', { name: /PostgreSQL/ })).not.toBeChecked()
})

// La convention ARIA : Tab entre dans le groupe et en sort, les flèches naviguent dedans.
// Sans elle, un groupe de sept moteurs coûterait sept tabulations pour être traversé.
// La convention d'un groupe de radios natifs : Tab entre dans le groupe et en sort, les
// flèches naviguent dedans. Une seule tabulation traverse donc les sept moteurs de `A2` au
// lieu de sept. C'est le navigateur qui l'assure — ce test garantit qu'on ne le perdra pas
// en revenant à des `<button role="radio">`.
test('une seule tabulation suffit à traverser le groupe', async () => {
  render(
    <>
      <Piloté />
      <button type="button">après</button>
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('radio', { name: /PostgreSQL/ })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'après' })).toHaveFocus()
})

test('la flèche droite sélectionne la suivante', async () => {
  render(<Piloté />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: /MySQL/ })).toBeChecked()
})

test('la flèche gauche depuis la première boucle sur la dernière', async () => {
  render(<Piloté />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowLeft}')
  expect(screen.getByRole('radio', { name: /SQLite/ })).toBeChecked()
})

test('la flèche droite depuis la dernière boucle sur la première', async () => {
  render(<Piloté initial="sqlite" />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: /PostgreSQL/ })).toBeChecked()
})

// Le focus doit suivre la sélection : le laisser en arrière rendrait la flèche suivante
// imprévisible, puisqu'elle partirait d'une autre position que ce que l'écran montre.
test('le focus suit la sélection au clavier', async () => {
  render(<Piloté />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: /MySQL/ })).toHaveFocus()
})

test('les flèches verticales font le même travail que les horizontales', async () => {
  render(<Piloté />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowDown}')
  expect(screen.getByRole('radio', { name: /MySQL/ })).toBeChecked()
})

test('le préfixe est rendu, mais reste hors du nom accessible', () => {
  render(<Piloté />)
  // Visible à l'écran…
  expect(screen.getByText('Pg')).toBeInTheDocument()
  // …mais le nom accessible est le seul libellé. Sans `aria-hidden` sur le préfixe, il
  // sortait « PgPostgreSQL », que le lecteur d'écran annonce tel quel.
  expect(screen.getByRole('radio', { name: 'PostgreSQL' })).toBeChecked()
})

// Aucune croix de suppression : c'est ce qui distingue ce composant du `Chip` et ce qui
// permet d'employer de vrais `<button>` frères. Voir la note du composant.
test('aucune option ne porte de bouton de suppression', () => {
  render(<Piloté />)
  expect(screen.queryByRole('button', { name: /supprimer|retirer/i })).not.toBeInTheDocument()
})
