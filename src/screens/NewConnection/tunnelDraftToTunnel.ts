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
        autoIamAuthn: proxy.autoIamAuthn,
      }
  }
}
