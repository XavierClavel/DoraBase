import { emptyTunnel } from './ConnectionDraft'
import { tunnelDraftToTunnel } from './tunnelDraftToTunnel'

test('sans proxy, le tunnel reste null', () => {
  expect(tunnelDraftToTunnel(null)).toBeNull()
})

test('un brouillon SSH se convertit en proxy ssh, port analysé', () => {
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'ssh',
      bastionHost: 'bastion.internal',
      bastionPort: '2222',
      username: 'dora',
      privateKeyPath: '/k',
    },
  })

  expect(tunnel).toEqual({
    localPort: null,
    proxy: {
      kind: 'ssh',
      bastionHost: 'bastion.internal',
      bastionPort: 2222,
      username: 'dora',
      privateKeyPath: '/k',
    },
  })
})

test('un brouillon Cloud SQL se convertit en proxy cloud-sql', () => {
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'cloud-sql',
      instanceConnectionName: 'acme:europe-west1:analytics',
      autoIamAuthn: true,
    },
  })

  // **Rien de plus que l'instance et l'étiquette** (`06j`). Un `credentialsFilePath` était
  // converti ici — `''` devenait `null` —, et cette traduction a disparu avec le champ : un
  // brouillon Cloud SQL et le proxy qu'il produit portent désormais les mêmes clés.
  expect(tunnel?.proxy).toEqual({
    kind: 'cloud-sql',
    instanceConnectionName: 'acme:europe-west1:analytics',
    // `06k` : la bascule traverse telle quelle, sans traduction — un booléen des deux côtés.
    autoIamAuthn: true,
  })
  expect(Object.keys(tunnelDraftToTunnel(emptyTunnel('cloud-sql'))?.proxy ?? {}).sort()).toEqual([
    'autoIamAuthn',
    'instanceConnectionName',
    'kind',
  ])
})

test('un port de bastion illisible devient 0 plutôt que NaN', () => {
  // `NaN` ferait échouer `serde` avec une erreur de désérialisation illisible ; `0` laisse le
  // moteur rendre une erreur de connexion claire.
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'ssh',
      bastionHost: '',
      bastionPort: 'abc',
      username: '',
      privateKeyPath: '',
    },
  })
  expect(tunnel?.proxy).toMatchObject({ kind: 'ssh', bastionPort: 0 })
})

test('le port local saisi n’est jamais transmis : il est choisi à l’ouverture', () => {
  // Même si le brouillon en portait un — il ne peut venir que d'une ouverture précédente —, la
  // conversion l'écarte. `06e` se lie au port 0, `06f` lit celui que le proxy annonce : envoyer
  // un numéro d'hier ferait échouer l'ouverture sur un port peut-être repris.
  const tunnel = tunnelDraftToTunnel({ ...emptyTunnel('ssh'), localPort: 63342 })
  expect(tunnel?.localPort).toBeNull()
})
