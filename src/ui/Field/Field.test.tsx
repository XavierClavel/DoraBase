import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Field } from './Field'

// C'est l'assertion qui compte : Biome n'a aucune règle de nom accessible, donc rien
// d'autre dans le projet ne garantit qu'une étiquette est bien reliée à son champ.
// `getByLabelText` échoue si le `htmlFor` ou l'`id` manque.
test('l’étiquette donne son nom accessible au champ', () => {
  render(<Field label="Hôte" />)
  expect(screen.getByLabelText('Hôte')).toBeInstanceOf(HTMLInputElement)
})

test('deux champs de même étiquette ne partagent pas leur identifiant', () => {
  render(
    <>
      <Field label="Port" />
      <Field label="Port" />
    </>,
  )
  const [a, b] = screen.getAllByLabelText('Port')
  expect(a?.id).not.toBe(b?.id)
  expect(a?.id).toBeTruthy()
})

test('un identifiant fourni est respecté', () => {
  render(<Field label="Utilisateur" id="user-field" />)
  expect(screen.getByLabelText('Utilisateur')).toHaveAttribute('id', 'user-field')
})

test('la saisie remonte à l’appelant', async () => {
  const onChange = vi.fn()
  render(<Field label="Base par défaut" onChange={onChange} />)
  await userEvent.type(screen.getByLabelText('Base par défaut'), 'analytics')
  expect(onChange).toHaveBeenCalled()
  expect(screen.getByLabelText('Base par défaut')).toHaveValue('analytics')
})

test('désactivé, le champ n’accepte pas de saisie', async () => {
  render(<Field label="Port local mappé" disabled defaultValue="auto (63342)" />)
  const input = screen.getByLabelText('Port local mappé')
  await userEvent.type(input, 'x')
  expect(input).toHaveValue('auto (63342)')
})

// --- Variante à suffixe (08b : mot de passe ; 08c : clé privée) ---

test('un suffixe est rendu dans la boîte du champ', () => {
  render(<Field label="Mot de passe" suffix={<button type="button">œil</button>} />)
  const champ = screen.getByLabelText('Mot de passe')
  const suffixe = screen.getByRole('button', { name: 'œil' })
  // Dans la **même** boîte : le mockup les met sous une seule bordure. À côté du champ, la
  // largeur de la grille changerait.
  expect(champ.parentElement).toContainElement(suffixe)
})

// L'enveloppe s'insère entre l'étiquette et l'`<input>` : sans `htmlFor` correctement
// propagé, le champ perdrait son nom accessible sans que rien d'autre ne change.
test('avec un suffixe, l’étiquette nomme toujours le champ', () => {
  render(<Field label="Mot de passe" type="password" suffix={<span>badge</span>} />)
  const champ = screen.getByLabelText('Mot de passe')
  expect(champ.tagName).toBe('INPUT')
  expect(champ).toHaveAttribute('type', 'password')
})

test('avec un suffixe, la saisie fonctionne toujours', async () => {
  render(<Field label="Hôte" mono suffix={<span>x</span>} />)
  const champ = screen.getByLabelText('Hôte')
  await userEvent.type(champ, 'db.internal')
  expect(champ).toHaveValue('db.internal')
})
