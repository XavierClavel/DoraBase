import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { type Column, DataTable } from './DataTable'

type Objet = { nom: string; lignes: string; taille: string }

const OBJETS: Objet[] = [
  { nom: 'orders', lignes: '1.9 M', taille: '2.1 GB' },
  { nom: 'users', lignes: '128 k', taille: '96 MB' },
]

const COLONNES: Column<Objet>[] = [
  { key: 'nom', header: 'Nom', cell: (o) => o.nom, ui: true, width: '210px' },
  { key: 'lignes', header: 'Lignes', cell: (o) => o.lignes, numeric: true, width: '88px' },
  { key: 'taille', header: 'Taille', cell: (o) => o.taille, numeric: true, width: '78px' },
]

function Piloté() {
  const [choisi, setChoisi] = useState<string | null>(null)
  return (
    <DataTable
      label="Objets du schéma"
      columns={COLONNES}
      rows={OBJETS}
      rowId={(o) => o.nom}
      selectedId={choisi}
      onSelect={(o) => setChoisi(o.nom)}
    />
  )
}

test('le tableau porte un nom accessible', () => {
  render(<Piloté />)
  expect(screen.getByRole('table', { name: 'Objets du schéma' })).toBeInTheDocument()
})

// C'est la raison d'employer un vrai `<table>` : un lecteur d'écran annonce l'en-tête de chaque
// cellule pendant la navigation, sans qu'on écrive un seul `aria-colindex`.
test('chaque colonne a son en-tête, déclaré comme tel', () => {
  render(<Piloté />)
  const entetes = screen.getAllByRole('columnheader')
  expect(entetes.map((e) => e.textContent)).toEqual(['Nom', 'Lignes', 'Taille'])
  for (const entete of entetes) expect(entete).toHaveAttribute('scope', 'col')
})

// Sans `scope="row"` sur la première cellule, un lecteur d'écran annonce « Lignes, 1.9 M » sans
// jamais relier cette valeur à l'objet dont elle parle.
test('le nom de l’objet est l’en-tête de sa ligne', () => {
  render(<Piloté />)
  const noms = screen.getAllByRole('rowheader')
  expect(noms.map((n) => n.textContent)).toEqual(['orders', 'users'])
  for (const nom of noms) expect(nom).toHaveAttribute('scope', 'row')
})

test('un clic sélectionne la ligne', async () => {
  render(<Piloté />)
  const lignes = screen.getAllByRole('row')
  // La première ligne est l'en-tête ; les objets suivent.
  await userEvent.click(screen.getByRole('rowheader', { name: 'orders' }))
  expect(lignes[1]).toHaveAttribute('aria-selected', 'true')
  expect(lignes[2]).toHaveAttribute('aria-selected', 'false')
})

test('sélectionner une autre ligne désélectionne la première', async () => {
  render(<Piloté />)
  await userEvent.click(screen.getByRole('rowheader', { name: 'orders' }))
  await userEvent.click(screen.getByRole('rowheader', { name: 'users' }))
  const lignes = screen.getAllByRole('row')
  expect(lignes[1]).toHaveAttribute('aria-selected', 'false')
  expect(lignes[2]).toHaveAttribute('aria-selected', 'true')
})

// Sans `onSelect`, les lignes ne sont pas sélectionnables : `aria-selected` sur une ligne qui ne
// se sélectionne pas serait un mensonge à la voix.
test('sans onSelect, aucune ligne ne s’annonce sélectionnable', () => {
  render(<DataTable label="Objets" columns={COLONNES} rows={OBJETS} rowId={(o) => o.nom} />)
  for (const ligne of screen.getAllByRole('row')) {
    expect(ligne).not.toHaveAttribute('aria-selected')
  }
})

test('l’état vide est rendu à la place du tableau', () => {
  render(
    <DataTable
      label="Objets"
      columns={COLONNES}
      rows={[]}
      rowId={(o) => o.nom}
      empty={<span>Ce schéma ne contient aucune table.</span>}
    />,
  )
  // Un tableau à zéro ligne avec un en-tête ressemble à un chargement inachevé.
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText(/aucune table/)).toBeInTheDocument()
})

test('sans état vide fourni, le tableau reste rendu avec son en-tête', () => {
  render(<DataTable label="Objets" columns={COLONNES} rows={[]} rowId={(o) => o.nom} />)
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.getAllByRole('columnheader')).toHaveLength(3)
})

// Les largeurs viennent d'un `<colgroup>`, pas des `<th>` : avec `table-layout: fixed`, c'est le
// groupe de colonnes qui fait autorité.
test('les largeurs sont portées par un colgroup', () => {
  const { container } = render(<Piloté />)
  const cols = [...container.querySelectorAll('col')]
  expect(cols).toHaveLength(3)
  expect(cols.map((c) => (c as HTMLElement).style.width)).toEqual(['210px', '88px', '78px'])
})

test('une cellule rend un nœud, pas seulement du texte', () => {
  // Les colonnes de `A4` portent des icônes — clé primaire, type d'objet.
  render(
    <DataTable
      label="Objets"
      columns={[{ key: 'nom', header: 'Nom', cell: () => <em>orders</em> }]}
      rows={[OBJETS[0] as Objet]}
      rowId={(o) => o.nom}
    />,
  )
  expect(screen.getByText('orders').tagName).toBe('EM')
})
