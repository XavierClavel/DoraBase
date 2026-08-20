# Plan d'implémentation — 08k A2 : le panneau proxy à deux visages

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser superpowers:subagent-driven-development
> (recommandé) ou superpowers:executing-plans pour dérouler ce plan tâche par tâche.
> Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** que le sélecteur « Type » du panneau « Proxy / tunnel » soit un vrai choix —
SSH ou Cloud SQL — avec les champs de la sorte retenue, et rien de l'autre.

**Architecture :** `TunnelDraft` suit l'union de `05d` : un port local commun, et un `proxy`
discriminé sur `kind`. Le panneau rétrécit sur `kind` avant de lire un champ, donc le
compilateur refuse un visage qui lirait le champ de l'autre sorte — c'est ce qui remplace la
maquette absente comme garde-fou. La sorte affichée vit en état local de `NewConnection` tant
qu'aucun champ n'a été touché : choisir un type n'est pas déclarer un proxy.

**Stack :** React 19 · TypeScript strict · CSS modules · Vitest + Testing Library ·
Playwright pour les mesures

**Spec :** `specs/08k-a2-panneau-cloud-sql.md` · **Dépend de :** `05d` fait et commité
(`06g` n'est pas requis pour cet écran, mais l'ordre `05d → 06f → 08f` reste le bon : saisir
ce que le moteur ne sait pas ouvrir donnerait un formulaire qui échoue toujours)

---

## Ce qu'il faut savoir avant de commencer

**Cloud SQL n'est pas dans le handoff.** Deux champs, un libellé d'aide et un libellé de badge
sont **inventés** ici. Les choix restent dans le vocabulaire visuel de `08c` — 28 px, même
grille, même bouton « Parcourir… » — pour qu'une maquette ultérieure ait peu à corriger. C'est
déjà consigné au § « À trancher » de `specs/README.md` ; ne pas le réécrire, ne pas l'oublier
non plus.

**Deux comportements à ne pas confondre.**

| Action de l'utilisateur | Effet |
| --- | --- |
| Changer le « Type », **sans** tunnel déclaré | change le visage affiché, ne crée rien |
| Changer le « Type », **avec** un tunnel déclaré | remplace le proxy par un neuf de la nouvelle sorte — les champs de l'autre sont perdus |
| Toucher un champ, sans tunnel déclaré | crée le tunnel de la sorte affichée (règle de `08c`) |

Le second point est une **perte de saisie visible**, assumée : `05d` a fait de `Proxy` une
union, donc `08e` ne peut pas convertir un brouillon portant un bastion **et** une instance.
Garder les champs « au cas où » obligerait la conversion à deviner.

**Le vide du champ « Compte de service » est une valeur**, pas un champ oublié : il signifie
« identifiants par défaut de l'application ». Le libellé d'aide doit être **lié** au champ,
donc annoncé — un texte simplement affiché à côté ne l'est pas.

---

## Structure de fichiers

| Fichier | Responsabilité | Action |
| --- | --- | --- |
| `src/screens/NewConnection/ConnectionDraft.ts` | `TunnelDraft` et `ProxyDraft` en union | modifier |
| `src/screens/NewConnection/TunnelPanel.tsx` | les deux visages | modifier |
| `src/screens/NewConnection/NewConnection.tsx` | sorte affichée, création, remise à zéro | modifier |
| `src/screens/NewConnection/ouvrirSelecteurDeCle.ts` | + sélecteur de compte de service | modifier |
| `src/screens/NewConnection/draftToRequest.ts` | conversion vers la requête de test | modifier |
| `src/screens/NewConnection/enregistrerLaBase.ts` | conversion vers la configuration | modifier |
| `src/screens/NewConnection/NewConnection.module.css` | colonne de l'instance, libellé d'aide | modifier |
| `src/screens/NewConnection/TunnelPanel.test.tsx` | les deux visages, la bascule | modifier |
| `e2e/a2-nouvelle-connexion.spec.ts` | mesure des 28 px du visage Cloud SQL | modifier |

---

## Tâche 1 : `TunnelDraft` suit l'union

**Fichiers :** modifier `src/screens/NewConnection/ConnectionDraft.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `src/screens/NewConnection/ConnectionDraft.test.ts` :

```ts
import { emptyDraft, emptyProxy, emptyTunnel } from './ConnectionDraft'

test('un tunnel neuf est SSH, sur le port 22', () => {
  const tunnel = emptyTunnel('ssh')
  expect(tunnel.localPort).toBeNull()
  expect(tunnel.proxy).toEqual({
    kind: 'ssh',
    bastionHost: '',
    // Le port de SSH : le seul champ préremplissable de la sorte, parce qu'il est vrai
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
```

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Commande : `pnpm vitest run src/screens/NewConnection/ConnectionDraft.test.ts`

Attendu : ÉCHEC — `emptyProxy` n'existe pas, `emptyTunnel` ne prend pas d'argument.

- [ ] **Étape 3 : remplacer `TunnelDraft` et `emptyTunnel`**

Dans `ConnectionDraft.ts`, remplacer le bloc `TunnelDraft` + `emptyTunnel` par :

```ts
/**
 * Le bastion SSH, tel qu'il est saisi.
 *
 * `bastionPort` est une **chaîne**, même raison que `port` : un champ de saisie passe par des
 * états qu'un `u16` interdit.
 */
export type ProxySshDraft = {
  kind: 'ssh'
  bastionHost: string
  bastionPort: string
  username: string
  privateKeyPath: string
}

/**
 * Le proxy Cloud SQL, tel qu'il est saisi.
 *
 * `credentialsFilePath` est une **chaîne vide** quand rien n'est choisi, là où le modèle
 * porte `None` : un champ de saisie ne peut pas contenir `null`. La traduction se fait à la
 * conversion, une seule fois. Le vide signifie « identifiants par défaut de l'application »
 * — le cas courant, et une valeur valable.
 */
export type ProxyCloudSqlDraft = {
  kind: 'cloud-sql'
  /** `projet:région:instance`. Non validé ici : `06g` refuse à l'ouverture. */
  instanceConnectionName: string
  credentialsFilePath: string
}

/**
 * Ce qui **diffère** entre les deux sortes, en saisie.
 *
 * **Une union discriminée, comme `Proxy` de `05d`**, et pas seulement par symétrie : Cloud
 * SQL n'est pas dans le handoff, donc aucune maquette ne rattrapera un panneau qui lirait
 * `bastionHost` sur un proxy Cloud SQL. Le compilateur le rattrape ; c'est ce qui remplace
 * la maquette comme garde-fou.
 */
export type ProxyDraft = ProxySshDraft | ProxyCloudSqlDraft

/** La sorte de proxy, telle que le sélecteur « Type » la nomme. */
export type ProxyKind = ProxyDraft['kind']

/**
 * Le panneau « Proxy / tunnel » de `A2`, tel qu'il est saisi.
 *
 * `localPort` est **hors de `proxy`** parce qu'il est vrai des deux sortes — c'est ce que
 * `05d` exprime en le sortant de l'énumération, et le panneau le rend visible : la seule
 * partie qui ne bouge pas d'un visage à l'autre est la seule qui est commune.
 */
export type TunnelDraft = {
  /**
   * Le port local **choisi par l'app**, pas saisi. `null` tant qu'aucun proxy n'est ouvert.
   *
   * `A2` affiche « auto (63342) » : le nombre est le port réellement retenu. Inventer un
   * numéro avant l'ouverture serait un mensonge, et « auto (0) » serait pire.
   */
  localPort: number | null
  proxy: ProxyDraft
}

/** Un proxy neuf de la sorte demandée. */
export function emptyProxy(kind: ProxyKind): ProxyDraft {
  switch (kind) {
    case 'ssh':
      // 22 est le port de SSH : le seul champ préremplissable de cette sorte, parce qu'il est
      // vrai pour la quasi-totalité des bastions.
      return { kind: 'ssh', bastionHost: '', bastionPort: '22', username: '', privateKeyPath: '' }
    case 'cloud-sql':
      return { kind: 'cloud-sql', instanceConnectionName: '', credentialsFilePath: '' }
  }
}

/** Un tunnel neuf de la sorte demandée. */
export function emptyTunnel(kind: ProxyKind): TunnelDraft {
  return { localPort: null, proxy: emptyProxy(kind) }
}
```

- [ ] **Étape 4 : lancer le test pour vérifier qu'il passe**

Commande : `pnpm vitest run src/screens/NewConnection/ConnectionDraft.test.ts`

Attendu : PASS, trois tests. Le reste du front **ne compile plus** — tâches 2 à 5.

---

## Tâche 2 : les deux sélecteurs de fichier

**Fichiers :** modifier `src/screens/NewConnection/ouvrirSelecteurDeCle.ts`

- [ ] **Étape 1 : ajouter le sélecteur de compte de service**

À la fin du fichier :

```ts
/**
 * Ouvre le sélecteur du fichier de compte de service Google, et rend son chemin.
 *
 * **Même fichier que `ouvrirSelecteurDeCle`**, et non un module de plus : les deux ne font
 * qu'appeler le plugin `dialog`, et c'est justement ce fichier qui existe pour être le seul
 * point de contact avec lui. Les séparer multiplierait les endroits à simuler sous Vitest.
 *
 * **Aucune permission à ajouter.** `dialog:allow-open` est déjà accordée par `08c`, et elle
 * suffit : ouvrir un second sélecteur n'est pas une seconde capacité. Gardé par
 * `src-tauri/tests/permissions.rs`, qui compte les permissions et échouerait si l'on avait
 * pris `dialog:default`.
 *
 * **Aucune lecture du fichier ici**, comme pour la clé privée : il porte une clé privée de
 * compte de service, et la lire pour « valider » la saisie ferait entrer de la matière
 * privée dans l'écran sans nécessité. `06g` la passe au proxy, qui la lit.
 */
export async function ouvrirSelecteurDeCompteDeService(): Promise<string | null> {
  const choisi = await open({
    multiple: false,
    directory: false,
    title: 'Choisir un fichier de compte de service Google',
    // Google distribue ces clés en JSON. Le filtre guide sans empêcher de saisir un chemin
    // quelconque — même principe que pour la clé SSH.
    filters: [{ name: 'Compte de service', extensions: ['json'] }],
  })

  return typeof choisi === 'string' ? choisi : null
}
```

- [ ] **Étape 2 : vérifier que les permissions n'ont pas bougé**

Commande : `cargo test --manifest-path src-tauri/Cargo.toml permissions`

Attendu : PASS **sans modification du test**. S'il faut le toucher, c'est qu'une permission a
été ajoutée — revenir en arrière et comprendre pourquoi.

---

## Tâche 3 : le panneau à deux visages

**Fichiers :** modifier `src/screens/NewConnection/TunnelPanel.tsx`,
`src/screens/NewConnection/TunnelPanel.test.tsx`,
`src/screens/NewConnection/NewConnection.module.css`

- [ ] **Étape 1 : écrire les tests qui échouent**

À ajouter dans `TunnelPanel.test.tsx`. Adapter `monter()` pour accepter les deux fonctions de
sélection — lire le fichier et suivre sa forme actuelle plutôt que de la réinventer.

```ts
async function choisirLeType(libelle: 'SSH' | 'Cloud SQL') {
  const panneau = await deplier()
  await userEvent.selectOptions(panneau.getByLabelText('Type'), libelle)
  return panneau
}

test('le sélecteur de type propose les deux sortes', async () => {
  monter()
  await deplier()
  const options = screen
    .getByRole('combobox', { name: 'Type' })
    .querySelectorAll<HTMLOptionElement>('option')
  expect([...options].map((o) => o.value)).toEqual(['ssh', 'cloud-sql'])
})

test('le visage Cloud SQL montre ses deux champs, et aucun champ de bastion', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')

  expect(panneau.getByLabelText('Instance')).toBeInTheDocument()
  expect(panneau.getByLabelText('Compte de service')).toBeInTheDocument()
  // L'autre moitié du critère, et la plus importante : les champs de l'autre sorte ne sont
  // pas seulement vides, ils sont **absents**. Un champ « Hôte du bastion » masqué en CSS
  // resterait dans l'arbre d'accessibilité et serait annoncé.
  for (const nom of ['Hôte du bastion', 'Utilisateur', 'Clé privée']) {
    expect(panneau.queryByLabelText(nom)).not.toBeInTheDocument()
  }
})

test('le visage SSH ne montre aucun champ Cloud SQL', async () => {
  monter()
  const panneau = await deplier()
  for (const nom of ['Instance', 'Compte de service']) {
    expect(panneau.queryByLabelText(nom)).not.toBeInTheDocument()
  }
})

test('le port local mappé est commun aux deux visages', async () => {
  monter()
  const ssh = await deplier()
  expect(ssh.getByLabelText('Port local mappé')).toHaveTextContent('auto')
  const cloud = await choisirLeType('Cloud SQL')
  // Le seul champ qui ne bouge pas est le seul qui est commun aux deux sortes — c'est ce que
  // `05d` exprime en sortant `localPort` de l'énumération.
  expect(cloud.getByLabelText('Port local mappé')).toHaveTextContent('auto')
})

test('le libellé d’aide du compte de service est annoncé, pas seulement affiché', async () => {
  monter()
  const panneau = await choisirLeType('Cloud SQL')
  const champ = panneau.getByLabelText('Compte de service')
  const decrit = champ.getAttribute('aria-describedby')
  expect(decrit).toBeTruthy()
  const aide = document.getElementById(decrit as string)
  // Un texte simplement posé à côté du champ n'est **pas** annoncé par un lecteur d'écran.
  // Le lien est ce qui fait la différence entre « le vide est une valeur » compris et un
  // champ qui a l'air oublié.
  expect(aide?.textContent).toMatch(/identifiants par défaut/i)
})

test('changer de type efface les champs de l’autre sorte', async () => {
  monter()
  const panneau = await deplier()
  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'bastion.internal')
  expect(panneau.getByLabelText('Hôte du bastion')).toHaveValue('bastion.internal')

  await userEvent.selectOptions(panneau.getByLabelText('Type'), 'Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Instance'), 'acme:europe-west1:analytics')

  await userEvent.selectOptions(panneau.getByLabelText('Type'), 'SSH')
  // **Une perte de saisie visible, et assumée.** `05d` a fait de `Proxy` une union, donc
  // `08e` ne peut pas convertir un brouillon portant un bastion **et** une instance. Garder
  // les champs « au cas où » obligerait la conversion à deviner.
  expect(panneau.getByLabelText('Hôte du bastion')).toHaveValue('')

  await userEvent.selectOptions(panneau.getByLabelText('Type'), 'Cloud SQL')
  expect(panneau.getByLabelText('Instance')).toHaveValue('')
})

test('le badge nomme la sorte, et suit la présence du proxy', async () => {
  monter()
  const panneau = await deplier()
  // Sans champ touché, rien n'est déclaré : pas de badge. Le mockup ne montre pas cet état,
  // et c'est la lecture retenue par `08c`.
  expect(panneau.queryByText(/activé/)).not.toBeInTheDocument()

  await userEvent.type(panneau.getByLabelText('Hôte du bastion'), 'b')
  expect(panneau.getByText('SSH activé')).toBeInTheDocument()

  await userEvent.selectOptions(panneau.getByLabelText('Type'), 'Cloud SQL')
  // Nommer la sorte est ce qui permet de lire l'état du panneau **replié**, où les champs ne
  // sont plus visibles.
  expect(panneau.getByText('Cloud SQL activé')).toBeInTheDocument()
})

test('« Parcourir… » remplit le champ de compte de service', async () => {
  monter({ onBrowseCredentials: async () => '/Users/dora/sa.json' })
  const panneau = await choisirLeType('Cloud SQL')
  await userEvent.click(panneau.getByRole('button', { name: 'Parcourir…' }))
  expect(panneau.getByLabelText('Compte de service')).toHaveValue('/Users/dora/sa.json')
})

test('une annulation du sélecteur n’efface pas le chemin déjà saisi', async () => {
  monter({ onBrowseCredentials: async () => null })
  const panneau = await choisirLeType('Cloud SQL')
  await userEvent.type(panneau.getByLabelText('Compte de service'), '/deja/sa.json')
  await userEvent.click(panneau.getByRole('button', { name: 'Parcourir…' }))
  // `null` = annulation. Écraser le chemin déjà saisi serait une perte — même règle que
  // `08c` applique à la clé privée.
  expect(panneau.getByLabelText('Compte de service')).toHaveValue('/deja/sa.json')
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `pnpm vitest run src/screens/NewConnection/TunnelPanel.test.tsx`

Attendu : ÉCHEC — le sélecteur n'a qu'une option, `Instance` n'existe pas.

- [ ] **Étape 3 : réécrire `TunnelPanel.tsx`**

```tsx
import { useId } from 'react'
import { Badge } from '../../ui/Badge/Badge'
import { CollapsiblePanel } from '../../ui/CollapsiblePanel/CollapsiblePanel'
import { Field } from '../../ui/Field/Field'
import { Select } from '../../ui/Select/Select'
import { emptyProxy, type ProxyDraft, type ProxyKind, type TunnelDraft } from './ConnectionDraft'
import styles from './NewConnection.module.css'

type TunnelPanelProps = {
  /** `null` quand la connexion ne passe par aucun proxy. */
  tunnel: TunnelDraft | null
  /** La sorte **affichée**, qui peut différer de celle du tunnel quand il n'y en a pas. */
  kind: ProxyKind
  onKindChange: (kind: ProxyKind) => void
  /**
   * Le proxy entier, et non un `Partial`.
   *
   * **Pourquoi pas un patch.** Un `Partial<ProxyDraft>` sur une union autorise un objet
   * mêlant les champs des deux sortes, ce que le type est précisément là pour interdire. Le
   * panneau connaît le proxy courant, donc il peut composer le suivant — et le composer est
   * le seul moyen de garder l'union honnête.
   */
  onProxyChange: (proxy: ProxyDraft) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Ouvre le sélecteur de fichier de la clé privée SSH, et rend le chemin choisi, ou `null`
   * si l'utilisateur annule.
   *
   * **Injecté plutôt qu'appelé directement.** Le plugin `dialog` de Tauri ne répond pas hors
   * de la webview : sous Vitest, `open()` rejette. Passer l'ouverture en paramètre rend le
   * câblage du bouton testable, et laisse l'appel réel au seul endroit qui tourne dans l'app.
   */
  onBrowseKey: () => Promise<string | null>
  /** La même chose pour le fichier de compte de service Google. */
  onBrowseCredentials: () => Promise<string | null>
}

/**
 * Les deux sortes de proxy. `05d` les modélise, `06g` ouvre la seconde.
 *
 * Cloud SQL **n'est pas dans le handoff** : ce libellé, comme les deux champs de son visage,
 * est inventé ici. Voir `specs/README.md` § À trancher.
 */
const TYPES = [
  { value: 'ssh', label: 'SSH' },
  { value: 'cloud-sql', label: 'Cloud SQL' },
] as const

/** Ce que le badge annonce pour chaque sorte. */
const BADGES: Record<ProxyKind, string> = {
  ssh: 'SSH activé',
  'cloud-sql': 'Cloud SQL activé',
}

/**
 * Le bloc « Proxy / tunnel » de `A2`, dans l'un ou l'autre de ses deux visages.
 *
 * Le panneau existe toujours ; c'est la **présence d'un proxy** qui change. Sans proxy, les
 * champs sont là mais vides et le badge est absent — le mockup ne montre pas cet état, et
 * c'est la seule lecture cohérente : masquer le panneau entier ferait disparaître une
 * fonction du formulaire.
 *
 * Toucher un champ crée le proxy s'il n'existe pas (voir `NewConnection`) : l'utilisateur qui
 * saisit un bastion déclare par là qu'il en veut un. **Changer le Type, en revanche, ne crée
 * rien** : choisir une sorte n'est pas déclarer un proxy, et faire apparaître un badge
 * « Cloud SQL activé » sur une instance vide serait une fausse déclaration.
 */
export function TunnelPanel({
  tunnel,
  kind,
  onKindChange,
  onProxyChange,
  open,
  onOpenChange,
  onBrowseKey,
  onBrowseCredentials,
}: TunnelPanelProps) {
  const aideId = useId()

  // Le proxy affiché : celui du tunnel s'il existe **et** s'il est de la sorte choisie, un
  // proxy vide sinon. Le second cas couvre le panneau sans tunnel, où les champs sont là
  // mais vides.
  const proxy: ProxyDraft = tunnel && tunnel.proxy.kind === kind ? tunnel.proxy : emptyProxy(kind)

  async function parcourir(
    ouvrir: () => Promise<string | null>,
    appliquer: (chemin: string) => ProxyDraft,
  ) {
    const chemin = await ouvrir()
    // `null` = l'utilisateur a annulé. Écraser le chemin déjà saisi serait une perte.
    if (chemin !== null) onProxyChange(appliquer(chemin))
  }

  return (
    <div className={styles.tunnelBlock}>
      <CollapsiblePanel
        title="Proxy / tunnel"
        icon="shield"
        badge={tunnel ? <Badge tone="violet">{BADGES[tunnel.proxy.kind]}</Badge> : undefined}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className={styles.tunnelGrid}>
          <Select
            label="Type"
            size="sm"
            options={TYPES}
            value={kind}
            onValueChange={onKindChange}
          />

          {proxy.kind === 'ssh' ? (
            <>
              <Field
                label="Hôte du bastion"
                size="sm"
                mono
                value={proxy.bastionHost}
                onChange={(event) => onProxyChange({ ...proxy, bastionHost: event.target.value })}
              />
              <Field
                label="Port"
                size="sm"
                mono
                inputMode="numeric"
                value={proxy.bastionPort}
                onChange={(event) => onProxyChange({ ...proxy, bastionPort: event.target.value })}
              />
              <Field
                label="Utilisateur"
                size="sm"
                mono
                value={proxy.username}
                onChange={(event) => onProxyChange({ ...proxy, username: event.target.value })}
              />
            </>
          ) : (
            // L'instance prend les trois colonnes restantes : un nom de connexion
            // `projet:région:instance` est long, et le couper sur `1fr` le rendrait illisible.
            <Field
              label="Instance"
              size="sm"
              mono
              className={styles.tunnelInstance}
              placeholder="projet:région:instance"
              value={proxy.instanceConnectionName}
              onChange={(event) =>
                onProxyChange({ ...proxy, instanceConnectionName: event.target.value })
              }
            />
          )}

          <div className={styles.tunnelKeyRow}>
            {proxy.kind === 'ssh' ? (
              <Field
                label="Clé privée"
                size="sm"
                mono
                value={proxy.privateKeyPath}
                onChange={(event) =>
                  onProxyChange({ ...proxy, privateKeyPath: event.target.value })
                }
                suffix={
                  <button
                    type="button"
                    className={styles.browse}
                    onClick={() =>
                      parcourir(onBrowseKey, (chemin) => ({ ...proxy, privateKeyPath: chemin }))
                    }
                  >
                    Parcourir…
                  </button>
                }
              />
            ) : (
              <div>
                <Field
                  label="Compte de service"
                  size="sm"
                  mono
                  aria-describedby={aideId}
                  value={proxy.credentialsFilePath}
                  onChange={(event) =>
                    onProxyChange({ ...proxy, credentialsFilePath: event.target.value })
                  }
                  suffix={
                    <button
                      type="button"
                      className={styles.browse}
                      onClick={() =>
                        parcourir(onBrowseCredentials, (chemin) => ({
                          ...proxy,
                          credentialsFilePath: chemin,
                        }))
                      }
                    >
                      Parcourir…
                    </button>
                  }
                />
                {/* **Lié au champ par `aria-describedby`**, et non simplement posé à côté :
                    un texte voisin n'est pas annoncé par un lecteur d'écran, et c'est
                    précisément l'information qui empêche de lire ce champ vide comme un champ
                    oublié. */}
                <p id={aideId} className={styles.tunnelHint}>
                  Vide : identifiants par défaut de l'application
                </p>
              </div>
            )}

            <div>
              {/* **Un `<output>`, et pas un `<input disabled>` ni un `<div>`.**
                  `<output>` désigne « le résultat d'un calcul de l'application » : c'est
                  exactement ce port, choisi à l'ouverture du proxy (`06e`, `06g`), jamais
                  saisi. Une première version employait un `<div aria-label>` — que Biome a
                  refusé, à juste titre : `aria-label` sur un élément sans rôle est **ignoré**.
                  `<output>` est *labelable*, donc un vrai `<label for>` le nomme, et il n'est
                  éditable ni focalisable par nature. */}
              <label className={styles.label} htmlFor="tunnel-local-port">
                Port local mappé
              </label>
              <output id="tunnel-local-port" className={styles.localPort}>
                {tunnel?.localPort == null ? 'auto' : `auto (${tunnel.localPort})`}
              </output>
            </div>
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
```

- [ ] **Étape 4 : ajouter les deux règles CSS**

À la fin du bloc « Panneau proxy / tunnel » de `NewConnection.module.css` :

```css
/* L'instance Cloud SQL prend les trois colonnes restantes après « Type ». Un nom de
 * connexion `projet:région:instance` fait facilement quarante caractères ; le couper sur la
 * colonne `1fr` de l'hôte du bastion le rendrait illisible. */
.tunnelInstance {
  grid-column: 2 / -1;
}

/* Le libellé d'aide du compte de service. Aucune maquette : reprend la taille et la couleur
 * des étiquettes du panneau, en poids normal pour se distinguer d'une étiquette de champ. */
.tunnelHint {
  margin: 4px 0 0;
  color: var(--ink-8);
  font-family: var(--font-ui);
  font-size: var(--text-label);
  font-weight: var(--weight-regular);
}
```

**Note pour l'agent :** vérifier que `--ink-8`, `--text-label` et `--weight-regular` existent
dans `src/design/tokens.css`. Sinon, employer les jetons voisins déjà utilisés par `.label`
dans ce même fichier — **aucune valeur littérale**, et aucun jeton inventé sans passer par
`tokens.json`.

- [ ] **Étape 5 : lancer les tests**

Ils échoueront encore : `NewConnection` ne passe pas les nouvelles props. C'est la tâche 4.

---

## Tâche 4 : la sorte affichée, la création, la remise à zéro

**Fichiers :** modifier `src/screens/NewConnection/NewConnection.tsx`

- [ ] **Étape 1 : remplacer `patchTunnel`**

```tsx
  /**
   * La sorte de proxy **affichée** par le panneau.
   *
   * En état local et non dans le brouillon, parce qu'elle existe avant tout proxy : changer
   * le « Type » sans rien saisir ne déclare rien, donc `draft.tunnel` reste `null` et n'a
   * nulle part où ranger ce choix. Une fois un proxy déclaré, c'est `draft.tunnel.proxy.kind`
   * qui fait foi — et les deux sont tenus égaux par `changerSorte`.
   */
  const [sorteProxy, setSorteProxy] = useState<ProxyKind>('ssh')

  /**
   * Toucher un champ du panneau **crée** le proxy s'il n'existe pas.
   *
   * L'utilisateur qui saisit un bastion déclare par là qu'il en veut un ; lui demander de
   * cocher une case en plus serait une étape que le handoff ne maquette pas. `05a` garde
   * l'absence représentable (`Option<Tunnel>`), et c'est ce qui compte : `06b` refuse une
   * variante déclarant un proxy qu'on n'a pas ouvert.
   */
  function changerProxy(proxy: ProxyDraft) {
    setDraft((previous) => ({
      ...previous,
      // `localPort` est conservé s'il existait : il vient de l'ouverture, pas de la saisie.
      tunnel: { localPort: previous.tunnel?.localPort ?? null, proxy },
    }))
  }

  /**
   * Changer le « Type » remet à zéro les champs de l'autre sorte.
   *
   * **Par nécessité, pas par hygiène** : `05d` a fait de `Proxy` une union, donc `08e` ne peut
   * pas convertir un brouillon portant un bastion **et** une instance. Garder les champs
   * « au cas où l'utilisateur revienne » obligerait la conversion à choisir, c'est-à-dire à
   * deviner.
   *
   * Sans proxy déclaré, seule la sorte affichée change : choisir un type n'est pas déclarer un
   * proxy, et faire apparaître « Cloud SQL activé » sur une instance vide serait une fausse
   * déclaration.
   */
  function changerSorte(kind: ProxyKind) {
    setSorteProxy(kind)
    setDraft((previous) =>
      previous.tunnel ? { ...previous, tunnel: emptyTunnel(kind) } : previous,
    )
  }
```

Mettre à jour l'import :

```tsx
import {
  type ConnectionDraft,
  emptyDraft,
  emptyTunnel,
  type ProxyDraft,
  type ProxyKind,
} from './ConnectionDraft'
```

- [ ] **Étape 2 : câbler le panneau**

```tsx
      <TunnelPanel
        tunnel={draft.tunnel}
        kind={draft.tunnel?.proxy.kind ?? sorteProxy}
        onKindChange={changerSorte}
        onProxyChange={changerProxy}
        open={tunnelOuvert}
        onOpenChange={setTunnelOuvert}
        onBrowseKey={onBrowseKey}
        onBrowseCredentials={onBrowseCredentials}
      />
```

`kind` est dérivé du brouillon **quand il y a un proxy** : ainsi l'état local ne peut pas
diverger de ce qui est réellement déclaré, même si un futur appelant remplaçait le brouillon
de l'extérieur.

- [ ] **Étape 3 : ajouter la prop `onBrowseCredentials`**

Dans `NewConnectionProps` et la déstructuration, sur le modèle exact de `onBrowseKey` :

```tsx
  onBrowseCredentials?: () => Promise<string | null>
```

```tsx
  onBrowseCredentials = ouvrirSelecteurDeCompteDeService,
```

et importer `ouvrirSelecteurDeCompteDeService` depuis `./ouvrirSelecteurDeCle`.

- [ ] **Étape 4 : lancer les tests du panneau**

Commande : `pnpm vitest run src/screens/NewConnection/TunnelPanel.test.tsx`

Attendu : PASS, les neuf nouveaux tests et les anciens — **sauf** celui qui affirme que le
sélecteur ne propose que SSH. Le remplacer par le nouveau test des deux options ; ne pas le
laisser en le « corrigeant » à moitié.

---

## Tâche 5 : les deux conversions

**Fichiers :** modifier `src/screens/NewConnection/draftToRequest.ts`,
`src/screens/NewConnection/enregistrerLaBase.ts`

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `src/screens/NewConnection/draftToRequest.test.ts` :

```ts
import { emptyDraft, emptyTunnel } from './ConnectionDraft'
import { draftToRequest } from './draftToRequest'

test('un brouillon SSH se convertit en proxy ssh', () => {
  const draft = {
    ...emptyDraft(),
    tunnel: {
      localPort: null,
      proxy: {
        kind: 'ssh' as const,
        bastionHost: 'bastion.internal',
        bastionPort: '2222',
        username: 'dora',
        privateKeyPath: '/k',
      },
    },
  }

  expect(draftToRequest(draft).variant.tunnel).toEqual({
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
  const draft = {
    ...emptyDraft(),
    tunnel: {
      localPort: null,
      proxy: {
        kind: 'cloud-sql' as const,
        instanceConnectionName: 'acme:europe-west1:analytics',
        credentialsFilePath: '/Users/dora/sa.json',
      },
    },
  }

  expect(draftToRequest(draft).variant.tunnel).toEqual({
    localPort: null,
    proxy: {
      kind: 'cloud-sql',
      instanceConnectionName: 'acme:europe-west1:analytics',
      credentialsFilePath: '/Users/dora/sa.json',
    },
  })
})

test('un compte de service vide devient null, et non une chaîne vide', () => {
  // `05d` : `None` signifie « identifiants par défaut de l'application ». Envoyer `""`
  // ferait passer `--credentials-file ""` au proxy, qui échouerait — là où l'absence
  // d'option est le cas courant et celui qui marche.
  const draft = { ...emptyDraft(), tunnel: emptyTunnel('cloud-sql') }
  const tunnel = draftToRequest(draft).variant.tunnel
  expect(tunnel?.proxy).toMatchObject({ kind: 'cloud-sql', credentialsFilePath: null })
})

test('un port de bastion illisible devient 0 plutôt que NaN', () => {
  // `NaN` ferait échouer `serde` avec une erreur de désérialisation illisible ; `0` laisse
  // le moteur rendre une erreur de connexion claire.
  const draft = {
    ...emptyDraft(),
    tunnel: { localPort: null, proxy: { ...emptyTunnel('ssh').proxy, bastionPort: 'abc' } },
  } as ReturnType<typeof emptyDraft>
  const tunnel = draftToRequest(draft).variant.tunnel
  expect(tunnel?.proxy).toMatchObject({ kind: 'ssh', bastionPort: 0 })
})

test('sans proxy, le tunnel reste null', () => {
  expect(draftToRequest(emptyDraft()).variant.tunnel).toBeNull()
})
```

- [ ] **Étape 2 : lancer les tests pour vérifier qu'ils échouent**

Commande : `pnpm vitest run src/screens/NewConnection/draftToRequest.test.ts`

Attendu : ÉCHEC de typecheck ou d'assertion — la conversion émet encore la forme de `05d`
étape 5, avec `'ssh'` en dur.

- [ ] **Étape 3 : écrire la conversion, une fois**

Créer `src/screens/NewConnection/proxyDraftToProxy.ts` :

```ts
import type { Proxy, Tunnel } from '../../domain/config'
import type { TunnelDraft } from './ConnectionDraft'

/**
 * Convertit le proxy saisi en proxy du modèle.
 *
 * **Un seul fichier pour les deux conversions de `A2`.** `draftToRequest` (test de connexion)
 * et `enregistrerLaBase` (persistance) diffèrent sur le mot de passe et sur ce qu'elles
 * refusent, mais **pas** sur le proxy : la même union, la même traduction. Les dupliquer
 * ferait deux endroits à corriger le jour où une troisième sorte apparaît, et `08e` a déjà
 * montré ce que coûte une conversion écrite deux fois.
 */
export function tunnelDraftToTunnel(draft: TunnelDraft | null): Tunnel | null {
  if (!draft) return null

  return {
    // Toujours `null` : le port local est **choisi par l'app** à l'ouverture, jamais saisi.
    // `06e` se lie au port 0 ; `06g` lit celui que le proxy annonce.
    localPort: null,
    proxy: proxyDraftToProxy(draft),
  }
}

function proxyDraftToProxy(draft: TunnelDraft): Proxy {
  const { proxy } = draft

  switch (proxy.kind) {
    case 'ssh': {
      const port = Number.parseInt(proxy.bastionPort, 10)
      return {
        kind: 'ssh',
        bastionHost: proxy.bastionHost,
        // `NaN` ferait échouer `serde` avec une erreur de désérialisation illisible ; `0`
        // laisse le moteur rendre une erreur de connexion claire.
        bastionPort: Number.isFinite(port) ? port : 0,
        username: proxy.username,
        privateKeyPath: proxy.privateKeyPath,
      }
    }
    case 'cloud-sql':
      return {
        kind: 'cloud-sql',
        instanceConnectionName: proxy.instanceConnectionName,
        // Le vide **est** une valeur : « identifiants par défaut de l'application ». La
        // traduction en `null` se fait ici, une seule fois — envoyer `""` ferait passer
        // `--credentials-file ""` au proxy, qui échouerait.
        credentialsFilePath:
          proxy.credentialsFilePath === '' ? null : proxy.credentialsFilePath,
      }
  }
}
```

**Note pour l'agent :** vérifier la forme exacte que ts-rs a générée pour `Proxy` dans
`src/domain/config.ts` et aligner le type de retour dessus. Ne pas redéclarer les types du
modèle à la main.

- [ ] **Étape 4 : brancher les deux conversions**

Dans `draftToRequest.ts` et `enregistrerLaBase.ts` : remplacer le littéral de tunnel par
`tunnel: tunnelDraftToTunnel(draft.tunnel),` et supprimer la variable `bastionPort` devenue
inutile.

- [ ] **Étape 5 : lancer les tests**

Commande : `pnpm vitest run src/screens/NewConnection/`

Attendu : PASS, tous les fichiers du dossier — y compris `testConnection.test.tsx` et
`enregistrer.test.tsx`, qui ne devraient pas avoir besoin d'être modifiés. Si l'un d'eux
échoue sur la forme du tunnel envoyé, **le mettre à jour** : c'est un changement de contrat
assumé par `05d`.

- [ ] **Étape 6 : vérifier la chaîne complète**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm domain:check
```

Attendu : PASS partout.

- [ ] **Étape 7 : commiter**

```bash
git add src/screens/NewConnection/ src/design/
git commit -m "feat(screens): 08f — le panneau proxy de A2 à deux visages

Le sélecteur « Type » devient un vrai choix. \`TunnelDraft\` suit l'union de
05d, donc lire \`bastionHost\` sur un proxy Cloud SQL ne compile pas — c'est ce
qui remplace la maquette absente comme garde-fou, Cloud SQL n'étant pas dans le
handoff.

Les champs de l'autre sorte sont **absents**, pas masqués : un champ caché en
CSS resterait dans l'arbre d'accessibilité et serait annoncé.

Changer le Type efface les champs de l'autre sorte — perte de saisie visible et
assumée : 08e ne peut pas convertir un brouillon portant un bastion **et** une
instance. Sans proxy déclaré, seule la sorte affichée change : choisir un type
n'est pas déclarer un proxy.

Le vide du champ « Compte de service » est une valeur — identifiants par défaut
de l'application — et le libellé qui le dit est lié par aria-describedby, pas
seulement posé à côté.

La conversion du proxy est écrite **une fois**, partagée par le test de
connexion et l'enregistrement : les deux diffèrent sur le mot de passe, pas sur
le proxy."
```

---

## Tâche 6 : mesurer les 28 px du visage Cloud SQL

**Fichiers :** modifier `e2e/a2-nouvelle-connexion.spec.ts`

- [ ] **Étape 1 : écrire le test**

Le test existant `les champs du panneau font 28 px…` ne couvre que le visage SSH. En ajouter
un pour l'autre, sur le même principe — **par mesure, pas par lecture du CSS** :

```ts
test('les champs du visage Cloud SQL font 28 px aussi', async ({ page }) => {
  await deplierTunnel(page)
  await page.getByLabel('Type').selectOption('cloud-sql')
  await page.waitForSelector('input[placeholder="projet:région:instance"]')

  const mesures = await page.evaluate(() => {
    const panneau = [...document.querySelectorAll('section')].find((s) =>
      s.textContent?.includes('Proxy / tunnel'),
    )
    if (!panneau) return null
    const hauteur = (el: Element | null) =>
      el ? Math.round(el.getBoundingClientRect().height) : null
    return {
      champs: [...panneau.querySelectorAll('input')].map((i) =>
        hauteur(i.parentElement?.className.includes('wrap') ? i.parentElement : i),
      ),
      // L'instance doit occuper les trois colonnes restantes : un nom de connexion long
      // serait illisible sur une colonne `1fr`.
      largeurInstance: Math.round(
        panneau
          .querySelector<HTMLInputElement>('input[placeholder="projet:région:instance"]')
          ?.getBoundingClientRect().width ?? 0,
      ),
      largeurType: Math.round(
        panneau.querySelector('select')?.getBoundingClientRect().width ?? 0,
      ),
    }
  })

  // 28 px de contenu plus les 2 px de bordure, comme le visage SSH. Le mockup ne montre pas
  // ce visage ; l'aligner sur l'autre est la seule cohérence disponible.
  expect(new Set(mesures?.champs)).toHaveProperty('size', 1)
  expect(mesures?.champs[0]).toBe(30)
  // Nettement plus large que « Type », sans coder une valeur exacte qui dépendrait de la
  // largeur de la modale.
  expect(mesures?.largeurInstance).toBeGreaterThan((mesures?.largeurType ?? 0) * 2)
})
```

- [ ] **Étape 2 : lancer le test**

Commande : `pnpm test:e2e -- --grep "Cloud SQL font 28"`

Attendu : PASS. En cas d'échec sur la largeur, vérifier que `.tunnelInstance` s'applique bien
— `Field` transmet `className` à l'`<input>` **sans suffixe**, et à l'enveloppe **avec**. Le
champ Instance n'a pas de suffixe, donc la règle porte sur l'`<input>` ; c'est
`grid-column` sur l'élément de grille qui compte, donc vérifier lequel des deux est l'enfant
direct de `.tunnelGrid`. Si c'est le `<div class="root">` de `Field`, poser la règle dessus
plutôt qu'à travers `className`.

- [ ] **Étape 3 : lancer toute la suite e2e**

Commande : `pnpm test:e2e`

Attendu : PASS. Les captures de référence du visage SSH ne doivent **pas** avoir bougé — si
elles ont bougé, le panneau SSH a changé d'aspect, ce que `08k` interdit explicitement.

- [ ] **Étape 4 : commiter**

```bash
git add e2e/
git commit -m "test(e2e): 08f — les 28 px et la largeur de l'instance, mesurés

Par mesure et non par lecture du CSS, comme 08c l'exige pour le visage SSH.

La largeur de l'instance est comparée à celle de « Type » plutôt que fixée en
pixels : une valeur exacte dépendrait de la largeur de la modale.

Les captures de référence du visage SSH ne bougent pas — 08f l'interdit."
```

---

## Tâche 7 : observer dans l'app réelle

**Fichiers :** aucun — vérification seule

Deux critères ne se vérifient pas sous Vitest ni sous Playwright : le plugin `dialog` ne
répond que dans la webview de Tauri.

- [ ] **Étape 1 : lancer l'app**

Commande : `pnpm tauri dev`

- [ ] **Étape 2 : observer les deux sélecteurs**

Ouvrir `⌘N`, déplier « Proxy / tunnel », et pour chacune des deux sortes : cliquer
« Parcourir… », choisir un fichier, vérifier que le chemin arrive dans le champ. Vérifier
aussi qu'une **annulation** laisse le champ inchangé.

- [ ] **Étape 3 : consigner ce qui a été observé**

Dans `REPRISE.md` § 3, et dans la ligne d'état de `08k` de `specs/README.md`. Si l'observation
n'a pas pu être faite, l'écrire comme telle — `08c` porte déjà la mention « sélecteur de
fichier non observé », et une seconde mention honnête vaut mieux qu'une affirmation.

- [ ] **Étape 4 : commiter**

```bash
git add specs/README.md REPRISE.md
git commit -m "docs: 08f fait — état et ce qui reste non observé"
```

---

## Terminé quand

Les onze critères de `specs/08k-a2-panneau-cloud-sql.md` § « Terminé quand » sont vérifiés.
Deux demandent l'app réelle (tâche 7) et peuvent rester non observés, à condition d'être
consignés comme tels. Un se lit dans le diff plutôt que dans un test : que le test des
permissions de `08c` n'ait **pas** été modifié.
