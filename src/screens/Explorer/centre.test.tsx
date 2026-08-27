import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Sprite } from '../../design/icons/Sprite'
import type { TableSummary } from '../../domain/engine'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { BreadcrumbBar, type TypeObjet } from './BreadcrumbBar'
import { ObjectTable } from './ObjectTable'

const COMPTES = { tables: 4, views: 1, functions: 2, indexes: 6 }

function BarrePilotée() {
  const [type, setType] = useState<TypeObjet>('tables')
  const [filtre, setFiltre] = useState('')
  return (
    <>
      <Sprite />
      <LanguageProvider preferences={{ language: 'fr' }}>
        <BreadcrumbBar
          database="analytics"
          schema="public"
          counts={COMPTES}
          type={type}
          onTypeChange={setType}
          filter={filtre}
          onFilterChange={setFiltre}
        />
      </LanguageProvider>
    </>
  )
}

const objet = (over: Partial<TableSummary> = {}): TableSummary => ({
  name: 'orders',
  kind: 'table',
  rows: { kind: 'estimated', value: 1_900_000 },
  sizeBytes: 2.1 * 1024 ** 3,
  columnCount: 18,
  primaryKey: 'id',
  lastAnalyze: '2026-08-06 04:12',
  comment: 'Commandes',
  ...over,
})

// --- Le fil d'Ariane ---

test('le chemin montre la base puis le schéma', () => {
  render(<BarrePilotée />)
  const fil = screen.getByRole('navigation', { name: /Chemin/ })
  expect(fil).toHaveTextContent('analytics')
  expect(fil).toHaveTextContent('public')
})

// --- Les comptes ---

// **Issus des données, jamais de constantes.** Les coder en dur les rendrait faux dès la première
// base réelle, et c'est le genre de valeur qu'on oublie de brancher parce qu'elle ressemble à du
// bon. Les valeurs ci-dessous sont celles du schéma de test, dont la composition est connue.
test('les quatre comptes viennent des données', () => {
  render(<BarrePilotée />)
  expect(screen.getByRole('radio', { name: 'Tables 4' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Vues 1' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Fonctions 2' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Index 6' })).toBeInTheDocument()
})

test('changer de segment ne change pas les comptes', async () => {
  render(<BarrePilotée />)
  await userEvent.click(screen.getByRole('radio', { name: 'Vues 1' }))
  // Le compte dit ce que le schéma contient, pas ce qui est affiché.
  expect(screen.getByRole('radio', { name: 'Tables 4' })).toBeInTheDocument()
})

// --- Le champ de filtre ---

// **Le mockup promet une recherche globale et un raccourci qui n'existent pas.** « Chercher un
// objet… ⌘P » annonce de traverser tous les schémas et tous les projets. Ce champ filtre la liste
// affichée, et le dit.
test('le champ de filtre dit ce qu’il filtre, et ne promet pas de recherche globale', () => {
  render(<BarrePilotée />)
  const champ = screen.getByRole('textbox', { name: /Filtrer les objets de public/ })
  expect(champ).toHaveAttribute('placeholder', expect.stringContaining('public'))
  expect(screen.queryByText('Chercher un objet…')).not.toBeInTheDocument()
})

// Un raccourci affiché qui ne répond pas est pire qu'un raccourci absent.
test('aucun rappel ⌘P tant que la recherche globale n’existe pas', () => {
  render(<BarrePilotée />)
  expect(screen.queryByText('⌘P')).not.toBeInTheDocument()
})

test('la saisie du filtre se voit', async () => {
  render(<BarrePilotée />)
  const champ = screen.getByRole('textbox', { name: /Filtrer les objets/ })
  await userEvent.type(champ, 'orders')
  expect(champ).toHaveValue('orders')
})

// --- Le tableau ---

function monterTableau(props: Partial<Parameters<typeof ObjectTable>[0]> = {}) {
  return render(
    <LanguageProvider preferences={{ language: 'fr' }}>
      <ObjectTable
        schema="public"
        objects={[objet()]}
        type="tables"
        onSelect={() => {}}
        {...props}
      />
    </LanguageProvider>,
  )
}

test('les sept colonnes du handoff sont là, dans l’ordre', () => {
  monterTableau()
  expect(screen.getAllByRole('columnheader').map((e) => e.textContent)).toEqual([
    'Nom',
    'Lignes',
    'Taille',
    'Col.',
    'Clé primaire',
    'Dernier ANALYZE',
    'Commentaire',
  ])
})

test('les valeurs sont formatées, pas brutes', () => {
  monterTableau()
  expect(screen.getByText('1.9 M')).toBeInTheDocument()
  expect(screen.getByText('2.1 GB')).toBeInTheDocument()
})

// **Un tiret cadratin, jamais zéro ni du vide.** « 0 ligne » sur un index serait un mensonge ; du
// vide ressemblerait à une donnée manquante.
test('les colonnes sans objet portent un tiret cadratin', () => {
  monterTableau({
    objects: [objet({ primaryKey: null, lastAnalyze: null, comment: null, sizeBytes: null })],
  })
  expect(screen.getAllByText('—')).toHaveLength(4)
})

// `06c` traduit `reltuples = -1` — « jamais analysée » — et une valeur négative ne doit pas
// s'afficher comme un nombre.
test('une table jamais analysée affiche un tiret, pas zéro', () => {
  monterTableau({ objects: [objet({ rows: { kind: 'estimated', value: -1 } })] })
  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.queryByText('0')).not.toBeInTheDocument()
})

// --- Les trois états vides ---

// Vide, chargement et échec se distinguent, et aucun ne ressemble aux deux autres. Le handoff
// n'en maquette aucun des trois.
test('un schéma vide le dit, en nommant le type d’objet', () => {
  monterTableau({ objects: [], type: 'views' })
  expect(screen.getByText(/ne contient aucune vue/)).toBeInTheDocument()
})

test('le chargement se distingue du vide', () => {
  monterTableau({ objects: [], loading: true })
  expect(screen.getByText(/Chargement des objets/)).toBeInTheDocument()
})

test('un échec se distingue des deux autres, et porte le message du moteur', () => {
  monterTableau({ objects: [], error: 'hôte injoignable' })
  expect(screen.getByText('hôte injoignable')).toBeInTheDocument()
  expect(screen.queryByText(/Chargement/)).not.toBeInTheDocument()
  expect(screen.queryByText(/ne contient aucune/)).not.toBeInTheDocument()
})

test('un échec l’emporte sur le chargement', () => {
  // Les deux peuvent être vrais si l'échec arrive pendant qu'un autre chargement est en cours :
  // c'est l'échec qu'il faut montrer.
  monterTableau({ objects: [], loading: true, error: 'échec' })
  expect(screen.getByText('échec')).toBeInTheDocument()
})

// --- La sélection ---

test('une ligne sélectionnée s’annonce comme telle', async () => {
  const choisis: TableSummary[] = []
  monterTableau({ onSelect: (o) => choisis.push(o) })
  await userEvent.click(screen.getByRole('rowheader', { name: 'orders' }))
  expect(choisis.map((o) => o.name)).toEqual(['orders'])
})

test('la ligne choisie porte aria-selected', () => {
  monterTableau({ selectedName: 'orders' })
  expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-selected', 'true')
})
