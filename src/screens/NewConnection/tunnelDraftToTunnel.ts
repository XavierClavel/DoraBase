// `Proxy` est aliasé : le nom masquerait le `Proxy` global de JavaScript, ce que Biome refuse
// (`noShadowRestrictedNames`). Conséquence du nom choisi côté Rust en `05d` ; l'alias coûte une
// ligne, renommer le type coûterait une migration de la projection et du modèle.
import type { Proxy as ProxyModele, Tunnel } from '../../domain/config'
import type { TunnelDraft } from './ConnectionDraft'

/**
 * Convertit le proxy saisi en proxy du modèle.
 *
 * **Un seul fichier pour les deux conversions de `A2`.** `draftToRequest` (test de connexion) et
 * `enregistrerLaBase` (persistance) diffèrent sur le mot de passe et sur ce qu'elles refusent,
 * mais **pas** sur le proxy : la même union, la même traduction. Les dupliquer ferait deux
 * endroits à corriger le jour où une troisième sorte apparaît — et `08e` avait déjà montré ce
 * que coûte une conversion écrite deux fois.
 */
export function tunnelDraftToTunnel(draft: TunnelDraft | null): Tunnel | null {
  if (!draft) return null

  return {
    // Toujours `null` : le port local est **choisi par l'app** à l'ouverture, jamais saisi.
    // `06e` se lie au port 0 ; `06f` lit celui que le proxy annonce.
    localPort: null,
    proxy: proxyDraftToProxy(draft.proxy),
  }
}

function proxyDraftToProxy(proxy: TunnelDraft['proxy']): ProxyModele {
  switch (proxy.kind) {
    case 'ssh': {
      const port = Number.parseInt(proxy.bastionPort, 10)
      return {
        kind: 'ssh',
        bastionHost: proxy.bastionHost,
        // `NaN` ferait échouer `serde` avec une erreur de désérialisation illisible ; `0` laisse
        // le moteur rendre une erreur de connexion claire.
        bastionPort: Number.isFinite(port) ? port : 0,
        username: proxy.username,
        privateKeyPath: proxy.privateKeyPath,
      }
    }
    case 'cloud-sql':
      // **Rien à traduire** (`06j`) : le brouillon et le modèle portent le même unique champ.
      // Un `credentialsFilePath` vivait ici et demandait de traduire `''` en `null` ; il est
      // parti avec le champ de `A2`.
      return {
        kind: 'cloud-sql',
        instanceConnectionName: proxy.instanceConnectionName,
      }
    case 'kubernetes':
      return {
        kind: 'kubernetes',
        // **Le vide devient `null`, et les deux champs optionnels y tiennent leur sens.** Vide veut
        // dire « celui que kubectl choisirait » — son kubeconfig, l'espace de noms du contexte ou
        // `default` —, et une chaîne vide persistée se lirait comme un nom :
        // `--namespace ''` ferait chercher dans un espace de noms qui n'existe pas, et
        // `--kubeconfig ''` dans un fichier qui n'existe pas. Le Rust refuse aussi une valeur
        // blanche (`valeur_utile`), parce qu'un fichier écrit à la main ne passe pas par ici.
        //
        // Le chemin est **rogné mais pas développé** : le `~/` est l'affaire du Rust, qui seul
        // connaît le `HOME` du processus qui lancera `kubectl`.
        kubeconfig: absentSiVide(proxy.kubeconfig),
        namespace: absentSiVide(proxy.namespace),
        // Rognée mais **jamais réécrite** : un espace de tête vient d'un copier-coller, un `svc/`
        // ajouté d'office viserait un service là où l'utilisateur nommait un pod.
        resource: proxy.resource.trim(),
      }
  }
}

/**
 * Le vide de l'écran devient l'absence du modèle.
 *
 * La convention de `draftToRequest` pour le certificat d'autorité et la base d'authentification,
 * appliquée ici aux deux champs optionnels du transfert Kubernetes. Nommée plutôt que recopiée
 * deux fois : `08e` avait déjà montré ce que coûte une conversion écrite deux fois.
 */
function absentSiVide(saisie: string): string | null {
  const rognee = saisie.trim()
  return rognee === '' ? null : rognee
}
