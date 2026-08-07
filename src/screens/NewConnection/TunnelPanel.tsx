import { Badge } from '../../ui/Badge/Badge'
import { CollapsiblePanel } from '../../ui/CollapsiblePanel/CollapsiblePanel'
import { Field } from '../../ui/Field/Field'
import { Select } from '../../ui/Select/Select'
import type { TunnelDraft } from './ConnectionDraft'
import styles from './NewConnection.module.css'

type TunnelPanelProps = {
  /** `null` quand la connexion ne passe par aucun bastion. */
  tunnel: TunnelDraft | null
  onChange: (patch: Partial<TunnelDraft>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Ouvre le sélecteur de fichier et rend le chemin choisi, ou `null` si l'utilisateur
   * annule.
   *
   * **Injecté plutôt qu'appelé directement.** Le plugin `dialog` de Tauri ne répond pas hors
   * de la webview : sous Vitest, `open()` rejette. Passer l'ouverture en paramètre rend le
   * câblage du bouton testable, et laisse l'appel réel au seul endroit qui tourne dans l'app.
   */
  onBrowse: () => Promise<string | null>
}

/** Le seul type de proxy que `05a` modélise et que le mockup montre. */
const TYPES = [{ value: 'ssh', label: 'SSH' }] as const

/**
 * Le bloc « Proxy / tunnel » de `A2`.
 *
 * Le panneau existe toujours ; c'est la **présence d'un tunnel** qui change. Sans tunnel, les
 * champs sont là mais vides et le badge « SSH activé » est absent — le mockup ne montre pas
 * cet état, et c'est la seule lecture cohérente : masquer le panneau entier ferait disparaître
 * une fonction du formulaire.
 *
 * Toucher un champ crée le tunnel s'il n'existe pas : l'utilisateur qui saisit un bastion
 * déclare par là qu'il en veut un, et lui demander de cocher une case en plus serait une étape
 * que le handoff ne maquette pas.
 */
export function TunnelPanel({ tunnel, onChange, open, onOpenChange, onBrowse }: TunnelPanelProps) {
  const valeurs = tunnel ?? {
    bastionHost: '',
    bastionPort: '22',
    username: '',
    privateKeyPath: '',
    localPort: null,
  }

  async function parcourir() {
    const chemin = await onBrowse()
    // `null` = l'utilisateur a annulé. Écraser le chemin déjà saisi serait une perte.
    if (chemin !== null) onChange({ privateKeyPath: chemin })
  }

  return (
    <div className={styles.tunnelBlock}>
      <CollapsiblePanel
        title="Proxy / tunnel"
        icon="shield"
        badge={tunnel ? <Badge tone="violet">SSH activé</Badge> : undefined}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className={styles.tunnelGrid}>
          <Select
            label="Type"
            size="sm"
            options={TYPES}
            value="ssh"
            onValueChange={() => {
              // Un seul type : rien à changer. `05a` le modélise en énumération d'un membre,
              // extensible sans refonte.
            }}
          />
          <Field
            label="Hôte du bastion"
            size="sm"
            mono
            value={valeurs.bastionHost}
            onChange={(event) => onChange({ bastionHost: event.target.value })}
          />
          <Field
            label="Port"
            size="sm"
            mono
            inputMode="numeric"
            value={valeurs.bastionPort}
            onChange={(event) => onChange({ bastionPort: event.target.value })}
          />
          <Field
            label="Utilisateur"
            size="sm"
            mono
            value={valeurs.username}
            onChange={(event) => onChange({ username: event.target.value })}
          />

          <div className={styles.tunnelKeyRow}>
            <Field
              label="Clé privée"
              size="sm"
              mono
              value={valeurs.privateKeyPath}
              onChange={(event) => onChange({ privateKeyPath: event.target.value })}
              suffix={
                <button type="button" className={styles.browse} onClick={parcourir}>
                  Parcourir…
                </button>
              }
            />
            <div>
              {/* **Un `<output>`, et pas un `<input disabled>` ni un `<div>`.**
                  `<output>` désigne « le résultat d'un calcul de l'application » : c'est
                  exactement ce port, choisi par `SshTunnel::port_local` à l'ouverture du
                  tunnel (`06e`), jamais saisi.
                  Une première version employait un `<div aria-label>` — que Biome a refusé, à
                  juste titre : `aria-label` sur un élément sans rôle est **ignoré**, donc un
                  lecteur d'écran n'aurait rien annoncé. `<output>` est *labelable*, donc un
                  vrai `<label for>` le nomme, et il n'est éditable ni focalisable par nature —
                  ce qui est plus solide qu'un `aria-disabled` qui l'affirme. */}
              <label className={styles.label} htmlFor="tunnel-local-port">
                Port local mappé
              </label>
              <output id="tunnel-local-port" className={styles.localPort}>
                {valeurs.localPort === null ? 'auto' : `auto (${valeurs.localPort})`}
              </output>
            </div>
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
