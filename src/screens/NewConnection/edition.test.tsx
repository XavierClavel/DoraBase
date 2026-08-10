import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Sprite } from '../../design/icons/Sprite'
import type { Database, Project, SecretRef, UpdateVariantRequest } from '../../domain/config'
import { emptyDraft } from './ConnectionDraft'
import { draftToUpdateRequest } from './enregistrerLaBase'
import { NewConnection } from './NewConnection'

const BASE: Database = {
  name: 'analytics',
  engine: 'postgresql',
  variants: [
    {
      environment: 'prod',
      host: 'localhost',
      port: 5445,
      defaultDatabase: 'philippe',
      username: 'philippe',
      // `SecretRef` est un type **nominal** (`05a`) : une chaîne ne s'y affecte pas, ce qui empêche
      // d'y mettre une valeur de secret par erreur. Le cast est donc explicite, et cantonné au test.
      password: 'Philippe/analytics/prod' as SecretRef,
      sslMode: 'prefer',
      readOnly: true,
      reconnectOnStartup: false,
      tunnel: null,
    },
  ],
}

const APRES: Project[] = [{ name: 'Philippe', activeEnvironment: 'prod', databases: [BASE] }]

function monter(over: { onUpdate?: (r: UpdateVariantRequest) => Promise<Project[]> } = {}) {
  const requetes: UpdateVariantRequest[] = []
  render(
    <>
      <Sprite />
      <NewConnection
        onClose={() => {}}
        projects={[{ id: 'Philippe', name: 'Philippe' }]}
        edition={{ project: 'Philippe', database: BASE }}
        onBrowseKey={async () => null}
        onTest={async () => {
          throw new Error('non employé')
        }}
        onUpdate={
          over.onUpdate ??
          (async (requete) => {
            requetes.push(requete)
            return APRES
          })
        }
      />
    </>,
  )
  return requetes
}

const enregistrer = () => screen.getByRole('button', { name: /Enregistrer les modifications/ })

describe('draftToUpdateRequest', () => {
  it('l’identité vient de la cible, jamais du brouillon', () => {
    // Le formulaire verrouille les trois champs d'identité, donc le brouillon ne peut pas diverger
    // **par l'écran**. Ce test le vérifie au niveau de la fonction, où la divergence est
    // représentable : c'est le seul endroit où la garde est observable.
    const draft = {
      ...emptyDraft(),
      name: 'renommee',
      project: 'AutreProjet',
      environment: 'dev' as const,
      host: 'db.nouveau',
    }
    const requete = draftToUpdateRequest(draft, {
      project: 'Philippe',
      database: 'analytics',
      environment: 'prod',
    })

    expect(requete.project).toBe('Philippe')
    expect(requete.database).toBe('analytics')
    expect(requete.environment).toBe('prod')
    // Les réglages, eux, viennent bien du brouillon.
    expect(requete.variant.host).toBe('db.nouveau')
  })
})

describe('modifier une connexion (08g)', () => {
  it('la modale se nomme par la base et son bouton dit « modifications »', () => {
    monter()
    expect(screen.getByRole('dialog', { name: 'Modifier analytics' })).toBeInTheDocument()
    expect(enregistrer()).toBeInTheDocument()
  })

  it('les réglages enregistrés sont préremplis', () => {
    monter()
    expect(screen.getByLabelText('Hôte')).toHaveValue('localhost')
    expect(screen.getByLabelText('Port')).toHaveValue('5445')
    expect(screen.getByLabelText('Base par défaut')).toHaveValue('philippe')
    expect(screen.getByLabelText('Utilisateur')).toHaveValue('philippe')
  })

  it('le mot de passe part vide : le front ne l’a pas', () => {
    monter()
    // La variante ne porte qu'une `SecretRef`, jamais la valeur — et un champ vide veut dire
    // « inchangé », ce que le cœur applique.
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('')
  })

  it('les trois champs d’identité sont verrouillés, avec leur raison', () => {
    monter()
    const nom = screen.getByLabelText('Nom de la base')
    expect(nom).toBeDisabled()
    // Un contrôle désactivé sans explication passe pour un bug — la leçon de `09f`.
    expect(nom).toHaveAttribute('title', expect.stringContaining('identifient la base'))
    expect(screen.getByRole('combobox', { name: 'Projet' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /prod/ })).toBeDisabled()
  })

  it('enregistrer envoie une mise à jour, jamais un ajout', async () => {
    const utilisateur = userEvent.setup()
    const requetes = monter()

    await utilisateur.clear(screen.getByLabelText('Port'))
    await utilisateur.type(screen.getByLabelText('Port'), '5433')
    await utilisateur.click(enregistrer())

    await waitFor(() => expect(requetes).toHaveLength(1))
    const requete = requetes[0]
    expect(requete?.variant.port).toBe(5433)
    // L'identité vient de la **cible**, pas du brouillon : c'est elle qui désigne la variante.
    expect(requete?.project).toBe('Philippe')
    expect(requete?.database).toBe('analytics')
    expect(requete?.environment).toBe('prod')
    // Champ vide : le secret reste en place.
    expect(requete?.password).toBeNull()
  })

  it('un mot de passe saisi est envoyé, et remplace le secret', async () => {
    const utilisateur = userEvent.setup()
    const requetes = monter()

    await utilisateur.type(screen.getByLabelText('Mot de passe'), 'nouveau')
    await utilisateur.click(enregistrer())

    await waitFor(() => expect(requetes[0]?.password).toBe('nouveau'))
  })

  it('un refus du cœur s’affiche là où les échecs s’affichent déjà', async () => {
    const utilisateur = userEvent.setup()
    monter({
      onUpdate: async () => {
        throw new Error('la base « analytics » n’existe pas dans le projet « Philippe »')
      },
    })

    await utilisateur.click(enregistrer())
    expect(await screen.findByText(/n’existe pas dans le projet/)).toBeInTheDocument()
  })

  it('un tunnel enregistré est prérempli, panneau compris', () => {
    const avecTunnel: Database = {
      ...BASE,
      variants: [
        {
          ...BASE.variants[0],
          tunnel: {
            kind: 'ssh',
            bastionHost: 'bastion.interne',
            bastionPort: 2222,
            username: 'ops',
            privateKeyPath: '/Users/moi/.ssh/id_ed25519',
            localPort: null,
          },
        },
      ],
    } as Database
    render(
      <>
        <Sprite />
        <NewConnection
          onClose={() => {}}
          projects={[{ id: 'Philippe', name: 'Philippe' }]}
          edition={{ project: 'Philippe', database: avecTunnel }}
          onBrowseKey={async () => null}
          onTest={async () => {
            throw new Error('non employé')
          }}
          onUpdate={async () => APRES}
        />
      </>,
    )

    // Le panneau est replié à l'ouverture (`08c`) : le badge dit qu'il y a un tunnel dedans.
    expect(screen.getByText(/SSH activé/)).toBeInTheDocument()
  })
})
