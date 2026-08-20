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
   * **Pourquoi pas un patch.** Un `Partial<ProxyDraft>` sur une union autorise un objet mêlant
   * les champs des deux sortes, ce que le type est précisément là pour interdire. Le panneau
   * connaît le proxy courant, donc il peut composer le suivant — et le composer est le seul
   * moyen de garder l'union honnête.
   */
  onProxyChange: (proxy: ProxyDraft) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Ouvre le sélecteur de la clé privée SSH, et rend le chemin choisi, ou `null` si
   * l'utilisateur annule.
   *
   * **Injecté plutôt qu'appelé directement.** Le plugin `dialog` de Tauri ne répond pas hors de
   * la webview : sous Vitest, `open()` rejette. Passer l'ouverture en paramètre rend le câblage
   * du bouton testable, et laisse l'appel réel au seul endroit qui tourne dans l'app.
   */
  onBrowseKey: () => Promise<string | null>
  /** La même chose pour le fichier de compte de service Google. */
  onBrowseCredentials: () => Promise<string | null>
}

/**
 * Les deux sortes de proxy : `05d` les modélise, `06g` ouvre la seconde.
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
 * champs sont là mais vides et le badge est absent — le mockup ne montre pas cet état, et c'est
 * la seule lecture cohérente : masquer le panneau entier ferait disparaître une fonction du
 * formulaire.
 *
 * Toucher un champ crée le proxy s'il n'existe pas (voir `NewConnection`) : l'utilisateur qui
 * saisit un bastion déclare par là qu'il en veut un. **Changer le Type, en revanche, ne crée
 * rien** : choisir une sorte n'est pas déclarer un proxy, et faire apparaître « Cloud SQL
 * activé » sur une instance vide serait une fausse déclaration — que `06b` refuserait ensuite,
 * puisqu'il rejette une variante déclarant un proxy qu'on n'a pas ouvert.
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

  // Le proxy affiché : celui du tunnel s'il existe **et** s'il est de la sorte choisie, un proxy
  // vide sinon. Le second cas couvre le panneau sans tunnel, où les champs sont là mais vides.
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
                {/* **Lié au champ par `aria-describedby`**, et non simplement posé à côté : un
                    texte voisin n'est pas annoncé par un lecteur d'écran, et c'est précisément
                    l'information qui empêche de lire ce champ vide comme un champ oublié. */}
                <p id={aideId} className={styles.tunnelHint}>
                  Vide : identifiants par défaut de l'application
                </p>
              </div>
            )}

            <div>
              {/* **Un `<output>`, et pas un `<input disabled>` ni un `<div>`.**
                  `<output>` désigne « le résultat d'un calcul de l'application » : c'est
                  exactement ce port, choisi à l'ouverture du proxy (`06e`, `06g`), jamais saisi.
                  Une première version employait un `<div aria-label>` — que Biome a refusé, à
                  juste titre : `aria-label` sur un élément sans rôle est **ignoré**, donc un
                  lecteur d'écran n'aurait rien annoncé. `<output>` est *labelable*, donc un vrai
                  `<label for>` le nomme, et il n'est éditable ni focalisable par nature — ce qui
                  est plus solide qu'un `aria-disabled` qui l'affirme. */}
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
