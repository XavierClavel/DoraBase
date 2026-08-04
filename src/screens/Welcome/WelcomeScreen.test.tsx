import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WelcomeScreen } from './WelcomeScreen'

test('les deux boutons appellent le même callback', async () => {
  const onNewProject = vi.fn()
  render(<WelcomeScreen onNewProject={onNewProject} projectCount={0} />)
  const boutons = screen.getAllByRole('button', { name: /nouveau projet/i })
  expect(boutons).toHaveLength(2)
  for (const b of boutons) await userEvent.click(b)
  expect(onNewProject).toHaveBeenCalledTimes(2)
})

test('⌘N appelle le callback', async () => {
  const onNewProject = vi.fn()
  render(<WelcomeScreen onNewProject={onNewProject} projectCount={0} />)
  await userEvent.keyboard('{Meta>}n{/Meta}')
  expect(onNewProject).toHaveBeenCalledOnce()
})

test('n appelé seul ne déclenche rien', async () => {
  const onNewProject = vi.fn()
  render(<WelcomeScreen onNewProject={onNewProject} projectCount={0} />)
  await userEvent.keyboard('n')
  expect(onNewProject).not.toHaveBeenCalled()
})

test('assemble la barre de titre, la barre d’état et le compteur de projets', () => {
  render(<WelcomeScreen onNewProject={() => {}} projectCount={2} />)
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
  expect(screen.getByText('2 projets')).toBeInTheDocument()
})
