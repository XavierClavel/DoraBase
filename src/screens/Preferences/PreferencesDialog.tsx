import { useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { IconName } from '../../design/icons/names'
import type { Guards, Preferences, Theme } from '../../domain/config'
import { Button } from '../../ui/Button/Button'
import { Modal } from '../../ui/Modal/Modal'
import { Toggle } from '../../ui/Toggle/Toggle'
import styles from './PreferencesDialog.module.css'
import {
  borner,
  CORPS_MAX,
  CORPS_MIN,
  HAUTEUR_MAX,
  hauteurMinimalePour,
  PALETTE,
  PREFERENCES_PAR_DEFAUT,
  THEMES,
  themeIncomplet,
} from './preferences'

type PreferencesDialogProps = {
  preferences: Preferences
  /**
   * Applique un réglage. **Appelé à chaque changement**, pas à la fermeture.
   *
   * « Les préférences s'appliquent immédiatement », dit le mockup, et cela engage : il n'y a pas de
   * bouton « Appliquer », donc pas de formulaire tampon. « Terminé » ferme, il ne valide pas.
   */
  onChange: (preferences: Preferences) => void
  onClose: () => void
  /** La version affichée en pied de sidebar — `DoraBase 0.4.2 (arm64)`. */
  version: string
}

/** Les sept sections du mockup, dans son ordre. */
type Section =
  | 'general'
  | 'apparence'
  | 'grille'
  | 'editeur'
  | 'connexions'
  | 'securite'
  | 'raccourcis'

const SECTIONS: readonly { cle: Section; nom: string; icone: IconName }[] = [
  { cle: 'general', nom: 'Général', icone: 'gear' },
  { cle: 'apparence', nom: 'Apparence', icone: 'paint' },
  { cle: 'grille', nom: 'Grille de données', icone: 'cols' },
  { cle: 'editeur', nom: 'Éditeur SQL', icone: 'code' },
  { cle: 'connexions', nom: 'Connexions', icone: 'srv' },
  { cle: 'securite', nom: 'Sécurité & écriture', icone: 'shield' },
  { cle: 'raccourcis', nom: 'Raccourcis', icone: 'kbd' },
]

/**
 * L'écran de préférences de `A10` (`15a` → `15d`).
 *
 * **Trois des sept sections n'ont rien à régler**, et elles le disent. Les cacher ferait croire à
 * une interface plus pauvre qu'elle ne sera ; les laisser vides ferait croire à un défaut. C'est la
 * règle de `09f`, appliquée à une section plutôt qu'à un bouton.
 */
export function PreferencesDialog({
  preferences,
  onChange,
  onClose,
  version,
}: PreferencesDialogProps) {
  // Le mockup ouvre sur « Apparence » : c'est la section qui a du contenu, et ouvrir sur « Général »
  // montrerait d'abord une section qui annonce ce qu'elle portera.
  const [section, setSection] = useState<Section>('apparence')
  const [aReinitialiser, setAReinitialiser] = useState(false)

  const regler = (partiel: Partial<Preferences>) => onChange(borner({ ...preferences, ...partiel }))
  const reglerUnGardeFou = (partiel: Partial<Guards>) =>
    onChange({ ...preferences, guards: { ...preferences.guards, ...partiel } })

  return (
    <Modal
      title="Préférences"
      icon="gear"
      onClose={onClose}
      className={styles.modale}
      footer={
        <div className={styles.pied}>
          {/* La phrase du mockup, et elle **engage** : pas de bouton « Appliquer ». */}
          <span className={styles.immediat}>Les préférences s’appliquent immédiatement</span>
          <span className={styles.espace} />
          <Button variant="secondary" size="md" onClick={() => setAReinitialiser(true)}>
            Réinitialiser
          </Button>
          <Button variant="dark" size="md" onClick={onClose}>
            Terminé
          </Button>
        </div>
      }
    >
      <div className={styles.corps}>
        {/* `role="tablist"` : sept panneaux dont un seul est visible, ce qui est exactement ce que
            les onglets ARIA décrivent.
            **Les flèches sont écrites à la main, et il fallait qu'elles le soient.** Un rôle ARIA ne
            fournit aucun comportement : il *annonce* une convention, et c'est au code de la tenir.
            Un `tablist` sans navigation aux flèches est un mensonge à la voix — un lecteur d'écran
            annonce « onglet 1 sur 7 » et les flèches ne font rien. Un commentaire de ce fichier
            affirmait le contraire ; c'est le test Playwright qui l'a démenti. */}
        <div
          className={styles.sections}
          role="tablist"
          aria-orientation="vertical"
          aria-label="Sections des préférences"
          onKeyDown={(evenement) => {
            const pas = evenement.key === 'ArrowDown' ? 1 : evenement.key === 'ArrowUp' ? -1 : 0
            if (pas === 0) return
            evenement.preventDefault()
            // **Le départ est l'onglet qui a le focus, pas celui qui est sélectionné.** Les deux
            // sont tenus en phase par ce gestionnaire, mais ils divergent dès qu'on porte le focus
            // ailleurs — au clic, ou par un `focus()`. Partir de la sélection faisait alors sauter
            // d'un onglet de trop, ce que le test Playwright a montré.
            const depuis =
              evenement.target instanceof HTMLElement
                ? (evenement.target.dataset.section ?? section)
                : section
            const rang = SECTIONS.findIndex((entree) => entree.cle === depuis)
            // Le parcours **boucle** : c'est la convention ARIA pour un `tablist`, et s'arrêter au
            // bout obligerait à revenir en sens inverse pour atteindre la première.
            const suivant = SECTIONS[(rang + pas + SECTIONS.length) % SECTIONS.length]
            if (!suivant) return
            setSection(suivant.cle)
            // Le focus suit la sélection : c'est le modèle « sélection automatique » des onglets,
            // celui que les flèches impliquent.
            evenement.currentTarget
              .querySelector<HTMLButtonElement>(`[data-section="${suivant.cle}"]`)
              ?.focus()
          }}
        >
          {SECTIONS.map((entree) => (
            <button
              key={entree.cle}
              type="button"
              role="tab"
              data-section={entree.cle}
              aria-selected={section === entree.cle}
              // **Un seul onglet dans l'ordre de tabulation**, l'actif : c'est la convention ARIA,
              // et sans elle sept tabulations séparent la liste du panneau.
              tabIndex={section === entree.cle ? 0 : -1}
              className={section === entree.cle ? styles.sectionActive : styles.section}
              onClick={() => setSection(entree.cle)}
            >
              <Icon name={entree.icone} size={13} strokeWidth={1.9} />
              {entree.nom}
            </button>
          ))}
          <span className={styles.espace} />
          <span className={styles.version}>{version}</span>
        </div>

        <div className={styles.panneau} role="tabpanel">
          {section === 'apparence' && <Apparence preferences={preferences} onRegler={regler} />}
          {section === 'grille' && <Grille preferences={preferences} onRegler={regler} />}
          {section === 'securite' && (
            <GardeFous guards={preferences.guards} onRegler={reglerUnGardeFou} />
          )}
          {section === 'general' && (
            <AVenir
              titre="Général"
              porte="La langue de l’interface, le comportement au démarrage, et l’ouverture automatique des connexions."
            />
          )}
          {section === 'editeur' && (
            <AVenir
              titre="Éditeur SQL"
              porte="Le dialecte de coloration, la taille de l’indentation, et le formateur — qui demande d’abord de choisir une dépendance."
            />
          )}
          {section === 'connexions' && (
            <AVenir
              titre="Connexions"
              porte="Le délai d’attente, la reconnexion automatique, et le chemin du fichier de clés SSH par défaut."
            />
          )}
          {section === 'raccourcis' && (
            <AVenir
              titre="Raccourcis"
              porte="La table des raccourcis, et leur réassignation. Ceux du produit sont pour l’instant figés — ils sont affichés à côté de chaque action."
            />
          )}
        </div>
      </div>

      {aReinitialiser && (
        <ReinitialisationConfirmee
          onClose={() => setAReinitialiser(false)}
          onConfirmer={() => {
            onChange(PREFERENCES_PAR_DEFAUT)
            setAReinitialiser(false)
          }}
        />
      )}
    </Modal>
  )
}

/** Thème et couleur d'accent (`15b`). */
function Apparence({
  preferences,
  onRegler,
}: {
  preferences: Preferences
  onRegler: (partiel: Partial<Preferences>) => void
}) {
  return (
    <>
      <section className={styles.bloc}>
        <h3 className={styles.titre}>Thème</h3>
        {/* **Des radios natives**, comme `RadioGroup` (`08a`) : l'exclusivité, la navigation aux
            flèches et l'annonce à la voix viennent du navigateur. Un `role="radio"` posé sur un
            bouton redemanderait tout cela à la main — et Biome le signale. */}
        <div className={styles.themes}>
          {THEMES.map((theme) => (
            <label
              key={theme.valeur}
              className={preferences.theme === theme.valeur ? styles.themeActif : styles.theme}
            >
              <input
                type="radio"
                name="theme"
                className={styles.radio}
                checked={preferences.theme === theme.valeur}
                onChange={() => onRegler({ theme: theme.valeur })}
              />
              <span className={styles.apercu} data-theme-apercu={theme.valeur} aria-hidden="true" />
              {theme.nom}
            </label>
          ))}
        </div>
        {/* **Dit, et non caché.** `tokens.json` n'a qu'une valeur par jeton : le sombre demande une
            seconde valeur pour chacun, ce qui est un travail de design que le handoff ne fournit
            pas. C'est le seul endroit du projet où une préférence est livrée avant ce qu'elle
            règle, et l'alternative — cacher le réglage — cacherait aussi la raison de son
            absence. */}
        {themeIncomplet(preferences.theme) && (
          <p className={styles.reserve} role="status">
            « Nuit » est <strong>incomplet</strong> : les jetons de design du projet n’ont
            aujourd’hui qu’une valeur claire. Le mécanisme est livré, les couleurs sombres restent à
            dessiner.
          </p>
        )}
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.titre}>Couleur d’accent</h3>
        <div className={styles.palette}>
          {PALETTE.map((entree) => (
            <label
              key={entree.valeur}
              className={
                preferences.accent === entree.valeur ? styles.pastilleActive : styles.pastille
              }
              style={{ background: entree.couleur }}
            >
              <input
                type="radio"
                name="accent"
                className={styles.radio}
                checked={preferences.accent === entree.valeur}
                onChange={() => onRegler({ accent: entree.valeur })}
              />
              {/* Le nom est **porté par un texte**, pas par un `aria-label` sur une pastille de
                  couleur : « terracotta » doit s'annoncer, et une couleur seule n'est pas un nom. */}
              <span className={styles.pourLaVoix}>{entree.nom}</span>
            </label>
          ))}
          <span className={styles.note}>sert aussi à teinter la connexion active</span>
        </div>
      </section>
    </>
  )
}

/** Densité des lignes et police du code (`15c`). */
function Grille({
  preferences,
  onRegler,
}: {
  preferences: Preferences
  onRegler: (partiel: Partial<Preferences>) => void
}) {
  const plancher = hauteurMinimalePour(preferences.codeFontTenths)
  const contraint = plancher > 20

  return (
    <>
      <section className={styles.bloc}>
        <h3 className={styles.titre}>Densité des lignes</h3>
        <div className={styles.curseur}>
          <span className={styles.borne}>compact</span>
          <input
            type="range"
            min={plancher}
            max={HAUTEUR_MAX}
            step={1}
            value={preferences.rowHeight}
            aria-label="Densité des lignes"
            onChange={(evenement) => onRegler({ rowHeight: Number(evenement.target.value) })}
          />
          <span className={styles.borne}>aéré</span>
          <span className={styles.valeur}>{preferences.rowHeight}px</span>
        </div>
        {/* **La contrainte est dite, pas subie** (`15c`) : le curseur ne descend plus, et sans cette
            phrase l'utilisateur chercherait pourquoi. */}
        {contraint && (
          <p className={styles.reserve}>
            La police du code occupe {preferences.codeFontTenths / 10} px : en dessous de {plancher}
            px, le texte des cellules serait rogné.
          </p>
        )}
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.titre}>Police du code</h3>
        <div className={styles.curseur}>
          <span className={styles.borne}>{CORPS_MIN / 10} px</span>
          <input
            type="range"
            min={CORPS_MIN}
            max={CORPS_MAX}
            step={5}
            value={preferences.codeFontTenths}
            aria-label="Corps de la police du code"
            onChange={(evenement) => onRegler({ codeFontTenths: Number(evenement.target.value) })}
          />
          <span className={styles.borne}>{CORPS_MAX / 10} px</span>
          <span className={styles.valeur}>{preferences.codeFontTenths / 10} px</span>
        </div>
        {/* La famille n'est pas réglable : `--font-mono` porte JetBrains Mono, embarquée par `02`.
            Proposer une liste de polices système demanderait de les énumérer, ce que le web ne
            permet pas sans une permission que Tauri ne donne pas. */}
        <p className={styles.note}>
          La famille reste JetBrains Mono, embarquée avec l’application. Le corps s’applique à la
          grille, à l’éditeur et aux blocs SQL.
        </p>
      </section>
    </>
  )
}

/** Les quatre garde-fous d'écriture (`15d`). */
function GardeFous({
  guards,
  onRegler,
}: {
  guards: Guards
  onRegler: (partiel: Partial<Guards>) => void
}) {
  return (
    <section className={styles.bloc}>
      <h3 className={styles.titre}>Garde-fous</h3>
      {/* **Chaque bascule dit ce qu'elle protège, pas comment elle marche.** Les phrases sont
          celles du mockup, complétées de ce qui arrive quand on éteint : `11d` avait posé qu'un
          garde-fou désactivable avant qu'un écran ne l'explique est un garde-fou qu'on désactive
          par accident. L'écran existe maintenant. */}
      <GardeFou
        libelle="Modifications en attente avant écriture"
        detail="Toute édition passe par un diff à valider (⌘↩). Éteint, une cellule modifiée part directement dans la base."
        checked={guards.pendingBeforeWrite}
        onCheckedChange={(pendingBeforeWrite) => onRegler({ pendingBeforeWrite })}
      />
      <GardeFou
        libelle="Ouvrir les bases « prod » en lecture seule"
        detail="⌘E déverrouille l’édition pour la session en cours. Éteint, une base de production s’ouvre modifiable."
        checked={guards.prodReadOnly}
        onCheckedChange={(prodReadOnly) => onRegler({ prodReadOnly })}
      />
      <GardeFou
        libelle="Refuser DELETE/UPDATE sans clause WHERE"
        detail="Dans la console comme dans la grille. Éteint, la confirmation subsiste — mais elle se clique, là où un refus oblige à écrire la clause."
        checked={guards.refuseUnrestrictedWrites}
        onCheckedChange={(refuseUnrestrictedWrites) => onRegler({ refuseUnrestrictedWrites })}
      />
      {/* **Désactivé avec sa raison**, et non allumé sans effet : `11c` et `11d` avaient annoncé
          cette promesse puis l'avaient retirée, faute de persister le patch. La leçon du défaut
          n° 36 tranche — un réglage qui ne fait rien est pire qu'un réglage absent. */}
      <GardeFou
        libelle="Garder le patch inverse 24 h"
        detail="Le patch inverse existe pendant la session et se copie depuis le panneau des modifications. Le conserver au-delà demande de décider où l’écrire et ce qu’il advient d’un patch dont la base a changé : ce n’est pas encore tranché."
        checked={false}
        onCheckedChange={() => {}}
        indisponible
      />
    </section>
  )
}

function GardeFou({
  libelle,
  detail,
  checked,
  onCheckedChange,
  indisponible,
}: {
  libelle: string
  detail: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  indisponible?: boolean
}) {
  return (
    <div className={indisponible ? styles.gardeFouInerte : styles.gardeFou}>
      <Toggle
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={libelle}
        disabled={indisponible}
      />
      <div className={styles.gardeFouTexte}>
        <span className={styles.gardeFouLibelle}>{libelle}</span>
        <span className={styles.gardeFouDetail}>{detail}</span>
      </div>
    </div>
  )
}

/**
 * Une section qui n'a rien à régler, **et qui dit ce qu'elle portera**.
 *
 * La cacher ferait croire à une interface plus pauvre qu'elle ne sera ; la laisser vide ferait
 * croire à un défaut.
 */
function AVenir({ titre, porte }: { titre: string; porte: string }) {
  return (
    <section className={styles.bloc}>
      <h3 className={styles.titre}>{titre}</h3>
      <p className={styles.aVenir}>
        Rien à régler ici pour l’instant. Cette section portera : {porte}
      </p>
    </section>
  )
}

/**
 * La confirmation de « Réinitialiser ».
 *
 * **Destructif pour les réglages**, donc confirmé — y compris les garde-fous, qu'un clic distrait
 * remettrait tous à leur valeur d'origine. La confirmation dit *ce qui* revient, pas « êtes-vous
 * sûr ? » : c'est la règle établie en `08j` et `11d`.
 */
function ReinitialisationConfirmee({
  onClose,
  onConfirmer,
}: {
  onClose: () => void
  onConfirmer: () => void
}) {
  return (
    <Modal
      title="Réinitialiser les préférences"
      icon="warn"
      nested
      onClose={onClose}
      footer={
        <div className={styles.pied}>
          <span className={styles.espace} />
          <Button variant="secondary" size="md" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="dark" size="md" onClick={onConfirmer}>
            Remettre les valeurs d’origine
          </Button>
        </div>
      }
    >
      <div className={styles.confirmation}>
        <p>
          Le thème, l’accent, la densité et la police reviendront aux valeurs du produit, et{' '}
          <strong>les quatre garde-fous d’écriture seront réactivés</strong>.
        </p>
        <p className={styles.note}>Aucune connexion et aucune requête enregistrée n’est touchée.</p>
      </div>
    </Modal>
  )
}

/** Le thème appliqué à la racine, exporté pour que `Workbench` n'ait pas à le recalculer. */
export type { Theme }
