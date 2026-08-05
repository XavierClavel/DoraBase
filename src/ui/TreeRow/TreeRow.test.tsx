import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TreeRow } from './TreeRow'

function ligne(label: string) {
  return screen.getByText(label).closest('[data-depth]') as HTMLElement
}

// Les quatre paliers relevés dans le mockup A5 : 8, 22, 36, 52. Les écarts valent 14, 14
// puis **16** — une formule `8 + depth * 14` donnerait 50 au dernier palier, pas 52. Ce
// test échoue si quelqu'un remplace la table littérale par un calcul.
test.each([
  [0, '8px'],
  [1, '22px'],
  [2, '36px'],
  [3, '52px'],
] as const)('le palier %i indente de %s', (depth, attendu) => {
  render(<TreeRow depth={depth} label="cible" />)
  expect(ligne('cible').style.paddingLeft).toBe(attendu)
})

test('la ligne sélectionnée porte le style dédié', () => {
  render(<TreeRow depth={3} label="orders" selected />)
  expect(ligne('orders').className).toMatch(/selected/)
})

test('un clic déclenche onClick', async () => {
  const onClick = vi.fn()
  render(<TreeRow depth={0} label="Atelier Nord" onClick={onClick} />)
  await userEvent.click(screen.getByText('Atelier Nord'))
  expect(onClick).toHaveBeenCalledOnce()
})

test('une ligne cliquable est un bouton atteignable au clavier', async () => {
  const onClick = vi.fn()
  render(<TreeRow depth={0} label="Atelier Nord" onClick={onClick} />)
  const bouton = screen.getByRole('button', { name: /atelier nord/i })
  bouton.focus()
  expect(bouton).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
})

// Sans `onClick`, la ligne est du contenu, pas une commande : elle ne doit pas apparaître
// dans le parcours clavier.
test("une ligne sans onClick n'est pas un bouton", () => {
  render(<TreeRow depth={2} label="public" />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

test('affiche la métadonnée mono de fin de ligne', () => {
  render(<TreeRow depth={2} label="analytics" meta="4.2 GB" />)
  expect(screen.getByText('4.2 GB')).toBeInTheDocument()
})

// Le mockup emploie deux typographies de métadonnée : mono 10 px pour les tailles et les
// comptages, capitales 9,5 px pour le « n bases » des projets repliés.
test('la variante caps de métadonnée se distingue de la variante mono', () => {
  const { container: mono } = render(<TreeRow depth={0} label="a" meta="1.9 M" />)
  const { container: caps } = render(
    <TreeRow depth={0} label="b" meta="4 bases" metaVariant="caps" />,
  )
  const classeMono = mono.querySelector('[data-meta]')?.className ?? ''
  const classeCaps = caps.querySelector('[data-meta]')?.className ?? ''
  expect(classeMono).not.toBe(classeCaps)
})

test('accepte un badge en fin de ligne', () => {
  render(<TreeRow depth={0} label="Atelier Nord" trailing={<span>PROD</span>} />)
  expect(screen.getByText('PROD')).toBeInTheDocument()
})

test('le chevron ouvert et le chevron fermé ne portent pas la même classe', () => {
  const { container: ouvert } = render(<TreeRow depth={0} label="a" chevron="open" />)
  const { container: ferme } = render(<TreeRow depth={0} label="b" chevron="closed" />)
  const classeOuvert = ouvert.querySelector('[data-chevron]')?.className ?? ''
  const classeFerme = ferme.querySelector('[data-chevron]')?.className ?? ''
  expect(classeOuvert).not.toBe(classeFerme)
})

test('sans chevron, aucun chevron n’est rendu', () => {
  const { container } = render(<TreeRow depth={3} label="orders" />)
  expect(container.querySelector('[data-chevron]')).toBeNull()
})
