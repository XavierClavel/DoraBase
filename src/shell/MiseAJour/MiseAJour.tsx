import { useEffect, useRef, useState } from 'react'
import { checkUpdate, installUpdate } from '../../data/commandes'
import type { AvailableUpdate } from '../../domain/maj'
import { Button } from '../../ui/Button/Button'
import { Popover } from '../../ui/Popover/Popover'
import styles from './MiseAJour.module.css'

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
 * **Aucune recherche périodique.** Une fois au démarrage, et c'est tout : une session dure
 * l'après-midi, et une requête toutes les heures ne ferait qu'annoncer plus tôt une release
 * que le redémarrage suivant aurait trouvée de toute façon.
 */
export function MiseAJour({ chercher = checkUpdate, installer = installUpdate }: MiseAJourProps) {
  const [disponible, setDisponible] = useState<AvailableUpdate | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  // Le composant vit aussi longtemps que l'application, mais React le démonte deux fois en
  // développement (`StrictMode`) : sans ce garde, la seconde réponse écrit dans un état mort.
  const monte = useRef(true)

  useEffect(() => {
    monte.current = true
    chercher()
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
      setEchec("l'installation n'a pas abouti")
    } catch (erreur) {
      setEchec(erreur instanceof Error ? erreur.message : String(erreur))
    }
    if (monte.current) setEnCours(false)
  }

  return (
    <Popover
      title={`Version ${disponible.version}`}
      align="end"
      content={
        <div className={styles.panneau}>
          {disponible.notes ? (
            <p className={styles.notes}>{disponible.notes}</p>
          ) : (
            <p className={styles.notes}>Cette version n'a pas de notes.</p>
          )}
          {echec !== null && <p className={styles.echec}>{echec}</p>}
          <Button size="sm" onClick={lancer} disabled={enCours}>
            {enCours ? 'Téléchargement…' : 'Installer et redémarrer'}
          </Button>
          <p className={styles.avertissement}>
            DoraBase se relance seul. Les consoles non enregistrées ne sont pas conservées.
          </p>
        </div>
      }
    >
      <button type="button" className={styles.declencheur}>
        {disponible.version} disponible
      </button>
    </Popover>
  )
}
