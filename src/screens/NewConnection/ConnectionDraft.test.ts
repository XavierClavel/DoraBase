import { emptyDraft, emptyProxy, emptyTunnel } from './ConnectionDraft'

test('un tunnel neuf est SSH, sur le port 22', () => {
  const tunnel = emptyTunnel('ssh')
  expect(tunnel.localPort).toBeNull()
  expect(tunnel.proxy).toEqual({
    kind: 'ssh',
    bastionHost: '',
    // Le port de SSH : le seul champ préremplissable de cette sorte, parce qu'il est vrai
    // pour la quasi-totalité des bastions.
    bastionPort: '22',
    username: '',
    privateKeyPath: '',
  })
})

test('un proxy Cloud SQL neuf n’invente ni instance ni compte de service', () => {
  expect(emptyProxy('cloud-sql')).toEqual({
    kind: 'cloud-sql',
    instanceConnectionName: '',
    // Chaîne vide et non `null` : un champ de saisie ne peut pas porter `null`, et le vide
    // signifie « identifiants par défaut de l'application » — une valeur, pas un trou. La
    // conversion la traduit en `null`, une seule fois, au bon endroit.
    credentialsFilePath: '',
  })
})

test('un brouillon neuf n’a pas de tunnel', () => {
  // Le panneau de `A2` s'ouvre replié et sans badge : un tunnel par défaut mettrait une
  // fausse déclaration sous les yeux de l'utilisateur à chaque ouverture.
  expect(emptyDraft().tunnel).toBeNull()
})

test('les deux sortes de proxy portent exactement leurs champs, et pas ceux de l’autre', () => {
  // C'est l'invariant que `05d` porte côté Rust et que ce brouillon doit refléter : un
  // brouillon Cloud SQL ne peut pas transporter un bastion, sinon `08e` devrait deviner
  // laquelle des deux sortes convertir.
  expect(Object.keys(emptyProxy('ssh')).sort()).toEqual([
    'bastionHost',
    'bastionPort',
    'kind',
    'privateKeyPath',
    'username',
  ])
  expect(Object.keys(emptyProxy('cloud-sql')).sort()).toEqual([
    'credentialsFilePath',
    'instanceConnectionName',
    'kind',
  ])
})
