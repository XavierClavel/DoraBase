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

// --- Le nom accessible (correction de `09d`) ---

// **Quatrième occurrence du même piège** : JSX supprime l'espace entre deux éléments, et le
// calcul du nom accessible concatène les nœuds de texte sans rien ajouter. Après `08a`
// (monogramme), `09a` (compte de segment) et `09c` (état de connexion), la correction est passée
// dans la primitive — sans quoi une ligne d'arbre s'annonce « orders1.9 M ».
test('la métadonnée est séparée du libellé dans le nom accessible', () => {
  render(<TreeRow depth={3} label="orders" meta="1.9 M" metaVariant="mono" onClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'orders 1.9 M' })).toBeInTheDocument()
})

test('le contenu de fin est séparé lui aussi', () => {
  render(<TreeRow depth={0} label="Atelier Nord" trailing={<span>PROD</span>} onClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'Atelier Nord PROD' })).toBeInTheDocument()
})

test('sans métadonnée ni contenu de fin, le nom reste le libellé seul', () => {
  render(<TreeRow depth={2} label="public" onClick={() => {}} />)
  expect(screen.getByRole('button', { name: 'public' })).toBeInTheDocument()
})

// Les attributs restants sont transmis à la racine : c'est ce qui permet à `A4` de poser
// `role="treeitem"` **sur l'élément interactif**. Une enveloppe portant le rôle mettrait le
// `<button>` à l'intérieur du nœud d'arbre, où ni le clic ni le focus ne le désignent.
test('les attributs sont transmis à l’élément interactif', () => {
  render(<TreeRow depth={1} label="analytics" role="treeitem" aria-level={2} onClick={() => {}} />)
  const ligne = screen.getByRole('treeitem', { name: 'analytics' })
  expect(ligne.tagName).toBe('BUTTON')
  expect(ligne).toHaveAttribute('aria-level', '2')
})

// --- La flèche, geste distinct du clic sur la ligne ---

// **Un `<button>` dans un `<button>` serait invalide**, et le clic y déclencherait les deux gestes :
// la flèche est une zone *dans* le bouton de la ligne, et c'est la cible du clic qui départage.
// Ces trois tests tiennent ce départage — le reste du produit en dépend depuis que déplier n'est
// plus ce que fait un clic simple.
test('un clic sur la ligne appelle onClick, et non onChevron', async () => {
  const onClick = vi.fn()
  const onChevron = vi.fn()
  render(
    <TreeRow
      depth={0}
      label="Atelier Nord"
      chevron="closed"
      onClick={onClick}
      onChevron={onChevron}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Atelier Nord' }))
  expect(onClick).toHaveBeenCalledOnce()
  expect(onChevron).not.toHaveBeenCalled()
})

test('un clic sur la flèche appelle onChevron, et non onClick', async () => {
  const onClick = vi.fn()
  const onChevron = vi.fn()
  const { container } = render(
    <TreeRow
      depth={0}
      label="Atelier Nord"
      chevron="closed"
      onClick={onClick}
      onChevron={onChevron}
    />,
  )
  await userEvent.click(container.querySelector('[data-chevron-zone]') as HTMLElement)
  expect(onChevron).toHaveBeenCalledOnce()
  expect(onClick).not.toHaveBeenCalled()
})

// L'activation clavier a le bouton pour cible, donc elle tombe du côté de la sélection : c'est
// pourquoi les flèches horizontales existent, et c'est le test suivant.
test('Entrée sélectionne, les flèches horizontales déplient', async () => {
  const onClick = vi.fn()
  const onChevron = vi.fn()
  render(
    <TreeRow
      depth={0}
      label="Atelier Nord"
      chevron="closed"
      onClick={onClick}
      onChevron={onChevron}
    />,
  )
  screen.getByRole('button', { name: 'Atelier Nord' }).focus()
  await userEvent.keyboard('{Enter}')
  expect(onClick).toHaveBeenCalledOnce()
  expect(onChevron).not.toHaveBeenCalled()

  await userEvent.keyboard('{ArrowRight}')
  expect(onChevron).toHaveBeenCalledOnce()
  // Un nœud fermé ne se referme pas : le motif ARIA y remonte au parent, ce que cet arbre ne sait
  // pas encore faire — et basculer à sa place serait pire que le silence.
  await userEvent.keyboard('{ArrowLeft}')
  expect(onChevron).toHaveBeenCalledOnce()
})
