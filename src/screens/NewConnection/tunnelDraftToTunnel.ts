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
      return {
        kind: 'cloud-sql',
        instanceConnectionName: proxy.instanceConnectionName,
        // Le vide **est** une valeur : « identifiants par défaut de l'application ». La
        // traduction en `null` se fait ici, une seule fois — envoyer `""` ferait passer
        // `--credentials-file ""` au proxy, qui échouerait, là où l'absence d'option est le cas
        // courant et celui qui marche (`06f`).
        credentialsFilePath: proxy.credentialsFilePath === '' ? null : proxy.credentialsFilePath,
      }
  }
}
