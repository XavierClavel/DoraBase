import { useId } from 'react'
import { useT } from '../../i18n/LanguageContext'
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
}: TunnelPanelProps) {
  const t = useT()
  const aideId = useId()

  // Le proxy affiché : celui du tunnel s'il existe **et** s'il est de la sorte choisie, un proxy
  // vide sinon. Le second cas couvre le panneau sans tunnel, où les champs sont là mais vides.
  const proxy: ProxyDraft = tunnel && tunnel.proxy.kind === kind ? tunnel.proxy : emptyProxy(kind)

  /**
   * Les deux sortes de proxy : `05d` les modélise, `06g` ouvre la seconde.
   *
   * Cloud SQL **n'est pas dans le handoff** : ce libellé, comme le champ de son visage, est
   * inventé ici : Cloud SQL n'était pas maquetté, et attend un passage de design.
   */
  const types = [
    { value: 'ssh', label: t('newConnection.tunnel.types.ssh') },
    { value: 'cloud-sql', label: t('newConnection.tunnel.types.cloudSql') },
  ] as const

  /** Ce que le badge annonce pour chaque sorte. */
  const badges: Record<ProxyKind, string> = {
    ssh: t('newConnection.tunnel.badges.ssh'),
    'cloud-sql': t('newConnection.tunnel.badges.cloudSql'),
  }

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
        title={t('newConnection.tunnel.panelTitle')}
        icon="shield"
        badge={tunnel ? <Badge tone="violet">{badges[tunnel.proxy.kind]}</Badge> : undefined}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className={styles.tunnelGrid}>
          <Select
            label={t('newConnection.tunnel.typeLabel')}
            size="sm"
            options={types}
            value={kind}
            onValueChange={onKindChange}
          />

          {proxy.kind === 'ssh' ? (
            <>
              <Field
                label={t('newConnection.tunnel.bastionHostLabel')}
                size="sm"
                mono
                value={proxy.bastionHost}
                onChange={(event) => onProxyChange({ ...proxy, bastionHost: event.target.value })}
              />
              <Field
                label={t('newConnection.tunnel.portLabel')}
                size="sm"
                mono
                inputMode="numeric"
                value={proxy.bastionPort}
                onChange={(event) => onProxyChange({ ...proxy, bastionPort: event.target.value })}
              />
              <Field
                label={t('newConnection.tunnel.usernameLabel')}
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
              label={t('newConnection.tunnel.instanceLabel')}
              size="sm"
              mono
              className={styles.tunnelInstance}
              placeholder={t('newConnection.tunnel.instancePlaceholder')}
              value={proxy.instanceConnectionName}
              onChange={(event) =>
                onProxyChange({ ...proxy, instanceConnectionName: event.target.value })
              }
            />
          )}

          <div className={styles.tunnelKeyRow}>
            {proxy.kind === 'ssh' ? (
              <Field
                label={t('newConnection.tunnel.privateKeyLabel')}
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
                    {t('newConnection.tunnel.browse')}
                  </button>
                }
              />
            ) : (
              // **Aucun champ dans cette ligne.** Un « Compte de service » s'y saisissait
              // (`06j`), puis une bascule « Authentification IAM » (`06k`) : les deux sont
              // partis, l'un parce que l'authentification est celle de la machine et non de la
              // connexion, l'autre parce que le mode est désormais **toujours** actif. Il reste
              // une phrase, et rien à remplir.
              //
              // **Un paragraphe simple, plus lié par `aria-describedby`.** Le lien existait
              // pour empêcher qu'un champ vide se lise comme un champ oublié ; sans champ,
              // cette raison tombe, et un texte informatif dans le flux est annoncé à sa place.
              //
              // Les deux phrases sont là parce qu'elles répondent à deux questions
              // différentes, et qu'aucune ne se devine : **avec quoi** l'application
              // s'authentifie — la commande `gcloud` entière, jamais « authentifiez-vous avec
              // gcloud », qui enverrait sur `gcloud auth login` (`06i`) — et **ce que
              // l'utilisateur doit saisir**, à savoir une adresse et pas un rôle, sans mot de
              // passe. Sans la seconde, une connexion IAM se remplit comme une autre et
              // n'apprend qu'à l'échec, sur « IAM user authentication failed ».
              <p id={aideId} className={styles.tunnelHint}>
                {t('newConnection.tunnel.cloudSqlAuthPrefix')}{' '}
                <code>gcloud auth application-default login</code>
                {t('newConnection.tunnel.cloudSqlAuthSuffix')}
              </p>
            )}
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  )
}
