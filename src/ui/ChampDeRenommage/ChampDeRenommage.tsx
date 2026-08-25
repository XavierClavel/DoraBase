import { useEffect, useRef, useState } from 'react'
import styles from './ChampDeRenommage.module.css'

type ChampDeRenommageProps = {
  /** Le nom actuel — affiché, présélectionné, et ce à quoi la saisie est comparée. */
  valeurInitiale: string
  onValider: (nom: string) => void
  onAnnuler: () => void
}

/**
 * Le champ qui remplace un libellé pendant un renommage — sur une ligne d'arbre, sur un onglet.
 *
 * **Une seule brique pour les deux endroits.** Le comportement d'un renommage sur place n'a pas de
 * raison de différer selon le libellé qu'il remplace, et les trois sorties ci-dessous sont
 * exactement ce qu'on oublie quand on les réécrit une seconde fois.
 *
 * **Trois sorties, et chacune a sa raison.** `Entrée` valide, parce que c'est le geste attendu d'un
 * champ. `Échap` annule, parce qu'un renommage commencé par erreur — un double-clic de trop — doit
 * pouvoir être abandonné sans réfléchir. La **perte de focus valide** plutôt qu'annuler : cliquer
 * ailleurs après avoir tapé un nom veut dire « c'est bon », et perdre la saisie à ce moment-là est la
 * façon la plus sûre d'agacer quelqu'un.
 *
 * Un nom vide ou inchangé **annule** au lieu de partir : les deux sont des non-gestes, et les envoyer
 * ferait refuser le premier par le cœur et écrire le second pour rien.
 */
export function ChampDeRenommage({ valeurInitiale, onValider, onAnnuler }: ChampDeRenommageProps) {
  const [valeur, setValeur] = useState(valeurInitiale)
  // `useRef` plutôt que `autoFocus` : l'attribut ne sélectionne pas le texte, et un renommage
  // commence presque toujours par tout remplacer.
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    champ.current?.select()
  }, [])

  function terminer() {
    const propre = valeur.trim()
    if (propre === '' || propre === valeurInitiale) onAnnuler()
    else onValider(propre)
  }

  return (
    <input
      ref={champ}
      className={styles.champ}
      value={valeur}
      aria-label={`Nouveau nom de ${valeurInitiale}`}
      /* **Aucune assistance à la saisie, et les quatre comptent.** Ce qu'on tape ici est un
         identifiant — un nom de connexion, un nom de console — pas une phrase. macOS corrigeait
         « analytics_v2 » en autre chose, mettait une capitale en tête et soulignait le mot en rouge ;
         WKWebView applique ces réglages système, donc un renommage pouvait enregistrer un nom que
         personne n'avait tapé. `autoComplete` en plus : le navigateur proposait d'anciennes valeurs
         de champs sans rapport, par-dessus la ligne d'arbre. */
      autoCorrect="off"
      autoCapitalize="off"
      autoComplete="off"
      spellCheck={false}
      onChange={(evenement) => setValeur(evenement.target.value)}
      onBlur={terminer}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Enter') {
          /* **`preventDefault` avant de valider, et ce n'est pas une précaution de style.** Le
             comportement par défaut d'un `Enter` est d'activer le contrôle focalisé — *après* que
             les gestionnaires ont tourné. Si la validation ouvre une fenêtre, celle-ci prend le
             focus dans le même flux, et l'activation retombe sur son premier bouton : la modale de
             rapport de `26` se refermait ainsi par sa croix, dans le même geste qui l'ouvrait, et
             son refus n'était jamais lisible. Trouvé en e2e — jsdom ne rejoue pas cette activation
             par défaut, donc aucun test unitaire ne pouvait le voir. */
          evenement.preventDefault()
          terminer()
        }
        if (evenement.key === 'Escape') onAnnuler()
        // L'hôte ne doit pas voir ces touches : `Entrée` activerait la ligne ou l'onglet, et les
        // flèches déplaceraient la sélection au lieu du curseur dans le texte.
        evenement.stopPropagation()
      }}
      // Un clic dans le champ ne doit pas activer ce qu'il recouvre.
      onClick={(evenement) => evenement.stopPropagation()}
      onDoubleClick={(evenement) => evenement.stopPropagation()}
    />
  )
}
