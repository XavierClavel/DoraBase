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
import { estUnFichier } from './engines'
import {
  authentifie,
  ENVIRONMENT_ORDER,
  ENVIRONMENTS,
  SSL_MODE_ORDER,
  SSL_MODES,
} from './environments'
import styles from './NewConnection.module.css'

/**
 * La valeur sentinelle du `Select` qui demande la création d'un projet.
 *
 * Une sentinelle et non un booléen à part : le `Select` a **une** valeur, et un état parallèle
 * (« projet choisi » + « ou bien nouveau ») divergerait — c'est exactement le piège du select
 * contrôlé que `08e` a déjà payé une fois. Le préfixe la rend impossible à confondre avec un nom
 * de projet, que `05a` n'autorise pas à commencer par un caractère de contrôle.
 */
export const NOUVEAU_PROJET = '\u0000nouveau'

/** Pourquoi les trois champs d'identité sont verrouillés en édition. Dit, jamais deviné. */
const RAISON_VERROU =
  'Ces trois champs identifient la base : les changer déplacerait son mot de passe et fermerait sa connexion. Supprimez et redéclarez la base pour la renommer.'

type ConnectionFormProps = {
  draft: ConnectionDraft
  onChange: (patch: Partial<ConnectionDraft>) => void
  /** Les projets existants. Vide, `08e` désactivera l'enregistrement. */
  projects: readonly { id: string; name: string }[]
  /**
   * Verrouille les champs qui **désignent** la base : son nom, son projet, son environnement.
   *
   * Le triplet `projet/base/environnement` est la clé du registre (`09b`) et la référence du secret
   * (`08e`) : en changer un élément demanderait de déplacer le secret et de fermer la connexion
   * ouverte. Voir `08g`.
   */
  verrouille?: boolean
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
export function ConnectionForm({
  draft,
  onChange,
  projects,
  verrouille = false,
}: ConnectionFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  // **Un moteur de fichier n'a pas de serveur** (`17a`) : cinq champs du formulaire ne veulent rien
  // dire pour lui, et les afficher laisserait croire qu'ils comptent.
  const fichier = estUnFichier(draft.engine)

  // **« + Nouveau projet… » est une option du `Select`, pas un second écran** (`08f`) : personne
  // ne crée un projet vide, donc le déclarer et y mettre sa première base est un seul geste.
  // Avant, l'application neuve était une impasse — `08e` refusait l'enregistrement faute de
  // projet, et rien ne permettait d'en faire un.
  const optionsProjets = [
    ...projects.map((p) => ({ value: p.id, label: p.name })),
    { value: NOUVEAU_PROJET, label: '+ Nouveau projet…' },
  ]
  const creeUnProjet = draft.project === NOUVEAU_PROJET

  return (
    <div className={styles.form}>
      {/* Rangée pleine largeur : `1fr 196px auto`, alignée en bas — les étiquettes n'ont pas
          toutes la même hauteur, et sans `align-items: end` les champs se décaleraient. */}
      <div className={styles.rowIdentity}>
        {/* **Verrouillé en édition, et la raison est dite.** Un champ désactivé sans explication
            fait croire à un bug — la leçon de `09f`. Le `title` porte l'explication : `Field` n'a
            pas d'infobulle, et lui en ajouter une pour trois champs serait disproportionné. */}
        <Field
          label="Nom de la base"
          className={styles.nameField}
          value={draft.name}
          disabled={verrouille}
          title={verrouille ? RAISON_VERROU : undefined}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <Select
          label="Projet"
          icon={{ name: 'bag', color: 'var(--accent-deep)' }}
          options={optionsProjets}
          value={draft.project}
          disabled={verrouille}
          title={verrouille ? RAISON_VERROU : undefined}
          onValueChange={(project) => onChange({ project })}
        />
        <div>
          <div className={styles.label}>Variante d’environnement</div>
          <RadioGroup
            label="Variante d’environnement"
            options={OPTIONS_ENV}
            value={draft.environment}
            disabled={verrouille}
            title={verrouille ? RAISON_VERROU : undefined}
            onValueChange={(environment) => onChange({ environment: environment as Environment })}
          />
        </div>
      </div>

      {/* **Sa propre rangée, pleine largeur** (`08f`). Deux placements ont été essayés et écartés
          à la mesure : dans la grille principale sans `grid-column`, le champ volait une cellule et
          « Hôte » / « Port » remontaient sur sa rangée ; dans la cellule du sélecteur, il cassait
          l'`align-items: end` de la rangée d'identité — le sélecteur ne s'alignait plus avec le nom
          de la base ni avec les boutons d'environnement.

          Le champ n'existe **que** sous « + Nouveau projet… » : le rendre toujours, désactivé,
          ferait croire qu'on peut renommer le projet choisi. */}
      {creeUnProjet && (
        // Une enveloppe, parce que le `className` de `Field` va sur son `<input>` et non sur la
        // boîte qui porte l'étiquette — c'est elle qui est l'item de la grille.
        <div className={styles.newProjectRow}>
          <Field
            label="Nom du nouveau projet"
            value={draft.newProjectName}
            onChange={(event) => onChange({ newProjectName: event.target.value })}
          />
        </div>
      )}

      {/* **Un moteur de fichier n'a ni hôte ni port** (`17a`). Les afficher ferait remplir cinq
          champs pour rien, et laisserait croire qu'ils comptent — c'est la raison qui a fait
          préférer masquer plutôt qu'ajouter un champ `path` vide pour six moteurs sur sept. */}
      {!fichier && (
        // Le port est **collé** à l'hôte : sous-grille `1fr 84px` avec un gap de 8px, contre
        // les 18px de la grille principale.
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
      )}

      {/* **Le même champ, deux rôles.** Pour un moteur de fichier, `defaultDatabase` porte le chemin
          — le champ est déjà « la base à ouvrir », et pour SQLite la base *est* un fichier. Le
          libellé change, la donnée non. */}
      <Field
        label={fichier ? 'Fichier de la base' : 'Base par défaut'}
        mono
        value={draft.defaultDatabase}
        placeholder={fichier ? '~/bases/atelier.db' : undefined}
        onChange={(event) => onChange({ defaultDatabase: event.target.value })}
      />

      {!fichier && (
        <Field
          label="Utilisateur"
          mono
          value={draft.username}
          onChange={(event) => onChange({ username: event.target.value })}
        />
      )}

      {/* Un fichier local n'a pas de mot de passe (`17a`). Le champ resterait vide, et le badge
          « Trousseau » promettrait de ranger un secret qui n'existe pas. */}
      {!fichier && (
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
                aria-label={
                  passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                }
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
      )}

      {/* Rangée pleine largeur : mode SSL à gauche, les deux bascules à droite, alignées en
          bas avec un décalage de 5px pour tomber sur la ligne de base des champs.

          **Le mode SSL disparaît pour un fichier** : il n'y a pas de transport à chiffrer. Les deux
          bascules restent — « lecture seule » et « se reconnecter au démarrage » ont un sens pour
          un fichier comme pour un serveur. */}
      {/* **Le certificat d'autorité, visible seulement quand le mode l'emploie** (`06f`).
          `require` chiffre sans authentifier : le champ n'y servirait à rien, et l'afficher ferait
          croire qu'il change quelque chose. C'est la même règle que les cinq champs masqués pour un
          moteur de fichier (`17a`) — ne montrer que ce qui compte. */}
      {!fichier && authentifie(draft.sslMode) && (
        <Field
          label="Certificat d’autorité"
          mono
          value={draft.caCertificate}
          placeholder="~/certs/interne.pem — vide : autorités publiques"
          onChange={(event) => onChange({ caCertificate: event.target.value })}
        />
      )}

      <div className={styles.rowSsl}>
        {!fichier && (
          <Select
            label="Mode SSL"
            options={OPTIONS_SSL}
            value={draft.sslMode}
            onValueChange={(sslMode) => onChange({ sslMode: sslMode as SslMode })}
          />
        )}
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
