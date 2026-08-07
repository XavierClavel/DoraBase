import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'

const SEGMENTS = [
  { value: 'tables', label: 'Tables', count: 8 },
  { value: 'vues', label: 'Vues', count: 2 },
  { value: 'fonctions', label: 'Fonctions', count: 6 },
  { value: 'index', label: 'Index', count: 31 },
] as const

type Segment = (typeof SEGMENTS)[number]['value']

function Piloté({ initial = 'tables' as Segment }: { initial?: Segment }) {
  const [actif, setActif] = useState<Segment>(initial)
  return (
    <SegmentedControl
      label="Type d’objet"
      segments={SEGMENTS}
      value={actif}
      onValueChange={setActif}
    />
  )
}

test('s’annonce comme un groupe nommé contenant des radios', () => {
  render(<Piloté />)
  expect(screen.getByRole('group', { name: 'Type d’objet' })).toBeInTheDocument()
  expect(screen.getAllByRole('radio')).toHaveLength(4)
})

// Le compte **fait partie** du nom accessible, contrairement au monogramme de `RadioGroup` :
// « Tables 8 » est l'information, et elle n'est écrite nulle part ailleurs.
test('le compte fait partie du nom accessible', () => {
  render(<Piloté />)
  expect(screen.getByRole('radio', { name: 'Tables 8' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Index 31' })).toBeInTheDocument()
})

test('un clic sélectionne', async () => {
  render(<Piloté />)
  await userEvent.click(screen.getByRole('radio', { name: 'Vues 2' }))
  expect(screen.getByRole('radio', { name: 'Vues 2' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Tables 8' })).not.toBeChecked()
})

// La convention d'un groupe de radios natifs, réemployée de `RadioGroup` : une seule
// tabulation traverse les quatre segments, les flèches naviguent dedans.
test('une seule tabulation suffit à traverser le groupe', async () => {
  render(
    <>
      <Piloté />
      <button type="button">après</button>
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('radio', { name: 'Tables 8' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'après' })).toHaveFocus()
})

test('les flèches naviguent et bouclent', async () => {
  render(<Piloté />)
  await userEvent.tab()
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('radio', { name: 'Vues 2' })).toBeChecked()
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(screen.getByRole('radio', { name: 'Index 31' })).toBeChecked()
})

test('un compte de zéro est affiché, pas masqué', () => {
  // Un schéma sans vue affiche « Vues 0 ». Masquer le segment ferait disparaître un filtre
  // selon les données, et l'utilisateur ne saurait pas s'il a mal cherché.
  render(
    <SegmentedControl
      label="Type"
      segments={[{ value: 'vues', label: 'Vues', count: 0 }]}
      value="vues"
      onValueChange={() => {}}
    />,
  )
  expect(screen.getByRole('radio', { name: 'Vues 0' })).toBeInTheDocument()
})
