import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Tab, TabStrip } from './TabStrip'

// Les trois familles d'onglet du handoff, avec leurs deux couleurs distinctes : le trait
// supérieur suit la famille (données / console), l'icône suit le type d'objet.
const demoTabs: Tab[] = [
  {
    id: 'public',
    icon: 'schema',
    iconColor: 'var(--accent-deep)',
    accentColor: 'var(--accent)',
    label: 'public',
  },
  {
    id: 'orders',
    icon: 'table',
    iconColor: 'var(--success)',
    accentColor: 'var(--accent)',
    label: 'orders',
  },
  {
    id: 'console-1',
    icon: 'term',
    iconColor: 'var(--violet-ink)',
    accentColor: 'var(--violet)',
    label: 'console 1',
    meta: '·psql',
  },
]

function renderStrip(activeId: string) {
  return render(
    <TabStrip
      tabs={demoTabs}
      activeId={activeId}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onReorder={vi.fn()}
    />,
  )
}

test("l'onglet actif est marqué sélectionné et porte une croix de fermeture", () => {
  renderStrip('orders')
  expect(screen.getByRole('tab', { name: /orders/i })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: /fermer orders/i })).toBeInTheDocument()
})

test("un onglet inactif n'a pas de croix", () => {
  renderStrip('orders')
  expect(screen.queryByRole('button', { name: /fermer public/i })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /public/i })).toHaveAttribute('aria-selected', 'false')
})

test('affiche le suffixe optionnel', () => {
  renderStrip('orders')
  expect(screen.getByText('·psql')).toBeInTheDocument()
})

// Le trait supérieur d'un onglet de table est en accent, pas dans la couleur verte de son
// icône : ce test échouerait si les deux couleurs étaient fusionnées en une seule prop.
test("le trait supérieur suit la famille, pas la couleur d'icône", () => {
  const { container } = renderStrip('orders')
  const active = container.querySelector('[data-active="true"]') as HTMLElement
  expect(active.style.borderTopColor).toBe('var(--accent)')
})

test('un onglet de console porte un trait violet', () => {
  const { container } = renderStrip('console-1')
  const active = container.querySelector('[data-active="true"]') as HTMLElement
  expect(active.style.borderTopColor).toBe('var(--violet)')
})

test('cliquer un onglet le sélectionne', async () => {
  const onSelect = vi.fn()
  render(
    <TabStrip
      tabs={demoTabs}
      activeId="orders"
      onSelect={onSelect}
      onClose={vi.fn()}
      onReorder={vi.fn()}
    />,
  )
  await userEvent.click(screen.getByRole('tab', { name: /public/i }))
  expect(onSelect).toHaveBeenCalledWith('public')
})

test('la croix ferme sans sélectionner', async () => {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(
    <TabStrip
      tabs={demoTabs}
      activeId="orders"
      onSelect={onSelect}
      onClose={onClose}
      onReorder={vi.fn()}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /fermer orders/i }))
  expect(onClose).toHaveBeenCalledWith('orders')
  expect(onSelect).not.toHaveBeenCalled()
})

// `dataTransfer` est fourni à la main : jsdom ne construit pas l'objet natif, et
// `fireEvent` accepte de le remplacer par un espion.
test('glisser un onglet sur un autre les réordonne', () => {
  const onReorder = vi.fn()
  render(
    <TabStrip
      tabs={demoTabs}
      activeId="orders"
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onReorder={onReorder}
    />,
  )
  const tabs = screen.getAllByRole('tab')
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'public') }
  fireEvent.dragStart(tabs[0] as HTMLElement, { dataTransfer })
  fireEvent.drop(tabs[2] as HTMLElement, { dataTransfer })
  expect(onReorder).toHaveBeenCalledWith([demoTabs[1], demoTabs[2], demoTabs[0]])
})

test('déposer un onglet sur lui-même ne réordonne pas', () => {
  const onReorder = vi.fn()
  render(
    <TabStrip
      tabs={demoTabs}
      activeId="orders"
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onReorder={onReorder}
    />,
  )
  const tabs = screen.getAllByRole('tab')
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'public') }
  fireEvent.dragStart(tabs[0] as HTMLElement, { dataTransfer })
  fireEvent.drop(tabs[0] as HTMLElement, { dataTransfer })
  expect(onReorder).not.toHaveBeenCalled()
})
