import { useState } from 'react'
import {
  creerLEnvironnement,
  recolorierLEnvironnement,
  renommerLEnvironnement,
  reordonnerLesEnvironnements,
  retirerLEnvironnement,
} from '../../data/environnements'
import { Icon } from '../../design/icons/Icon'
import type {
  DeleteEnvironmentResult,
  EnvironmentColor,
  EnvironmentDeclaration,
  Project,
} from '../../domain/config'
import { Button } from '../../ui/Button/Button'
import { cx } from '../../ui/cx'
import { Field } from '../../ui/Field/Field'
import { Modal } from '../../ui/Modal/Modal'
import { Toggle } from '../../ui/Toggle/Toggle'
import { COULEURS_D_ENVIRONNEMENT } from '../NewConnection/environments'
import { DeleteEnvironmentDialog } from './DeleteEnvironmentDialog'
import styles from './ProjectEditor.module.css'

/** Les cinq couleurs de `23a`, dans l'ordre du nuancier. */
const COULEURS: EnvironmentColor[] = ['green', 'amber', 'red', 'slate', 'violet']

/** Les cinq gestes de `23c`, injectables pour la raison de `08d` : le pont ne répond pas hors webview. */
export type GestesEnvironnement = {
  onCreer?: typeof creerLEnvironnement
  onRenommer?: typeof renommerLEnvironnement
  onRecolorier?: typeof recolorierLEnvironnement
  onReordonner?: typeof reordonnerLesEnvironnements
  onRetirer?: typeof retirerLEnvironnement
}

type ProjectEditorProps = GestesEnvironnement & {
  /** Le projet à modifier, **tel que la liste chargée le porte** — jamais une copie de travail. */
  projet: Project
  onClose: () => void
  /** Les projets à jour après chaque geste : c'est l'appelant qui tient la liste. */
  onProjets: (projects: Project[]) => void
  /**
   * Renomme le projet (`08i`). Rejette avec le refus à afficher.
   *
   * **Le geste de `08i`, non un nouveau** : renommer un projet déplace ses mots de passe dans le
   * trousseau, et cette garantie appartient à `rename_project`. Ce qui a déménagé ici est l'écran, pas
   * la mécanique.
   */
  onRenameProject?: (
    nom: string,
  ) => Promise<{ missingSecrets: string[]; leftoverSecrets: string[] }>
}

/**
 * La modale d'édition d'un projet : son nom, et ses environnements (`23e`).
 *
 * # Ce qu'elle absorbe
 *
 * **`RenameProjectDialog` n'existe plus.** Renommer un projet était une modale à part (`08i`) ; c'est
 * désormais le premier champ de celle-ci. Deux écrans qui renomment la même chose finiraient par
 * diverger, et le second à être écrit serait celui qu'on oublie de corriger.
 *
 * # Tout s'applique immédiatement
 *
 * Pas de bouton « Appliquer », comme les préférences de `15a` : un formulaire tampon devrait être
 * réconcilié avec le disque, et c'est cette réconciliation qui produit les états impossibles. Un
 * renommage part **au relâchement du champ**, une couleur au clic, un ordre au dépôt.
 *
 * **La seule exception est la suppression**, qui passe par la confirmation de `23f` — dès lors que
 * l'environnement porte au moins une connexion. Un environnement vide se retire sans question :
 * demander confirmation pour un geste sans conséquence apprend à cliquer sans lire.
 *
 * # Ce qui est refusé, et par qui
 *
 * Rien n'est revérifié ici : le cœur refuse un identifiant en doublon, un projet sans environnement,
 * un ordre incomplet (`23a`, `23c`), et le refus s'affiche tel quel. Une seconde implémentation des
 * règles dans l'écran divergerait de la première, et c'est celle du cœur qui décide.
 */
export function ProjectEditor({
  projet,
  onClose,
  onProjets,
  onRenameProject,
  onCreer = creerLEnvironnement,
  onRenommer = renommerLEnvironnement,
  onRecolorier = recolorierLEnvironnement,
  onReordonner = reordonnerLesEnvironnements,
  onRetirer = retirerLEnvironnement,
}: ProjectEditorProps) {
  // Le nom en cours de saisie. **Local, et seulement le temps de la saisie** : la vérité est le
  // projet reçu, et ce brouillon disparaît au relâchement du champ.
  const [nom, setNom] = useState(projet.name)
  // Le libellé en cours de saisie, pour une ligne à la fois : deux lignes ne se modifient pas
  // ensemble, et un dictionnaire de brouillons serait un formulaire tampon déguisé.
  const [libelleEnCours, setLibelleEnCours] = useState<{ id: string; valeur: string } | null>(null)
  const [refus, setRefus] = useState<string | null>(null)
  const [rapport, setRapport] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<EnvironmentDeclaration | null>(null)
  const [glisse, setGlisse] = useState<string | null>(null)

  /** Le nombre de connexions qui dépendent d'un environnement (`23e`). */
  function connexionsDe(id: string): string[] {
    return projet.databases.filter((base) => base.environment === id).map((base) => base.name)
  }

  /** Exécute un geste, pose les projets à jour, et affiche le refus du cœur s'il y en a un. */
  async function geste(action: () => Promise<Project[]>) {
    setRefus(null)
    try {
      onProjets(await action())
    } catch (erreur) {
      setRefus(String(erreur))
    }
  }

  async function renommerLeProjet() {
    const propre = nom.trim()
    // Rien à faire : le même nom n'est pas une erreur, et appeler la commande déplacerait des
    // secrets pour rien — donc demanderait une autorisation du système sans raison.
    if (propre === projet.name || propre === '' || onRenameProject === undefined) {
      setNom(projet.name)
      return
    }
    setRefus(null)
    try {
      const issue = await onRenameProject(propre)
      if (issue.missingSecrets.length > 0 || issue.leftoverSecrets.length > 0) {
        setRapport(
          `Le projet est renommé. ${issue.missingSecrets.length} mot(s) de passe étaient introuvables dans le Trousseau, ${issue.leftoverSecrets.length} n’ont pas pu y être effacés.`,
        )
      }
    } catch (erreur) {
      setRefus(String(erreur))
      setNom(projet.name)
    }
  }

  /** Dépose la ligne glissée avant celle qui reçoit, et envoie l'ordre **complet** (`23c`). */
  async function deposer(cible: string) {
    if (glisse === null || glisse === cible) return
    const identifiants = projet.environments.map((declaration) => declaration.id)
    const sans = identifiants.filter((id) => id !== glisse)
    const place = sans.indexOf(cible)
    sans.splice(place, 0, glisse)
    setGlisse(null)
    await geste(() => onReordonner({ project: projet.name, order: sans }))
  }

  /** Déplace une ligne d'un cran, au clavier. */
  async function deplacer(id: string, pas: -1 | 1) {
    const identifiants = projet.environments.map((declaration) => declaration.id)
    const depart = identifiants.indexOf(id)
    const arrivee = depart + pas
    if (arrivee < 0 || arrivee >= identifiants.length) return
    const suivant = [...identifiants]
    const [deplace] = suivant.splice(depart, 1)
    if (deplace === undefined) return
    suivant.splice(arrivee, 0, deplace)
    await geste(() => onReordonner({ project: projet.name, order: suivant }))
  }

  return (
    <>
      {aRetirer !== null && (
        <DeleteEnvironmentDialog
          projet={projet.name}
          libelle={aRetirer.label}
          connexions={connexionsDe(aRetirer.id)}
          onClose={() => setARetirer(null)}
          onDelete={async () => {
            const issue = await onRetirer({
              project: projet.name,
              environment: aRetirer.id,
            })
            onProjets(issue.projects)
            return issue satisfies DeleteEnvironmentResult
          }}
        />
      )}
      <Modal
        title={`Modifier ${projet.name}`}
        icon="bag"
        onClose={onClose}
        footer={
          <div className={styles.pied}>
            <span className={styles.etat} role={refus === null ? 'status' : 'alert'}>
              {refus ?? rapport ?? ''}
            </span>
            {/* **« Terminé », et non « Enregistrer »** : tout est déjà écrit. Un bouton
                d'enregistrement laisserait croire qu'une fermeture par la croix perd les
                modifications. */}
            <Button variant="dark" size="md" onClick={onClose}>
              Terminé
            </Button>
          </div>
        }
      >
        <div className={styles.form}>
          <Field
            label="Nom du projet"
            value={nom}
            // Les quatre attributs de `08a` : macOS corrigeait `localhost` en `Localhost`, et un nom
            // de projet n'a pas plus à être corrigé qu'un nom d'hôte.
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={onRenameProject === undefined}
            onChange={(evenement) => setNom(evenement.target.value)}
            onBlur={() => void renommerLeProjet()}
            onKeyDown={(evenement) => {
              if (evenement.key === 'Enter') void renommerLeProjet()
              if (evenement.key === 'Escape') setNom(projet.name)
            }}
          />
          <p className={styles.note}>
            Les mots de passe enregistrés suivent le nouveau nom, et les connexions ouvertes de ce
            projet seront fermées.
          </p>

          <div className={styles.bloc}>
            <div className={styles.blocTitre}>Environnements</div>
            <ul className={styles.liste}>
              {projet.environments.map((declaration, index) => {
                const connexions = connexionsDe(declaration.id)
                return (
                  <li
                    key={declaration.id}
                    className={cx(styles.ligne, glisse === declaration.id && styles.glissee)}
                    onDragOver={(evenement) => evenement.preventDefault()}
                    onDrop={() => void deposer(declaration.id)}
                  >
                    {/* **La poignée porte le glissement, pas la ligne** : la ligne contient un champ
                        de saisie, et rendre la ligne entière glissable empêcherait de placer le
                        curseur dans le texte. C'est le même arbitrage que `10b`, où le glissement
                        vit sur le bouton d'onglet et non sur son enveloppe. */}
                    <button
                      type="button"
                      className={styles.poignee}
                      // **Un bouton, et le clavier déplace** : `draggable` seul rend le
                      // réordonnancement inatteignable sans souris. `↑↓` sur la poignée décale d'un
                      // cran, ce qui est la seule façon d'offrir ce geste au clavier sans inventer
                      // un mode.
                      aria-label={`Déplacer ${declaration.label} (flèches haut et bas)`}
                      draggable
                      onDragStart={() => setGlisse(declaration.id)}
                      onDragEnd={() => setGlisse(null)}
                      onKeyDown={(evenement) => {
                        if (evenement.key === 'ArrowUp') {
                          evenement.preventDefault()
                          void deplacer(declaration.id, -1)
                        }
                        if (evenement.key === 'ArrowDown') {
                          evenement.preventDefault()
                          void deplacer(declaration.id, 1)
                        }
                      }}
                    >
                      {/* `sort` — deux flèches haut/bas. Le jeu d'icônes n'a pas de poignée, et
                          en dessiner une ferait entrer un glyphe étranger au sprite ; celle-ci
                          dit le geste. */}
                      <Icon name="sort" size={12} strokeWidth={1.9} />
                    </button>

                    {/* Le nuancier : cinq pastilles, et la couleur s'applique au clic. Un menu
                        déroulant demanderait deux gestes pour un réglage sans conséquence. */}
                    <div
                      className={styles.nuancier}
                      role="radiogroup"
                      aria-label={`Couleur de ${declaration.label}`}
                    >
                      {COULEURS.map((couleur) => (
                        // **De vraies cases radio, non des `<button role="radio">`** : le groupe natif
                        // apporte la navigation aux flèches sans une ligne de code, là où le rôle ARIA
                        // l'aurait seulement *promise* — le défaut n° 52. `appearance: none` et une
                        // couleur de fond suffisent à en faire une pastille (voir la feuille).
                        <input
                          key={couleur}
                          type="radio"
                          name={`couleur-${declaration.id}`}
                          aria-label={couleur}
                          checked={declaration.color === couleur}
                          className={cx(
                            styles.pastille,
                            declaration.color === couleur && styles.choisie,
                          )}
                          style={{ background: COULEURS_D_ENVIRONNEMENT[couleur] }}
                          onChange={() =>
                            void geste(() =>
                              onRecolorier({
                                project: projet.name,
                                environment: declaration.id,
                                color: couleur,
                                // **Inchangé** : le geste du cœur porte la couleur et le drapeau
                                // ensemble, et envoyer `false` retirerait les garde-fous de `11d`
                                // pour un clic sur une pastille.
                                production: declaration.production,
                              }),
                            )
                          }
                        />
                      ))}
                    </div>

                    <input
                      className={styles.libelle}
                      type="text"
                      value={
                        libelleEnCours?.id === declaration.id
                          ? libelleEnCours.valeur
                          : declaration.label
                      }
                      aria-label={`Libellé de ${declaration.label}`}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      onChange={(evenement) =>
                        setLibelleEnCours({ id: declaration.id, valeur: evenement.target.value })
                      }
                      onBlur={() => {
                        const valeur = libelleEnCours?.valeur.trim() ?? ''
                        setLibelleEnCours(null)
                        if (valeur === '' || valeur === declaration.label) return
                        void geste(() =>
                          onRenommer({
                            project: projet.name,
                            environment: declaration.id,
                            label: valeur,
                          }),
                        )
                      }}
                      onKeyDown={(evenement) => {
                        if (evenement.key === 'Enter') evenement.currentTarget.blur()
                        if (evenement.key === 'Escape') {
                          setLibelleEnCours(null)
                        }
                      }}
                    />

                    {/* **Le compte, affiché avant même de cliquer** (`23e`) : c'est ce qui rend
                        l'avertissement de `23f` prévisible.

                        **La marque « · actif » a disparu avec `25a`** : un projet n'a plus
                        d'environnement actif, ils sont tous des paliers de l'arbre. Elle disait
                        « retirer celui-ci change le contenu de l'arbre » ; c'est désormais vrai de
                        tous, et le compte le dit déjà mieux. */}
                    <span className={styles.compte}>
                      {connexions.length === 0
                        ? 'aucune connexion'
                        : `${connexions.length} connexion${connexions.length > 1 ? 's' : ''}`}
                    </span>

                    {/* **Pas un `<label>`** : `Toggle` rend un `<button role="switch">`, auquel un
                        `<label>` ne s'associe pas — il aurait promis un mot cliquable pour personne.
                        L'interrupteur porte son nom par `aria-label`. Même arbitrage qu'en `24a`. */}
                    <div className={styles.production}>
                      <Toggle
                        label={`Production pour ${declaration.label}`}
                        checked={declaration.production}
                        onCheckedChange={(production) =>
                          void geste(() =>
                            onRecolorier({
                              project: projet.name,
                              environment: declaration.id,
                              color: declaration.color,
                              production,
                            }),
                          )
                        }
                      />
                      <span
                        className={cx(
                          styles.productionTexte,
                          declaration.production && styles.marque,
                        )}
                      >
                        Production
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.retirer}
                      aria-label={`Retirer ${declaration.label}`}
                      // **Le dernier ne se retire pas**, et le bouton dit pourquoi : une connexion
                      // appartient à un environnement (`23b`), donc un projet sans environnement ne
                      // peut plus rien déclarer. Le cœur le refuse aussi ; l'attribut évite d'offrir
                      // un geste qui ne peut qu'échouer.
                      disabled={projet.environments.length === 1}
                      title={
                        projet.environments.length === 1
                          ? 'Un projet a besoin d’au moins un environnement.'
                          : undefined
                      }
                      onClick={() => {
                        // **Sans connexion, pas de confirmation** (`23f`) : demander confirmation
                        // pour un geste sans conséquence apprend à cliquer sans lire.
                        if (connexions.length === 0) {
                          void geste(async () => {
                            const issue = await onRetirer({
                              project: projet.name,
                              environment: declaration.id,
                            })
                            return issue.projects
                          })
                          return
                        }
                        setARetirer(declaration)
                      }}
                    >
                      <Icon name="trash" size={12} strokeWidth={1.9} />
                    </button>
                    <span className={styles.rang} aria-hidden="true">
                      {index + 1}
                    </span>
                  </li>
                )
              })}
            </ul>
            <Button
              variant="secondary"
              size="md"
              onClick={() =>
                void geste(() =>
                  onCreer({
                    project: projet.name,
                    // Le libellé par défaut est **modifiable aussitôt** : le nommer ici évite un
                    // champ vide qui ne passerait pas la validation du cœur.
                    label: `env ${projet.environments.length + 1}`,
                    color: COULEURS[projet.environments.length % COULEURS.length] ?? 'slate',
                    production: false,
                  }),
                )
              }
            >
              + Ajouter un environnement
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
