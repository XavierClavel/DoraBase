import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeHero } from './WelcomeHero'

// Le mockup pose un espace insécable avant le point d'interrogation (« Prêt à
// explorer ? »). `toHaveTextContent` ne convient pas : sa normalisation par défaut
// collapse l'espace insécable du DOM réel en espace normal, mais ne normalise pas la
// chaîne attendue — elle masquerait silencieusement exactement la régression que ce
// test doit détecter. D'où une comparaison stricte sur `textContent`.
test('conserve l’espace insécable du titre', () => {
  render(<WelcomeHero onNewProject={() => {}} />)
  expect(screen.getByRole('heading').textContent).toBe('Prêt à explorer ?')
})

test('n’expose qu’un seul bouton', () => {
  render(<WelcomeHero onNewProject={() => {}} />)
  expect(screen.getAllByRole('button')).toHaveLength(1)
})

test('le bouton demande un nouveau projet', async () => {
  const onNewProject = vi.fn()
  render(<WelcomeHero onNewProject={onNewProject} />)
  await userEvent.click(screen.getByRole('button'))
  expect(onNewProject).toHaveBeenCalledOnce()
})

test('le raccourci ⌘N est affiché sans polluer le nom accessible', () => {
  render(<WelcomeHero onNewProject={() => {}} />)
  expect(screen.getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument()
  expect(screen.getByText('⌘N')).toBeInTheDocument()
})
