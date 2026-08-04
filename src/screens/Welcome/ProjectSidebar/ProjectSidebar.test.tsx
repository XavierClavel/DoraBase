import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectSidebar } from './ProjectSidebar'

test('annonce l’absence de projet', () => {
  render(<ProjectSidebar onNewProject={() => {}} />)
  expect(screen.getByText('Aucun projet')).toBeInTheDocument()
})

test('le bouton de pied demande un nouveau projet', async () => {
  const onNewProject = vi.fn()
  render(<ProjectSidebar onNewProject={onNewProject} />)
  await userEvent.click(screen.getByRole('button', { name: /nouveau projet/i }))
  expect(onNewProject).toHaveBeenCalledOnce()
})

// Le mockup écrit le sous-texte avec un point-virgule exact : « Un projet regroupe
// plusieurs bases ; chacune se décline par environnement. » Une reformulation par un
// formateur ou un copier-coller le perdrait sans bruit.
test('conserve le texte exact du sous-titre', () => {
  render(<ProjectSidebar onNewProject={() => {}} />)
  expect(
    screen.getByText('Un projet regroupe plusieurs bases ; chacune se décline par environnement.'),
  ).toBeInTheDocument()
})
