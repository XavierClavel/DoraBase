import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { CreateProjectRequest, EnvironmentDeclaration, Project } from '../../domain/config'
import { Button } from '../../ui/Button/Button'
import { cx } from '../../ui/cx'
import { Field } from '../../ui/Field/Field'
import { Modal } from '../../ui/Modal/Modal'
import { Stepper } from '../../ui/Stepper/Stepper'
import { Toggle } from '../../ui/Toggle/Toggle'
import { COULEURS_D_ENVIRONNEMENT, TRIO_PAR_DEFAUT } from '../NewConnection/environments'
import styles from './NewProject.module.css'

/** Une ligne d'environnement en cours d'édition. La couleur suit l'ordre, elle ne se choisit pas. */
type LigneEnv = { label: string; color: EnvironmentDeclaration['color']; production: boolean }

type NewProjectProps = {
  /** Les projets déjà déclarés, pour refuser un nom en doublon **avant** le clic. */
  projets: readonly { name: string }[]
  onClose: () => void
  /** Crée le projet. Rejette avec le refus à afficher. */
  onCreate: (request: CreateProjectRequest) => Promise<Project[]>
  /** Le projet créé : c'est l'appelant qui enchaîne sur l'étape 2 (`24c`). */
  onCreated: (projects: Project[], nom: string) => void
}

/** Les cinq couleurs de `23a`, dans l'ordre où elles sont attribuées aux lignes ajoutées. */
const COULEURS: EnvironmentDeclaration['color'][] = ['green', 'amber', 'red', 'slate', 'violet']

/**
 * L'étape 1 du parcours de création : **un projet** (`24a`).
 *
 * # Ce que cet écran renverse
 *
 * Le projet se créait depuis `A2`, par l'entrée « + Nouveau projet… » de son sélecteur (`08f`) : le
 * geste principal était « je déclare une connexion », et le projet naissait au passage. Il devient
 * « je déclare un projet, puis on me propose sa première connexion ».
 *
 * # Pourquoi les libellés d'environnement sont modifiables ici
 *
 * `23a` fige l'identifiant d'un environnement au libellé donné **à la création**, et jamais après —
 * parce que la référence d'un mot de passe dans le trousseau le contient. Tant qu'aucune connexion
 * n'existe, identifiant et libellé coïncident et un renommage est sans dette ; dès la première
 * connexion, tout renommage installe une divergence. C'est donc le seul moment où le geste est propre,
 * et le refuser ici le rendrait inatteignable — d'autant que l'écran d'édition (`23e`) n'existe pas
 * encore.
 *
 * **La couleur, elle, ne se choisit pas.** Elle n'a aucune conséquence différée : la changer plus tard
 * ne coûte rien. La faire entrer dans une modale de création transformerait la déclaration d'un projet
 * en séance de coloriage.
 */
export function NewProject({ projets, onClose, onCreate, onCreated }: NewProjectProps) {
  const [nom, setNom] = useState('')
  const [lignes, setLignes] = useState<LigneEnv[]>(() =>
    TRIO_PAR_DEFAUT.map((declaration) => ({
      label: declaration.label,
      color: declaration.color,
      production: declaration.production,
    })),
  )
  const [refus, setRefus] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const nomRogne = nom.trim()
  const deja = projets.some((projet) => projet.name === nomRogne)
  const doublons = lignes
    .map((ligne) => ligne.label.trim().toLowerCase())
    .filter((libelle, index, tous) => libelle !== '' && tous.indexOf(libelle) !== index)
  const vides = lignes.some((ligne) => ligne.label.trim() === '')

  /**
   * La raison de ne pas pouvoir créer, ou `null`.
   *
   * **Elle est calculée, jamais devinée deux fois** : le bouton la lit pour se désactiver, et l'écran
   * l'affiche. Deux expressions séparées finiraient par désaccorder le bouton et son explication —
   * un bouton inerte et muet est le défaut n° 36.
   */
  const empeche =
    nomRogne === ''
      ? 'Donnez un nom au projet.'
      : deja
        ? `Un projet s’appelle déjà « ${nomRogne} ».`
        : vides
          ? 'Chaque environnement a besoin d’un libellé.'
          : doublons.length > 0
            ? `Deux environnements s’appellent « ${doublons[0]} ».`
            : null

  function modifier(index: number, patch: Partial<LigneEnv>) {
    setLignes((precedentes) =>
      precedentes.map((ligne, rang) => (rang === index ? { ...ligne, ...patch } : ligne)),
    )
  }

  async function creer() {
    if (empeche !== null || enCours) return
    setEnCours(true)
    setRefus(null)
    try {
      const projects = await onCreate({
        name: nomRogne,
        environments: lignes.map((ligne) => ({
          // L'identifiant est dérivé **côté Rust**, qui porte la règle (`23a`). L'envoyer d'ici
          // demanderait de réimplémenter la dérivation, et deux implémentations divergent.
          id: '',
          label: ligne.label.trim(),
          color: ligne.color,
          production: ligne.production,
        })),
      })
      onCreated(projects, nomRogne)
    } catch (cause) {
      // Le refus du cœur s'affiche **au même endroit** que ceux calculés ici : l'utilisateur n'a pas à
      // savoir lequel des deux a parlé. C'est l'invariant Rust qui reste l'autorité, notamment pour la
      // course avec une autre fenêtre.
      setRefus(typeof cause === 'string' ? cause : ((cause as Error)?.message ?? String(cause)))
      setEnCours(false)
    }
  }

  return (
    <Modal
      title="Nouveau projet"
      icon="bag"
      onClose={onClose}
      footer={
        <div className={styles.pied}>
          <span className={styles.raison} role={empeche === null ? undefined : 'status'}>
            {refus ?? empeche}
          </span>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="accent"
            disabled={empeche !== null || enCours}
            title={empeche ?? undefined}
            size="lg"
            shortcut="⌘↩"
            onClick={() => void creer()}
          >
            Continuer
          </Button>
        </div>
      }
    >
      {/* **La bande est rendue ici, premier enfant du corps** — `Modal` n'a pas de propriété pour
          elle, et `24b` a décidé de ne pas lui en ajouter pour un seul appelant : ce serait une
          abstraction faite d'avance. `Modal.body` porte `padding: 0`, décision déjà documentée
          précisément pour qu'un écran pose ses propres marges, donc la bande est pleine largeur sans
          rien à compenser. */}
      <Stepper etapes={[{ libelle: 'PROJET' }, { libelle: 'CONNEXION' }]} courante={0} />
      <div className={styles.form}>
        <Field
          label="Nom du projet"
          value={nom}
          placeholder="Atelier Nord"
          onChange={(evenement) => setNom(evenement.target.value)}
        />
        {/* La phrase du handoff, reprise mot pour mot de la sidebar vide de `A1` : elle dit à quoi sert
            un projet, au moment exact où l'on en crée un. */}
        <p className={styles.note}>
          Un projet regroupe plusieurs bases ; chacune se déclare dans un environnement.
        </p>

        <div className={styles.bloc}>
          <div className={styles.blocTitre}>Environnements</div>
          <ul className={styles.liste}>
            {lignes.map((ligne, index) => (
              <li key={index} className={styles.ligne}>
                <span
                  className={styles.pastille}
                  style={{ background: COULEURS_D_ENVIRONNEMENT[ligne.color] }}
                  aria-hidden="true"
                />
                {/* **Pas de `Field`, et c'est son contrat qui le dit** : son étiquette est
                    obligatoire *et visible*, « jamais décorative ». Sur une ligne d'environnement, une
                    étiquette visible par ligne répéterait « Libellé » trois fois sous un titre qui dit
                    déjà « Environnements ». L'entrée porte donc son nom par `aria-label`, et la
                    boîte reprend l'habillage de `Field sm` — voir la feuille. */}
                <input
                  className={styles.libelle}
                  type="text"
                  value={ligne.label}
                  aria-label={`Libellé de l’environnement ${index + 1}`}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(evenement) => modifier(index, { label: evenement.target.value })}
                />
                <label className={styles.production}>
                  <Toggle
                    label={`Production pour ${ligne.label || `l’environnement ${index + 1}`}`}
                    checked={ligne.production}
                    onCheckedChange={(production) => modifier(index, { production })}
                  />
                  <span className={cx(styles.productionTexte, ligne.production && styles.actif)}>
                    Production
                  </span>
                </label>
                <button
                  type="button"
                  className={styles.retirer}
                  aria-label={`Retirer ${ligne.label || `l’environnement ${index + 1}`}`}
                  // **Le dernier ne se retire pas**, et le bouton dit pourquoi : `23a` refuse un projet
                  // sans environnement, une connexion appartenant désormais à l'un d'eux.
                  disabled={lignes.length === 1}
                  title={
                    lignes.length === 1
                      ? 'Un projet a besoin d’au moins un environnement.'
                      : undefined
                  }
                  onClick={() =>
                    setLignes((precedentes) => precedentes.filter((_, rang) => rang !== index))
                  }
                >
                  <Icon name="trash" size={12} strokeWidth={1.9} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              setLignes((precedentes) => [
                ...precedentes,
                {
                  label: '',
                  color: COULEURS[precedentes.length % COULEURS.length] ?? 'slate',
                  production: false,
                },
              ])
            }
          >
            + Ajouter un environnement
          </Button>
        </div>
      </div>
    </Modal>
  )
}
