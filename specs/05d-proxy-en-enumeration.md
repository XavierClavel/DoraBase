# 05d — Le proxy en énumération à données

## Objectif

Faire que `Tunnel` puisse décrire **deux sortes de proxy** — un bastion SSH et le proxy
d'authentification Cloud SQL — sans qu'aucune des deux porte les champs de l'autre. C'est
la dépendance commune de `06g` (le moteur) et `08k` (l'écran).

## Dépend de

`05a` (le type `Tunnel` actuel), `05b` (le mécanisme de version et de migration du
fichier de configuration).

## Périmètre

- `Tunnel` scindé en une partie commune (le port local) et une énumération `Proxy` à
  deux membres, chacun portant exactement ses champs.
- `TunnelKind` disparaît plutôt que de gagner un second membre : ni lui ni `Proxy::kind()`
  n'ont d'appelant, dans `src-tauri/` comme dans `src/` — `Proxy` étant étiquetée en
  interne, le discriminant se lit déjà par un `match` en Rust et par `proxy.kind` en
  TypeScript, sans qu'un type dédié le porte. Renommer un type mort l'aurait gardé mort ;
  `08k` dérivera sa propre sorte de `ProxyDraft['kind']` s'il en a besoin, avec un
  appelant.
- La **première migration réelle** du fichier de configuration : version 1 → 2.
- La projection TypeScript, qui devient une union discriminée.

## Hors périmètre

- **Lancer le proxy Cloud SQL, le surveiller, le brancher sur la connexion** → `06g`.
  Ce scope produit des types, une migration et des fonctions pures.
- **Le panneau de `A2`** → `08k`. Le champ « Type » n'a toujours qu'une option tant que
  ce scope-là n'est pas fait, et c'est cohérent : le modèle sait décrire un proxy Cloud
  SQL avant que l'écran sache le saisir.
- **Les options avancées de Cloud SQL** — IP privée, authentification IAM automatique,
  usurpation de compte de service, Private Service Connect. Voir `06g` § Hors périmètre,
  qui porte la décision : les ajouter au modèle sans que rien ne les emploie créerait des
  champs morts.
- **Le chemin du binaire `cloud-sql-proxy`.** Ce n'est pas de la configuration de
  connexion mais un réglage de machine : il n'a pas à être enregistré par base, et il
  n'a pas à voyager si le fichier de configuration est partagé. `06g` le cherche.

## Approche

### Ce que le handoff ne dit pas, et qu'il faut assumer

Cloud SQL **n'apparaît nulle part** dans le bundle de handoff : `A2` ne montre qu'un
sélecteur « Type » à une seule valeur, `SSH`. Ce scope ne comble donc pas un trou du
design, il répond à une demande fonctionnelle explicite. Conséquence à assumer :

- la forme du modèle est décidée ici, sans maquette à confronter ;
- `08k` devra inventer deux champs, et le dira ;
- à remonter au design, comme `06e` a remonté l'écran de confiance de clé d'hôte.

### La forme retenue

```rust
pub struct Tunnel {
    /// `None` signifie « auto » — commun aux deux sortes, choisi à l'ouverture par `06`.
    pub local_port: Option<u16>,
    pub proxy: Proxy,
}

#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Proxy {
    Ssh { bastion_host: String, bastion_port: u16, username: String, private_key_path: String },
    CloudSql { instance_connection_name: String, credentials_file_path: Option<String> },
}
```

Le port local sort de l'énumération parce qu'il est vrai des deux, et qu'un champ
dupliqué dans chaque membre obligerait chaque lecteur à faire un `match` pour lire une
donnée qui ne varie pas.

`credentials_file_path: None` signifie **« identifiants par défaut de l'application »** —
le cas courant, quand l'utilisateur s'est authentifié par `gcloud auth
application-default login`. Ce n'est pas un trou dans la configuration, et le nommer
ainsi évite qu'un lecteur du code le prenne pour un champ oublié.

### Pourquoi une énumération et pas des champs optionnels

Un `Tunnel` plat portant les champs des deux sortes autoriserait
`kind: "cloud-sql"` avec un `bastion_host` renseigné et aucune instance. `05a` pose que
les invariants sont portés **par le typage plutôt qu'en commentaire** ; c'en est un.

Le coût est réel et se paie deux fois : la forme sur disque change, et le code qui lisait
`tunnel.bastion_host` doit désormais prouver qu'il est en SSH. Ce coût est le bienvenu —
c'est exactement le `match tunnel.kind` de `06e`, aujourd'hui décoratif, qui devient un
aiguillage vérifié par le compilateur.

### La première migration réelle du magasin

`05b` a livré le **mécanisme** de migration — numéro de version en tête, migration en
chaîne, copie de sauvegarde avant d'écrire, refus d'une version postérieure — et l'a
exercé avec une version factice, faute de vraie migration à écrire. Ce scope lui en donne
une : `VERSION_COURANTE` passe à 2, et la migration 1 → 2 enveloppe l'ancien objet plat
dans `{ "kind": "ssh", … }` en déplaçant `localPort` d'un niveau.

C'est une bonne première migration : purement structurelle, sans perte possible, et
réversible à la main si elle se trompe. Le mécanisme se vérifie donc sur du réel avant
qu'une migration à enjeu ne s'y présente.

Un fichier en version 1 **sans** tunnel migre aussi — le champ est `null`, la migration
n'a rien à faire, et ne rien faire doit être un chemin couvert, pas un cas oublié.

### La projection TypeScript devient une union discriminée

`ts-rs` ne rend **pas** l'union d'objets littéraux qu'on pourrait attendre, mais une union
d'intersections :

```ts
export type Proxy = { "kind": "ssh" } & ProxySsh | { "kind": "cloud-sql" } & ProxyCloudSql;
```

Le rétrécissement sur `kind` fonctionne malgré tout à travers l'intersection, et le
groupage est correct (`&` lie plus fort que `|`) — **vérifié au compilateur** : une sonde
temporaire lisait `proxy.bastionHost` après `if (proxy.kind === 'ssh')`, puis tentait un
accès croisé `proxy.instanceConnectionName` dans la même branche ; `tsc` refuse le second
avec `TS2339: Property 'instanceConnectionName' does not exist on type '{ kind: "ssh"; } &
ProxySsh'`. Lire `tunnel.proxy.bastionHost` sans avoir rétréci sur `kind` ne compile pas.
C'est le but : `08k` a besoin que le compilateur refuse un panneau qui lit le champ de
l'autre sorte, parce qu'aucune maquette ne viendra le rattraper.

## Terminé quand

- Un `Proxy::CloudSql` portant un `bastion_host` **ne compile pas**, et un
  `Proxy::Ssh` portant une instance non plus.
- Un `match` non exhaustif sur `Proxy` fait échouer la compilation — vérifié en retirant
  délibérément un bras. Pas de `TunnelKind` : voir § Périmètre.
- Un fichier de configuration en version 1 portant un tunnel SSH se lit après migration,
  avec les quatre champs à leur place, et une copie de sauvegarde de l'original existe.
- Un fichier en version 1 **sans** tunnel migre aussi, couvert par son propre test.
- La migration est **testée sur des octets**, pas sur une structure Rust : un JSON de
  version 1 écrit littéralement dans le test, pour que la sérialisation d'aujourd'hui ne
  puisse pas masquer une divergence avec ce que l'ancienne version écrivait.
- La projection TypeScript est régénérée, l'union est discriminée, et le `check` de CI
  échoue si elle a dérivé — vérifié en introduisant la divergence.
- Aucun secret dans le modèle : le chemin du fichier de compte de service est un chemin,
  comme la clé privée SSH l'est déjà (`05c` § Hors périmètre).
