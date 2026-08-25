import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { DeleteEnvironmentResult } from '../../domain/config'
import { DeleteEnvironmentDialog } from './DeleteEnvironmentDialog'

const ISSUE: DeleteEnvironmentResult = {
  projects: [],
  deletedConnections: ['catalogue', 'reservations'],
  leftoverSecrets: [],
}

function monter(
  options: { connexions?: string[]; onDelete?: () => Promise<DeleteEnvironmentResult> } = {},
) {
  const onClose = vi.fn()
  render(
    <>
      <Sprite />
      <DeleteEnvironmentDialog
        projet="Atelier Nord"
        libelle="vitrine"
        connexions={options.connexions ?? ['catalogue', 'reservations']}
        onClose={onClose}
        onDelete={options.onDelete ?? (async () => ISSUE)}
      />
    </>,
  )
  return { onClose }
}

const retirer = () => screen.getByRole('button', { name: /Retirer l’environnement/ })

test('la confirmation nomme l’environnement, compte et liste ses connexions', () => {
  monter()
  const modale = screen.getByRole('dialog', { name: /Retirer vitrine/ })
  expect(modale).toHaveTextContent('2 connexions déclarées')
  // **Nommées, non comptées seulement** : c'est ce qui permet de reconnaître qu'on s'est trompé
  // d'environnement — un compte seul ne le dit pas.
  expect(modale).toHaveTextContent('catalogue')
  expect(modale).toHaveTextContent('reservations')
})

test('les trois phrases sont là, dont celle qui rassure', () => {
  monter()
  const modale = screen.getByRole('dialog', { name: /Retirer vitrine/ })
  expect(modale).toHaveTextContent('mots de passe seront retirés du Trousseau')
  // La phrase que `08j` a rendue obligatoire, parce que « supprimer une connexion » se lit comme
  // « supprimer la base ». Son absence est le vrai danger de cet écran.
  expect(modale).toHaveTextContent('Les bases distantes ne sont pas touchées')
})

test('le singulier est respecté quand il n’y a qu’une connexion', () => {
  monter({ connexions: ['catalogue'] })
  const modale = screen.getByRole('dialog', { name: /Retirer vitrine/ })
  expect(modale).toHaveTextContent('1 connexion déclarée')
  expect(modale).not.toHaveTextContent('1 connexions')
})

/*
 * **La modale ne parle plus d'environnement actif** (`25a`, `25c`).
 *
 * Elle annonçait le remplaçant de l'actif quand l'environnement retiré l'était. `activeEnvironment`
 * ayant quitté le modèle — l'environnement se choisit dans l'arbre, où il est un palier — il n'y a
 * plus d'actif à remplacer, et le dire nommerait un état qui n'existe pas.
 */
test('la modale ne nomme aucun environnement actif', () => {
  monter()
  expect(screen.getByRole('dialog', { name: /Retirer vitrine/ })).not.toHaveTextContent(
    'environnement actif',
  )
})

test('la modale se referme sur un retrait sans résidu', async () => {
  const utilisateur = userEvent.setup()
  const { onClose } = monter()
  await utilisateur.click(retirer())
  expect(onClose).toHaveBeenCalled()
})

test('un secret resté dans le Trousseau garde la modale ouverte, et se dit', async () => {
  const utilisateur = userEvent.setup()
  const { onClose } = monter({
    onDelete: async () => ({
      ...ISSUE,
      leftoverSecrets: ['dorabase/Atelier Nord/catalogue/vitrine'],
    }),
  })
  await utilisateur.click(retirer())

  // **Refermer sur un succès muet cacherait le fait** : une entrée orpheline du Trousseau ne se
  // découvrirait autrement jamais.
  expect(await screen.findByRole('status')).toHaveTextContent('n’ont pas pu être retirés')
  expect(onClose).not.toHaveBeenCalled()
})

test('un refus s’affiche dans la modale, qui reste ouverte', async () => {
  const utilisateur = userEvent.setup()
  const { onClose } = monter({
    onDelete: async () => {
      throw new Error('« Atelier Nord » n’aurait plus aucun environnement')
    },
  })
  await utilisateur.click(retirer())

  expect(await screen.findByRole('alert')).toHaveTextContent('plus aucun environnement')
  expect(onClose).not.toHaveBeenCalled()
})

test('la modale ne propose ni déplacement de connexion, ni annulation après coup', () => {
  monter()
  // Proposer une action absente est pire que son absence (défaut n° 36) : déplacer une connexion vers
  // un autre environnement demande de déplacer un secret du trousseau, ce qui est un geste à part.
  expect(
    screen.queryByRole('button', { name: /Déplacer|Annuler la suppression|Restaurer/ }),
  ).toBeNull()
})
