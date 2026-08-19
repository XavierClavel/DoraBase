import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import { Stepper } from './Stepper'

const DEUX = [{ libelle: 'PROJET' }, { libelle: 'CONNEXION' }]

function monter(courante: number) {
  return render(
    <>
      <Sprite />
      <Stepper etapes={DEUX} courante={courante} />
    </>,
  )
}

test('c’est une liste ordonnée, jamais un `tablist`', () => {
  monter(0)
  // **La leçon du défaut n° 52** : `role="tablist"` *promet* la navigation aux flèches, il ne la
  // fournit pas. Un `<ol>` promet un ordre, et c'est tout ce qu'on offre.
  expect(screen.getByRole('list', { name: 'Progression' })).toBeInTheDocument()
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})

test('rien n’y est cliquable — et il y a bien quelque chose à vérifier', () => {
  const { container } = monter(0)
  const bande = screen.getByRole('list')
  // **Le garde de l'ensemble vide, leçon du n° 72** : une assertion « aucun élément ne fait X » doit
  // d'abord prouver qu'il y a des éléments.
  expect(within(bande).getAllByRole('listitem')).toHaveLength(2)
  expect(container.querySelectorAll('button, a, [role=button], [tabindex]')).toHaveLength(0)
})

test('la bande est hors de l’ordre de tabulation', async () => {
  const utilisateur = userEvent.setup()
  render(
    <>
      <Sprite />
      <Stepper etapes={DEUX} courante={0} />
      <button type="button">après</button>
    </>,
  )
  await utilisateur.tab()
  // Le premier arrêt de tabulation est le bouton **qui suit** la bande : elle n'en contient aucun.
  expect(screen.getByRole('button', { name: 'après' })).toHaveFocus()
})

test('une seule étape est courante, et elle le dit sans se dire sélectionnée', () => {
  monter(1)
  const courantes = screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current'))
  expect(courantes).toHaveLength(1)
  expect(courantes[0]).toHaveAttribute('aria-current', 'step')
  // `aria-current` décrit ; `aria-selected` annoncerait un contrôle.
  expect(courantes[0]).not.toHaveAttribute('aria-selected')
})

test('l’état est **dit**, pas seulement teinté', () => {
  monter(1)
  const [premiere, seconde] = screen.getAllByRole('listitem')
  // Un daltonien lit la coche ; une voix lit la phrase. La couleur seule dirait la même chose à l'un
  // et rien du tout à l'autre — c'est la règle que `09d` applique à ses états de connexion.
  expect(premiere).toHaveTextContent('Étape 1 sur 2, faite')
  expect(seconde).toHaveTextContent('Étape 2 sur 2, en cours')
})

test('une étape à venir se dit à faire', () => {
  monter(0)
  expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Étape 2 sur 2, à faire')
})

test('une étape faite porte une coche, non un chiffre', () => {
  const { container } = monter(1)
  const premiere = screen.getAllByRole('listitem')[0] as HTMLElement
  // La coche est une icône du sprite : sa présence se lit dans le `<use>`, dont l'identifiant est
  // préfixé — `#i-check`, la convention de `Sprite`.
  expect(premiere.querySelector('use')?.getAttribute('href')).toBe('#i-check')

  // **Sur la pastille, non sur la ligne.** La première version mesurait le texte du `<li>` entier et
  // échouait sur la phrase masquée, qui contient « Étape 1 sur 2 » : elle mesurait sa propre sonde.
  const pastilleDe = (ligne: HTMLElement) => ligne.querySelector('[aria-hidden="true"]')
  expect(pastilleDe(premiere)?.textContent).toBe('')
  // Et l'étape en cours garde son chiffre.
  const seconde = screen.getAllByRole('listitem')[1] as HTMLElement
  expect(pastilleDe(seconde)?.textContent).toBe('2')
  expect(container.querySelectorAll('use')).toHaveLength(1)
})
