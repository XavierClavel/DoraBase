import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import { SelectionIndicator } from '../SelectionIndicator/SelectionIndicator'
import { TitleBar } from './TitleBar'

/**
 * Le centre de la barre de titre.
 *
 * **Passé en contenu plutôt qu'en propriétés** : `A1` n'en a aucun, les écrans de travail en ont un,
 * et son contenu a déjà changé deux fois. Une liste de propriétés grandirait à chaque écran là où un
 * contenu s'assemble chez l'appelant.
 *
 * **La prop `right` a disparu avec `25b`** : le sélecteur d'environnement en était l'unique appelant.
 */

/** La barre entière, telle que le DOM la rend — première fille du conteneur de rendu. */
const barre = (container: HTMLElement) =>
  container.querySelector('[data-tauri-drag-region]') as HTMLElement

/*
 * **Rien de sélectionné : aucune empreinte réservée** (`25b`).
 *
 * `.center` vide a une hauteur de zéro sans rien déplacer — la barre garde ses 40 px, le wordmark et
 * les actions ne bougent pas. jsdom ne mesure rien, donc ce qui est testable ici est la **structure**
 * : le centre existe, il est vide, et les actions sont là. Une boîte fantôme n'achèterait aucune
 * stabilité, et une boîte vide bordée au centre d'une barre se lirait comme un champ à remplir.
 */
test('sans centre, la barre garde son wordmark et ses actions, et rien au centre', () => {
  const { container } = render(
    <>
      <Sprite />
      <TitleBar showConsole onOpenPreferences={() => {}} />
    </>,
  )
  expect(screen.getByText('DoraBase')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Console' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Préférences' })).toBeInTheDocument()

  // Le centre est la deuxième zone de la barre — wordmark, centre, actions — et il est vide.
  const centre = barre(container).children[1] as HTMLElement
  expect(centre.textContent).toBe('')
  expect(centre.children).toHaveLength(0)
})

test('avec un centre, l’indicateur de sélection y est rendu', () => {
  render(
    <>
      <Sprite />
      <TitleBar center={<SelectionIndicator projectName="Atelier Nord" />} />
    </>,
  )
  expect(screen.getByText('Atelier Nord')).toBeInTheDocument()
})

/*
 * **Le parcours clavier de la barre compte deux arrêts** : console, préférences.
 *
 * Il en comptait quatre — la pastille projet et le sélecteur d'environnement occupaient les deux
 * premiers. Les deux contrôles partis, le centre n'a plus rien de focalisable, ce qui invalide un
 * critère de `09c` et rend au passage toute la bande glissable
 * (`data-tauri-drag-region="deep"` ne s'arrête que sur les éléments focalisables).
 */
test('le parcours clavier de la barre compte deux arrêts, et le centre n’en est pas', async () => {
  render(
    <>
      <Sprite />
      <TitleBar
        showConsole
        center={
          <SelectionIndicator
            projectName="Atelier Nord"
            environment={{ label: 'Atelier', color: 'green', production: true }}
            breadcrumb="catalogue · public"
          />
        }
        onOpenPreferences={() => {}}
      />
    </>,
  )
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Console' })).toHaveFocus()
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Préférences' })).toHaveFocus()

  // Et il n'y a rien de plus : le troisième `Tab` sort de la barre.
  await userEvent.tab()
  expect(screen.getByRole('button', { name: 'Préférences' })).not.toHaveFocus()
})

// La barre n'a plus de prop `right` : le sélecteur d'environnement en était l'unique appelant, et
// une prop sans appelant n'est qu'un emplacement que le prochain écran remplira sans savoir pourquoi.
test('la barre n’expose que le centre, sans emplacement à droite', () => {
  const { container } = render(
    <>
      <Sprite />
      <TitleBar center={<SelectionIndicator projectName="Atelier Nord" />} />
    </>,
  )
  // Trois zones exactement : wordmark, centre, actions.
  expect(barre(container).children).toHaveLength(3)
})

test('sans gestionnaire, l’engrenage est désactivé et dit pourquoi', () => {
  render(
    <>
      <Sprite />
      <TitleBar />
    </>,
  )
  // La règle de `09f`, et la leçon du défaut n° 36 : un bouton cliquable et inerte se lit comme une
  // panne. Il est donc désactivé, avec l'infobulle qui dit où l'écran se trouve.
  const engrenage = screen.getByRole('button', { name: 'Préférences' })
  expect(engrenage).toBeDisabled()
  expect(engrenage).toHaveAttribute('title', expect.stringContaining('écran de travail'))
})

test('avec un gestionnaire, l’engrenage l’appelle', async () => {
  const ouvrir = vi.fn()
  render(
    <>
      <Sprite />
      <TitleBar onOpenPreferences={ouvrir} />
    </>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Préférences' }))
  expect(ouvrir).toHaveBeenCalledTimes(1)
})
