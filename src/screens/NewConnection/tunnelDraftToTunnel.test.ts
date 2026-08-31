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
    },
  })

  // **Rien de plus que l'instance et l'étiquette** (`06j`). Un `credentialsFilePath` était
  // converti ici — `''` devenait `null` —, et cette traduction a disparu avec le champ : un
  // brouillon Cloud SQL et le proxy qu'il produit portent désormais les mêmes clés.
  expect(tunnel?.proxy).toEqual({
    kind: 'cloud-sql',
    instanceConnectionName: 'acme:europe-west1:analytics',
  })
  expect(Object.keys(tunnelDraftToTunnel(emptyTunnel('cloud-sql'))?.proxy ?? {}).sort()).toEqual([
    'instanceConnectionName',
    'kind',
  ])
})

test('un brouillon Kubernetes se convertit, le vide devenant une absence', () => {
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'kubernetes',
      kubeconfig: '',
      namespace: '   ',
      resource: '  svc/postgres  ',
    },
  })

  // **Le vide devient `null`, et c'est ce qui donne leur sens aux deux champs optionnels** : absent
  // veut dire « celui que kubectl choisirait ». Une chaîne vide persistée se lirait comme un nom, et
  // `--namespace ''` ferait chercher dans un espace de noms qui n'existe pas.
  expect(tunnel?.proxy).toEqual({
    kind: 'kubernetes',
    kubeconfig: null,
    namespace: null,
    // Rognée — un espace de tête vient d'un copier-coller — mais **jamais réécrite** : pas de
    // `svc/` ajouté d'office, qui viserait un service là où l'utilisateur nommait un pod.
    resource: 'svc/postgres',
  })
})

test('les coordonnées saisies sont transmises, kubeconfig compris', () => {
  // Contrôle négatif du test précédent : sans lui, « le vide devient null » passerait aussi si la
  // conversion mettait `null` partout.
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'kubernetes',
      kubeconfig: '/etc/kubeconfig-prod',
      namespace: 'bases',
      resource: 'statefulset/postgres',
    },
  })
  expect(tunnel?.proxy).toEqual({
    kind: 'kubernetes',
    kubeconfig: '/etc/kubeconfig-prod',
    namespace: 'bases',
    resource: 'statefulset/postgres',
  })
  expect(Object.keys(tunnelDraftToTunnel(emptyTunnel('kubernetes'))?.proxy ?? {}).sort()).toEqual([
    'kind',
    'kubeconfig',
    'namespace',
    'resource',
  ])
})

test('le ~ du kubeconfig n’est pas développé côté écran', () => {
  // **C'est le Rust qui développe**, et c'est le bon endroit : seul le processus qui lancera
  // `kubectl` connaît son `HOME`. Le faire ici donnerait un chemin absolu **persisté**, donc une
  // configuration qui cesse d'être vraie si elle change de machine ou d'utilisateur.
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'kubernetes',
      kubeconfig: '  ~/.kube/prod  ',
      namespace: '',
      resource: 'svc/postgres',
    },
  })
  // Rogné — un blanc de bord vient d'un copier-coller — mais le `~` reste.
  expect(tunnel?.proxy).toMatchObject({ kubeconfig: '~/.kube/prod' })
})

test('une ressource nue n’est pas transformée en service', () => {
  // `kubectl` lit un nom nu comme un **pod**, et c'est son contrat, pas le nôtre. Préfixer
  // d'office changerait la cible sans le dire — et la liste des types qu'il accepte grandit sans
  // nous.
  const tunnel = tunnelDraftToTunnel({
    localPort: null,
    proxy: {
      kind: 'kubernetes',
      kubeconfig: '',
      namespace: '',
      resource: 'postgres-0',
    },
  })
  expect(tunnel?.proxy).toMatchObject({ resource: 'postgres-0' })
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
