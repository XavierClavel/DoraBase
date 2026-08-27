import { useEffect, useRef, useState } from 'react'
import { checkUpdate, installUpdate } from '../../data/commandes'
import type { AvailableUpdate } from '../../domain/maj'
import { useT } from '../../i18n/LanguageContext'
import { Button } from '../../ui/Button/Button'
import { Popover } from '../../ui/Popover/Popover'
import styles from './MiseAJour.module.css'

/**
 * La recherche, mémorisée par fonction de recherche.
 *
 * **« Une seule recherche au démarrage » est une propriété du produit**, et elle ne survivait pas
 * à ce composant devenant présent sur plusieurs écrans : monté dans trois barres d'état, il se
 * démonte et se remonte à chaque changement d'onglet, donc son `useEffect` repartait — une requête
 * réseau par aller-retour entre une table et une structure. Une promesse mémorisée rend la
 * propriété au produit sans état global à câbler : le premier montage lance l'appel, tous les
 * autres relisent le même résultat.
 *
 * **La clef est la fonction**, et non une constante : `checkUpdate` est une référence de module,
 * donc stable pour toute la session — un seul appel IPC. Les tests, eux, passent une fermeture
 * neuve à chaque `render`, donc chacun garde sa propre recherche et son isolement.
 *
 * Un rejet reste mémorisé, et c'est voulu : hors ligne au démarrage, on ne réessaie pas — c'est
 * exactement ce que « aucune recherche périodique » veut dire.
 */
const recherches = new WeakMap<
  () => Promise<AvailableUpdate | null>,
  Promise<AvailableUpdate | null>
>()

function rechercheUnique(
  chercher: () => Promise<AvailableUpdate | null>,
): Promise<AvailableUpdate | null> {
  const dejaLancee = recherches.get(chercher)
  if (dejaLancee !== undefined) return dejaLancee
  const lancee = chercher()
  recherches.set(chercher, lancee)
  return lancee
}

type MiseAJourProps = {
  /** Injectées, comme tout ce qui touche à l'IPC : le pont ne répond pas hors de la webview. */
  chercher?: () => Promise<AvailableUpdate | null>
  installer?: () => Promise<void>
}

/**
 * « Une version plus récente existe », dans la barre d'état.
 *
 * **Rien ne s'affiche par défaut, et c'est la propriété qui compte.** Hors de la webview — la
 * galerie, `?demo`, tout Playwright — `checkUpdate` est rejetée, l'état reste `null`, et le
 * composant ne rend rien. Aucune capture de fidélité ne bouge, et il n'y a pas de variante de
 * décor à maintenir pour ça.
 *
 * **Pas de modale, pas de bandeau.** Une mise à jour n'est pas un événement : elle attend, et
 * un bandeau qui prend une bande de l'écran pour attendre coûte plus que ce qu'il annonce. La
 * barre d'état est l'endroit du produit qui dit déjà quelle version tourne — c'est là que
 * « il y en a une autre » se lit sans interrompre.
 *
 * **« La barre d'état » en est trois**, et l'avoir lu au singulier est le défaut du 26 août 2026 :
 * monté dans `shell/StatusBar` seul, ce composant n'existait que sur l'écran d'accueil, le seul à
 * rendre cette barre. Une session de travail se passe dans le Workbench, dont la bande du bas est
 * `TableStatusBar` ou `StructureStatusBar` — donc l'annonce était invisible exactement pendant que
 * l'application servait. Les trois barres la portent désormais, et `rechercheUnique` fait que les
 * trois montages ne comptent que pour une requête.
 *
 * **Reste un trou, et il est nommé plutôt que tu** : un onglet de console n'a **aucune** barre au
 * niveau de l'écran — son pied vit dans le panneau central, le mockup ne lui en donne pas
 * d'autre. L'annonce n'y paraît donc pas. En ajouter une serait un changement de composition, pas
 * un correctif, et il demande la maquette.
 *
 * **Aucune recherche périodique.** Une fois au démarrage, et c'est tout : une session dure
 * l'après-midi, et une requête toutes les heures ne ferait qu'annoncer plus tôt une release
 * que le redémarrage suivant aurait trouvée de toute façon.
 */
export function MiseAJour({ chercher = checkUpdate, installer = installUpdate }: MiseAJourProps) {
  const t = useT()
  const [disponible, setDisponible] = useState<AvailableUpdate | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  // Le composant vit aussi longtemps que l'application, mais React le démonte deux fois en
  // développement (`StrictMode`) : sans ce garde, la seconde réponse écrit dans un état mort.
  const monte = useRef(true)

  useEffect(() => {
    monte.current = true
    rechercheUnique(chercher)
      .then((trouvee) => {
        if (monte.current) setDisponible(trouvee)
      })
      // **Le silence est le comportement voulu**, pas un oubli : voir `checkUpdate`.
      .catch(() => {})
    return () => {
      monte.current = false
    }
  }, [chercher])

  if (disponible === null) return null

  async function lancer() {
    setEnCours(true)
    setEchec(null)
    try {
      await installer()
      // Atteint seulement si l'installation a échoué sans lever — le succès remplace le
      // processus. Le dire ainsi plutôt que de laisser le bouton tourner indéfiniment.
      setEchec(t('shell.miseAJour.installFailed'))
    } catch (erreur) {
      setEchec(erreur instanceof Error ? erreur.message : String(erreur))
    }
    if (monte.current) setEnCours(false)
  }

  return (
    <Popover
      title={t('shell.miseAJour.popoverTitle', { version: disponible.version })}
      align="end"
      // **Vers le haut, et c'est le correctif du 26 août 2026.** Le déclencheur vit dans la barre
      // d'état, donc dans les 26 derniers pixels de la fenêtre : ouvert vers le bas, le panneau
      // était dessiné hors de la fenêtre, que `html, body { overflow: hidden }` ne laisse pas
      // défiler. Le clic basculait bien l'état — `aria-expanded` passait à `true`, le `dialog`
      // était dans le DOM — et il ne se passait *rien* de visible. Le mode de défaillance à
      // retenir : un panneau flottant peut être « ouvert » et hors d'atteinte, et ni le DOM ni
      // Playwright au sens de la visibilité ne le disent.
      ouvertureVers="haut"
      content={
        <div className={styles.panneau}>
          {disponible.notes ? (
            <p className={styles.notes}>{disponible.notes}</p>
          ) : (
            <p className={styles.notes}>{t('shell.miseAJour.noNotes')}</p>
          )}
          {echec !== null && <p className={styles.echec}>{echec}</p>}
          <Button size="sm" onClick={lancer} disabled={enCours}>
            {enCours ? t('shell.miseAJour.installing') : t('shell.miseAJour.install')}
          </Button>
          <p className={styles.avertissement}>{t('shell.miseAJour.warning')}</p>
        </div>
      }
    >
      <button type="button" className={styles.declencheur}>
        {t('shell.miseAJour.trigger', { version: disponible.version })}
      </button>
    </Popover>
  )
}
