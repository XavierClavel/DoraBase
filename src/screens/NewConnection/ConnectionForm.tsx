import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { Environment, SslMode } from '../../domain/config'
import { Badge } from '../../ui/Badge/Badge'
import { cx } from '../../ui/cx'
import { Field } from '../../ui/Field/Field'
import { RadioGroup } from '../../ui/RadioGroup/RadioGroup'
import { Select } from '../../ui/Select/Select'
import { Toggle } from '../../ui/Toggle/Toggle'
import type { ConnectionDraft } from './ConnectionDraft'
import { ENVIRONMENT_ORDER, ENVIRONMENTS, SSL_MODE_ORDER, SSL_MODES } from './environments'
import styles from './NewConnection.module.css'

type ConnectionFormProps = {
  draft: ConnectionDraft
  onChange: (patch: Partial<ConnectionDraft>) => void
  /** Les projets existants. Vide, `08e` désactivera l'enregistrement. */
  projects: readonly { id: string; name: string }[]
}

const OPTIONS_SSL = SSL_MODE_ORDER.map((mode) => ({ value: mode, label: SSL_MODES[mode].label }))

const OPTIONS_ENV = ENVIRONMENT_ORDER.map((environment) => ({
  value: environment,
  label: ENVIRONMENTS[environment].label,
  // L'icône warning de `prod` : décorative, `RadioGroup` la masque à l'accessibilité
  // puisqu'elle redouble un mot déjà écrit.
  prefix: ENVIRONMENTS[environment].danger ? (
    <Icon name="warn" size={13} strokeWidth={2} />
  ) : undefined,
  className: cx(styles.envOption, ENVIRONMENTS[environment].danger && styles.envDanger),
}))

/**
 * Un interrupteur suivi de son libellé **visible**.
 *
 * `Toggle` ne rend que la piste et le bouton glissant, son `label` servant de nom accessible :
 * les dix écrans du handoff l'emploient tantôt seul (barre d'état), tantôt accompagné d'un
 * texte. `A2` l'accompagne, donc le texte est posé ici.
 *
 * Le libellé de la bascule **éteinte** est en encre secondaire dans le mockup, celui de la
 * bascule allumée en encre pleine. Relevé sur les deux instances de `A2`, et non déduit.
 *
 * Le `<span>` n'est pas un `<label>` : le nom accessible vient déjà d'`aria-label`, et un
 * `<label for>` sur un `<button role="switch">` le doublerait dans l'annonce.
 */
function ToggleWithLabel({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return (
    <span className={styles.toggleRow}>
      <Toggle checked={checked} onCheckedChange={onCheckedChange} label={label} />
      <span className={cx(styles.toggleLabel, !checked && styles.toggleLabelOff)}>{label}</span>
    </span>
  )
}

/**
 * Le formulaire principal de `A2`.
 *
 * La structure est une **grille**, pas une pile de rangées flex : le mockup impose deux
 * colonnes `1fr 1fr` avec des rangées pleine largeur et des sous-grilles. Reproduire cela en
 * flex imbriqué donnerait des colonnes qui ne s'alignent pas d'une rangée à l'autre — écart
 * que Vitest ne peut pas voir, d'où les mesures dans `e2e/`.
 */
export function ConnectionForm({ draft, onChange, projects }: ConnectionFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  const optionsProjets =
    projects.length > 0
      ? projects.map((p) => ({ value: p.id, label: p.name }))
      : // Aucun projet : `A2` n'en maquette pas le cas, et `08e` décidera du refus. Ici on
        // le **dit** plutôt que d'afficher une liste vide, qui ressemblerait à un bug.
        [{ value: '', label: 'Aucun projet — créez-en un d’abord' }]

  return (
    <div className={styles.form}>
      {/* Rangée pleine largeur : `1fr 196px auto`, alignée en bas — les étiquettes n'ont pas
          toutes la même hauteur, et sans `align-items: end` les champs se décaleraient. */}
      <div className={styles.rowIdentity}>
        <Field
          label="Nom de la base"
          className={styles.nameField}
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <Select
          label="Projet"
          icon={{ name: 'bag', color: 'var(--accent-deep)' }}
          options={optionsProjets}
          value={draft.project}
          onValueChange={(project) => onChange({ project })}
        />
        <div>
          <div className={styles.label}>Variante d’environnement</div>
          <RadioGroup
            label="Variante d’environnement"
            options={OPTIONS_ENV}
            value={draft.environment}
            onValueChange={(environment) => onChange({ environment: environment as Environment })}
          />
        </div>
      </div>

      {/* Le port est **collé** à l'hôte : sous-grille `1fr 84px` avec un gap de 8px, contre
          les 18px de la grille principale. */}
      <div className={styles.rowHost}>
        <Field
          label="Hôte"
          mono
          value={draft.host}
          onChange={(event) => onChange({ host: event.target.value })}
        />
        <Field
          label="Port"
          mono
          inputMode="numeric"
          value={draft.port}
          onChange={(event) => onChange({ port: event.target.value })}
        />
      </div>

      <Field
        label="Base par défaut"
        mono
        value={draft.defaultDatabase}
        onChange={(event) => onChange({ defaultDatabase: event.target.value })}
      />

      <Field
        label="Utilisateur"
        mono
        value={draft.username}
        onChange={(event) => onChange({ username: event.target.value })}
      />

      <Field
        label="Mot de passe"
        mono
        type={passwordVisible ? 'text' : 'password'}
        className={styles.passwordField}
        value={draft.password}
        onChange={(event) => onChange({ password: event.target.value })}
        suffix={
          <>
            <button
              type="button"
              className={styles.eye}
              onClick={() => setPasswordVisible((visible) => !visible)}
              aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={passwordVisible}
            >
              <Icon name="eye" size={14} strokeWidth={1.8} />
            </button>
            {/* Le badge annonce **où** le secret sera rangé. `05c` choisit le mécanisme selon
                la signature du binaire : en développement c'est un fichier chiffré, pas le
                Trousseau. Le libellé exact viendra de `08e`, qui interrogera le magasin —
                ici il reflète le cas signé, comme le mockup. */}
            <Badge tone="success" icon={<Icon name="lock" size={12} strokeWidth={2} />}>
              Trousseau
            </Badge>
          </>
        }
      />

      {/* Rangée pleine largeur : mode SSL à gauche, les deux bascules à droite, alignées en
          bas avec un décalage de 5px pour tomber sur la ligne de base des champs. */}
      <div className={styles.rowSsl}>
        <Select
          label="Mode SSL"
          options={OPTIONS_SSL}
          value={draft.sslMode}
          onValueChange={(sslMode) => onChange({ sslMode: sslMode as SslMode })}
        />
        <div className={styles.toggles}>
          <ToggleWithLabel
            checked={draft.readOnly}
            onCheckedChange={(readOnly) => onChange({ readOnly })}
            label="Ouvrir en lecture seule"
          />
          <ToggleWithLabel
            checked={draft.reconnectOnStartup}
            onCheckedChange={(reconnectOnStartup) => onChange({ reconnectOnStartup })}
            label="Se reconnecter au démarrage"
          />
        </div>
      </div>
    </div>
  )
}
