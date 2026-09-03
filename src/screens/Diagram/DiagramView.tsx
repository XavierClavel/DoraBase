import { type PointerEvent as PointerEventReact, useId, useMemo, useRef, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import { useT } from '../../i18n/LanguageContext'
import { cx } from '../../ui/cx'
import { SANS_CORRECTION } from '../../ui/Field/Field'
import { Toggle } from '../../ui/Toggle/Toggle'
import styles from './DiagramView.module.css'
import {
  type Boite,
  comptesDeLiens,
  disposition,
  type EntreeDeTable,
  HAUTEUR_ENTETE,
  HAUTEUR_LIGNE,
  idDeTable,
  type Lien,
} from './disposition'

/**
 * Les paliers de zoom.
 *
 * **Des paliers et non un curseur continu** : ce qu'on demande à un diagramme est « tout voir » ou
 * « lire les noms », et deux boutons y mènent en un clic là où un curseur demande une visée. Le
 * plancher tient un schéma d'une trentaine de tables dans la fenêtre ; en dessous, plus rien ne se
 * lit, et une vue d'ensemble illisible n'est pas une vue d'ensemble.
 */
const PALIERS_DE_ZOOM = [0.4, 0.55, 0.7, 0.85, 1, 1.25, 1.5] as const
const ZOOM_NEUTRE = PALIERS_DE_ZOOM.indexOf(1)

export type DiagramViewProps = {
  schema: string
  /**
   * Les structures **déjà lues**. La vue dessine ce qu'elle a ; la barre d'état dit ce qui manque.
   *
   * Attendre le schéma entier laisserait l'écran vide pendant toute la lecture — une table par
   * aller-retour —, alors que les premières boîtes sont déjà utiles. C'est l'arbitrage de « l'arbre
   * se lit sans réseau » : montrer ce qu'on sait, marquer ce qu'on ignore.
   */
  tables: readonly EntreeDeTable[]
  /** Le nombre de tables du schéma, pour que la barre d'état dise ce qui reste à lire. */
  total: number
  loading?: boolean
  error?: string | null
  /**
   * Ouvre une table dans un onglet de données — double-clic sur une boîte, `Entrée` au clavier.
   *
   * Absent, la boîte reste sélectionnable : le diagramme sert alors à lire, ce qui est son premier
   * usage, et rien ne promet un geste qui ne répondrait pas (défaut n° 36).
   */
  onOuvrirLaTable?: (table: string) => void
}

/**
 * Le diagramme de structure d'un schéma : une boîte par table, un trait coudé par clé étrangère.
 *
 * # Ce qu'il ajoute à ce que le produit montrait déjà
 *
 * `A9` décrit **une** table, et son bloc « Relations » nomme celles qu'elle touche ; l'arbre liste
 * les tables sans jamais dire ce qui les relie. La forme d'un schéma — quelles tables sont au
 * centre, lesquelles sont des feuilles, où sont les cycles — n'était donc lisible nulle part, alors
 * que c'est la première question qu'on se pose devant une base qu'on ne connaît pas.
 *
 * # Pourquoi des boîtes en HTML et des liens en SVG
 *
 * Tout en SVG aurait demandé de réinventer ce que le navigateur donne : l'ellipse d'un nom trop
 * long, le survol, le focus, un rôle et un nom accessible. Or ces boîtes sont **cliquables** — un
 * diagramme dont on ne peut pas ouvrir une table est une image. Elles sont donc des éléments
 * ordinaires, posés aux coordonnées que `disposition` a calculées, et le SVG ne porte que ce que le
 * HTML ne sait pas dessiner : des traits coudés. C'est aussi ce qui rend le contenu vérifiable par
 * `getByRole` plutôt qu'en comptant des pixels.
 *
 * # Le zoom est à boutons, et c'est délibéré
 *
 * La molette **défile**, elle ne zoome pas. `⌘` + molette appartient au zoom de l'application
 * (`useZoom`), et le pincement du trackpad y est refusé activement depuis le 26 août 2026 : un
 * second zoom sur les mêmes gestes ferait dépendre l'échelle de qui écoute l'événement le premier.
 * Les paliers sont donc explicites, et le glissement du fond déplace la vue.
 */
export function DiagramView({
  schema,
  tables,
  total,
  loading = false,
  error = null,
  onOuvrirLaTable,
}: DiagramViewProps) {
  const t = useT()
  /**
   * Montrer toutes les colonnes, ou l'aperçu.
   *
   * **Un interrupteur, et non plus un contrôle segmenté « Clés | Toutes ».** Les deux mots ne
   * disaient pas ce que le réglage *fait* : on lisait « Clés » comme un filtre sur une nature de
   * colonne, sans comprendre que des lignes étaient **masquées**. Un interrupteur nommé « Toutes les
   * colonnes » l'annonce par sa forme même — éteint, il en manque —, et la ligne « + n autres » de
   * chaque boîte dit combien. Rapporté à l'usage.
   */
  const [toutesLesColonnes, setToutesLesColonnes] = useState(false)
  const [palier, setPalier] = useState(ZOOM_NEUTRE)
  /**
   * La table choisie, **par identité et non par nom** : c'est déjà celle que les liens emploient,
   * et en tenir une seconde forme aurait demandé de les traduire à chaque comparaison.
   */
  const [choisie, setChoisie] = useState<string | null>(null)
  /**
   * Ce qu'on cherche — un nom de table **ou** de colonne.
   *
   * Les deux, parce que ce sont les deux questions qu'on pose à un schéma : « où est `orders` ? » et
   * « qui porte un `deleted_at` ? ». La seconde n'avait aucune réponse dans le produit : l'arbre ne
   * filtre que des libellés, et la vue Structure ne cherche que dans **une** table.
   */
  const [recherche, setRecherche] = useState('')
  /** Le rang de la correspondance qu'`Entrée` amènera à l'écran — voir `allerA`. */
  const visee = useRef(0)
  const toile = useRef<HTMLDivElement>(null)
  /** Le préfixe des flèches : deux diagrammes ouverts partageraient sinon leurs `marker`. */
  const marques = useId().replace(/:/g, '')

  const vue = useMemo(
    () =>
      disposition(tables, {
        toutesLesColonnes,
        libelleDuReste: (compte) => t('diagram.boite.reste', { count: compte }),
      }),
    [tables, toutesLesColonnes, t],
  )

  const echelle = PALIERS_DE_ZOOM[palier] ?? 1

  /**
   * Ce que la recherche désigne : des tables, et les colonnes qui l'ont fait correspondre.
   *
   * # Depuis les structures, non depuis le dessin
   *
   * Les boîtes ne portent que les colonnes **visibles** — l'aperçu en masque au-delà de huit — et
   * chercher là-dedans aurait rendu « aucun résultat » pour une colonne qui existe. La recherche
   * porte donc sur `tables`, qui est la donnée complète ; c'est le rendu qui se contente de marquer
   * ce qu'il montre.
   *
   * **Conséquence assumée** : une table peut correspondre par une colonne que l'aperçu masque. Elle
   * est alors marquée sans qu'on voie pourquoi — et l'interrupteur « Toutes les colonnes » est juste
   * à côté. Le contraire, ne pas la marquer, serait taire une réponse juste.
   */
  const correspondances = useMemo(() => {
    const cherche = recherche.trim().toLowerCase()
    if (cherche === '') return { tables: new Set<string>(), colonnes: new Set<string>() }
    const trouvees = new Set<string>()
    const colonnes = new Set<string>()
    for (const table of tables) {
      const id = idDeTable(table.schema, table.name)
      if (table.name.toLowerCase().includes(cherche)) trouvees.add(id)
      for (const colonne of table.columns) {
        if (!colonne.name.toLowerCase().includes(cherche)) continue
        trouvees.add(id)
        colonnes.add(`${id}.${colonne.name}`)
      }
    }
    return { tables: trouvees, colonnes }
  }, [tables, recherche])

  /** Les tables trouvées, dans l'ordre du dessin : c'est celui qu'`Entrée` parcourt. */
  const trouvees = useMemo(
    () => vue.boites.filter((boite) => correspondances.tables.has(boite.id)),
    [vue.boites, correspondances],
  )
  const chercheQuelqueChose = recherche.trim() !== ''

  /**
   * Amène la correspondance suivante à l'écran.
   *
   * # Pourquoi `Entrée` et non la frappe
   *
   * Faire défiler à chaque caractère déplacerait le dessin sous les yeux de celui qui tape, et sur
   * une toile de plusieurs milliers de pixels c'est désorientant. La frappe **marque** donc, et
   * `Entrée` **emmène** : le compte affiché à côté du champ dit d'avance s'il y a quelque part où
   * aller. C'est le geste d'un « chercher » ordinaire.
   *
   * # Ce que jsdom ne peut pas voir
   *
   * `scrollIntoView` n'existe pas sans mise en page (règle n° 9) : ce que Vitest garde est le
   * marquage et le compte, et c'est un test de bout en bout qui vérifie que la vue se déplace.
   */
  function allerA(rang: number) {
    const boite = trouvees[((rang % trouvees.length) + trouvees.length) % trouvees.length]
    if (!boite) return
    // **Désigner d'abord, déplacer ensuite.** La désignation est ce que le geste *veut* — elle
    // allume les liens et les colonnes de la table trouvée — et le défilement n'en est que la
    // courtoisie. Dans l'autre ordre, un défilement qui échoue emporterait la désignation avec lui.
    setChoisie(boite.id)
    const zone = toile.current
    const element = zone?.querySelector(`[data-boite="${CSS.escape(boite.table)}"]`)
    element?.scrollIntoView({ block: 'center', inline: 'center' })
  }

  /**
   * Les colonnes que la sélection met en évidence, **aux deux bouts de chaque lien**.
   *
   * Surligner les traits ne suffisait pas : ils disent *qu'*une table en référence une autre, pas
   * **par quelle colonne**, et c'est justement la question qu'on se pose en choisissant une boîte.
   * Marquer les deux bouts — la clé étrangère chez celle qui référence, la colonne référencée chez
   * l'autre — fait lire la relation d'un coup d'œil, sans suivre le trait jusqu'à sa pointe.
   *
   * L'identité est `table.colonne`, celle des liens : deux tables du dessin peuvent avoir une
   * colonne `id`, et une clé indexée par le seul nom de colonne les allumerait toutes les deux.
   */
  const enEvidence = useMemo(() => {
    const marquees = new Set<string>()
    if (choisie === null) return marquees
    for (const lien of vue.liens) {
      if (lien.source !== choisie && lien.cible !== choisie) continue
      for (const colonne of lien.colonnes) marquees.add(`${lien.source}.${colonne}`)
      for (const colonne of lien.colonnesCibles) marquees.add(`${lien.cible}.${colonne}`)
    }
    return marquees
  }, [choisie, vue.liens])

  /**
   * Le glissement du fond déplace la vue.
   *
   * **Depuis le fond seulement.** Un glissement qui partirait d'une boîte devrait distinguer un
   * déplacement d'un clic par un seuil de mouvement, et un seuil mal réglé fait rater soit les
   * clics, soit les déplacements. Le fond occupe l'essentiel de la toile, et la molette comme les
   * barres de défilement restent là pour le reste.
   *
   * **La cible se reconnaît par `data-boite`, pas par la classe.** Une classe de module CSS est un
   * nom engendré : l'employer dans un sélecteur ferait dépendre le geste de la façon dont l'outil
   * de construction la compose.
   */
  function auPointeur(evenement: PointerEventReact<HTMLDivElement>) {
    const zone = toile.current
    if (!zone) return
    if (evenement.target instanceof Element && evenement.target.closest('[data-boite]')) return
    const depart = {
      x: evenement.clientX,
      y: evenement.clientY,
      left: zone.scrollLeft,
      top: zone.scrollTop,
    }
    zone.setPointerCapture(evenement.pointerId)

    const bouger = (mouvement: PointerEvent) => {
      zone.scrollLeft = depart.left - (mouvement.clientX - depart.x)
      zone.scrollTop = depart.top - (mouvement.clientY - depart.y)
    }
    const lacher = () => {
      zone.releasePointerCapture(evenement.pointerId)
      zone.removeEventListener('pointermove', bouger)
      zone.removeEventListener('pointerup', lacher)
      zone.removeEventListener('pointercancel', lacher)
    }
    zone.addEventListener('pointermove', bouger)
    zone.addEventListener('pointerup', lacher)
    zone.addEventListener('pointercancel', lacher)
  }

  if (error) {
    return (
      <div className={styles.root}>
        <p className={styles.vide}>{error}</p>
      </div>
    )
  }
  if (vue.boites.length === 0) {
    return (
      <div className={styles.root}>
        {/* **« Aucune table » et « pas encore lu » ne sont pas le même état**, comme « jamais
            tentée » n'est pas « hors ligne » pour une connexion. Un schéma vide est un fait ; une
            lecture en cours est une attente, et elle dit où elle en est. */}
        <p className={styles.vide}>
          {total === 0 && !loading
            ? t('diagram.vide.aucuneTable', { schema })
            : t('diagram.vide.lecture', { lues: tables.length, total })}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.barre}>
        {/* **`Toggle` de `ui/` et un libellé posé ici**, plutôt que le `ToggleWithLabel` de `A2` :
            celui-là habille l'interrupteur avec la feuille de style de son écran, et l'importer
            ferait dépendre le diagramme du CSS du formulaire de connexion. La raison pour laquelle
            le `<span>` n'est pas un `<label>` est la sienne, en revanche, et elle vaut ici : le nom
            accessible vient déjà de l'`aria-label` du bouton, et un `<label for>` sur un
            `role="switch"` le doublerait dans l'annonce. */}
        <span className={styles.reglage}>
          <Toggle
            checked={toutesLesColonnes}
            onCheckedChange={setToutesLesColonnes}
            label={t('diagram.colonnes.toutes')}
          />
          <span className={cx(styles.reglageNom, !toutesLesColonnes && styles.reglageNomEteint)}>
            {t('diagram.colonnes.toutes')}
          </span>
        </span>
        {/*
          **Le témoin de lecture, là où le regard est.**

          La barre d'état dit *où en est* la lecture — « 3 / 7 tables lues » — mais elle court sous
          les trois colonnes de l'écran, à vingt-six pixels du bas : on ne la regarde pas en
          attendant un dessin. Le témoin dit donc seulement **que** ça travaille, à côté du réglage,
          et laisse le compte à la barre. Les deux ne se répètent pas, ils répondent à deux
          questions.

          C'est la convention de la première animation du produit (`Toolbar`), à ceci près qu'aucun
          contrôle n'a été actionné : rien n'est donc à désactiver, et l'`aria-live` reste celui de
          la barre d'état — deux régions qui s'annoncent pour la même chose parleraient l'une sur
          l'autre.
        */}
        {loading && (
          <span className={styles.chargement}>
            <Icon name="refresh" size={12} strokeWidth={2} className={styles.tourne} />
            {t('diagram.chargement')}
          </span>
        )}
        {/* **Le champ suit l'idiome du fil d'Ariane** — même hauteur, même icône, même
            `SANS_CORRECTION` : macOS transformerait `orders` en `Orders` et la recherche ne
            trouverait plus rien. */}
        <label className={styles.chercher}>
          <Icon name="search" size={12} strokeWidth={2} className={styles.chercherIcone} />
          <input
            {...SANS_CORRECTION}
            type="text"
            className={styles.chercherChamp}
            value={recherche}
            placeholder={t('diagram.recherche.placeholder')}
            aria-label={t('diagram.recherche.label')}
            onChange={(evenement) => {
              setRecherche(evenement.target.value)
              // Une frappe repart de la première correspondance : sans cela, `Entrée` reprendrait au
              // rang d'une recherche précédente, donc au milieu d'une liste que l'utilisateur ne
              // connaît pas.
              visee.current = 0
            }}
            onKeyDown={(evenement) => {
              if (evenement.key !== 'Enter' || trouvees.length === 0) return
              evenement.preventDefault()
              allerA(visee.current)
              visee.current += 1
            }}
          />
          {/* **Le compte, et « aucune » quand il n'y a rien** : le champ ne doit pas laisser croire
              qu'il cherche encore. `aria-live` parce que la valeur change sous la frappe, sans que
              le focus bouge. */}
          {chercheQuelqueChose && (
            <span className={styles.chercherCompte} aria-live="polite">
              {trouvees.length === 0
                ? t('diagram.recherche.aucune')
                : t('diagram.recherche.compte', { count: trouvees.length })}
            </span>
          )}
        </label>
        <span className={styles.espace} />
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.bouton}
            aria-label={t('diagram.zoom.moins')}
            disabled={palier === 0}
            onClick={() => setPalier((rang) => Math.max(0, rang - 1))}
          >
            <span aria-hidden="true">−</span>
          </button>
          {/* Le pourcentage **est** le bouton du retour à l'échelle 1 : un troisième bouton pour
              une valeur déjà affichée aurait pris de la place pour la répéter. */}
          <button
            type="button"
            className={styles.echelle}
            aria-label={t('diagram.zoom.reinitialiser', { pourcentage: Math.round(echelle * 100) })}
            onClick={() => setPalier(ZOOM_NEUTRE)}
          >
            {Math.round(echelle * 100)} %
          </button>
          <button
            type="button"
            className={styles.bouton}
            aria-label={t('diagram.zoom.plus')}
            disabled={palier === PALIERS_DE_ZOOM.length - 1}
            onClick={() => setPalier((rang) => Math.min(PALIERS_DE_ZOOM.length - 1, rang + 1))}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      {/* **Un `pointerdown` sur un élément sans rôle, et sans suppression de règle.** Biome ne s'en
          plaint pas — la règle ne couvre pas les événements de pointeur —, et une suppression posée
          « au cas où » avait été signalée comme inutile. Le fait qui compte est que ce geste
          **double** le défilement plutôt que de le remplacer : la zone est atteignable par sa barre
          de défilement et les flèches l'y déplacent, donc rien n'est réservé à la souris. Un
          `role="application"` avalerait au contraire les touches du navigateur. */}
      <div className={styles.toile} data-toile="" ref={toile} onPointerDown={auPointeur}>
        {/* Deux cadres, et il en faut deux : `transform` ne change pas la place qu'un élément
            occupe dans la mise en page, donc la zone défilante ne verrait rien du zoom. Celui de
            l'extérieur porte la taille mise à l'échelle, celui de l'intérieur les coordonnées du
            calcul — ce qui garde `disposition` indépendante de l'échelle. */}
        <div
          className={styles.cadre}
          style={{ width: vue.largeur * echelle, height: vue.hauteur * echelle }}
        >
          <div
            className={styles.plan}
            style={{
              width: vue.largeur,
              height: vue.hauteur,
              transform: echelle === 1 ? undefined : `scale(${echelle})`,
            }}
          >
            {/* `data-liens` plutôt que la classe : celle d'un module CSS est un nom engendré, et
                un test qui s'y accrocherait mesurerait l'outil de construction. Le repère existe
                pour la même raison que `data-boite`. */}
            <svg
              className={styles.liens}
              data-liens=""
              width={vue.largeur}
              height={vue.hauteur}
              aria-hidden="true"
            >
              <defs>
                {/* Deux marques plutôt qu'un `context-stroke`, qui hériterait du trait du chemin :
                    son support sous le plancher Safari 16.4 n'a pas été mesuré, et une flèche qui
                    disparaît est un lien qui ne dit plus dans quel sens il va. */}
                <Fleche id={`${marques}-fleche`} className={styles.pointe} />
                <Fleche id={`${marques}-fleche-choisie`} className={styles.pointeChoisie} />
              </defs>
              {vue.liens.map((lien) => {
                const touche =
                  choisie !== null && (lien.source === choisie || lien.cible === choisie)
                /* **Un lien s'éteint quand la recherche ne concerne aucun de ses bouts.** Sans
                   cela, les traits gardent toute leur force au-dessus de boîtes éteintes et
                   dominent le dessin — l'inverse de ce qu'une recherche doit produire. */
                const eteint =
                  chercheQuelqueChose &&
                  !correspondances.tables.has(lien.source) &&
                  !correspondances.tables.has(lien.cible)
                return (
                  <path
                    key={lien.id}
                    d={lien.chemin}
                    className={cx(
                      styles.lien,
                      touche && styles.lienChoisi,
                      eteint && styles.lienEteint,
                    )}
                    markerEnd={`url(#${marques}-fleche${touche ? '-choisie' : ''})`}
                  />
                )
              })}
            </svg>
            {vue.boites.map((boite) => (
              <Cadre
                key={boite.id}
                boite={boite}
                liens={vue.liens}
                choisie={choisie === boite.id}
                enEvidence={enEvidence}
                trouvee={correspondances.tables.has(boite.id)}
                eteinte={chercheQuelqueChose && !correspondances.tables.has(boite.id)}
                colonnesTrouvees={correspondances.colonnes}
                // **Choisir bascule.** Un second clic relâche, ce qui rend `aria-pressed` vrai des
                // deux côtés et donne le moyen d'éteindre le surlignage sans viser le fond.
                onChoisir={() => setChoisie((deja) => (deja === boite.id ? null : boite.id))}
                onOuvrir={onOuvrirLaTable}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** La pointe d'un lien : un chevron **en trait**, comme toutes les icônes du projet. */
function Fleche({ id, className }: { id: string; className: string | undefined }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto"
    >
      <path d="M2 2 L8 5 L2 8" className={className} />
    </marker>
  )
}

/**
 * Une table dessinée.
 *
 * **Un `role="button"` sur un `div`, plutôt qu'un vrai `<button>`** : le contenu d'un bouton doit
 * être du contenu de phrasé, et une boîte est une pile de lignes. Le rôle porté explicitement donne
 * la même sémantique — et c'est lui qui rend `aria-label` opérant, un `aria-label` sur un élément
 * sans rôle étant ignoré (piège n° 2). Même arbitrage que `Chip`, pour la même raison.
 *
 * **Le nom accessible vient d'`aria-label`, non du contenu.** Concaténé, celui-ci rendrait
 * « ordersidint8placed_attimestamptz… » : le piège n° 1 dans sa forme extrême, qu'aucune espace
 * explicite n'arrangerait — ce ne sont pas les espaces qui manquent, c'est un nom. Il dit donc ce
 * que la boîte *est* : une table, son compte de colonnes, son compte de liens. Les colonnes se
 * lisent à l'intérieur.
 */
function Cadre({
  boite,
  liens,
  choisie,
  enEvidence,
  trouvee,
  eteinte,
  colonnesTrouvees,
  onChoisir,
  onOuvrir,
}: {
  boite: Boite
  liens: readonly Lien[]
  choisie: boolean
  /** Les `table.colonne` que la sélection éclaire — voir `enEvidence` chez l'appelant. */
  enEvidence: ReadonlySet<string>
  /** La recherche désigne cette table. */
  trouvee: boolean
  /** Une recherche est en cours et ne la désigne pas. */
  eteinte: boolean
  /** Les `table.colonne` que la recherche a fait correspondre. */
  colonnesTrouvees: ReadonlySet<string>
  onChoisir: () => void
  onOuvrir?: (table: string) => void
}) {
  const t = useT()
  const attaches = liens.filter((lien) => lien.source === boite.id || lien.cible === boite.id)
  /** Ce qu'une colonne de cette table référence, quand elle référence quelque chose. */
  const cibleDe = (column: string) =>
    liens.find((lien) => lien.source === boite.id && lien.colonnes.includes(column))

  return (
    // biome-ignore lint/a11y/useSemanticElements: un <button> n'accepte pas une pile de lignes, voir ci-dessus
    <div
      role="button"
      tabIndex={0}
      data-boite={boite.table}
      className={cx(
        styles.boite,
        choisie && styles.boiteChoisie,
        /* **La marque de recherche et la sélection sont deux choses**, et se distinguent par leur
           teinte : `--info` pour ce qu'on a cherché, l'accent pour ce qu'on a désigné. Une seule
           couleur pour les deux aurait fait lire « trouvée » comme « choisie », alors qu'`Entrée`
           fait bel et bien les deux à la fois. */
        trouvee && styles.boiteTrouvee,
        eteinte && styles.boiteEteinte,
      )}
      style={{ left: boite.x, top: boite.y, width: boite.width, height: boite.height }}
      aria-label={t('diagram.boite.label', {
        table: boite.table,
        colonnes: boite.lignes.filter((ligne) => ligne.sorte === 'colonne').length,
        liens: attaches.length,
      })}
      aria-pressed={choisie}
      /* **`detail === 1`, et ce n'est pas une précaution.** Un double-clic émet *deux* clics avant
         le sien : sans cette garde, la bascule jouait deux fois, si bien que la boîte qu'on venait
         d'ouvrir repartait **non choisie** et que le surlignage de ses liens s'allumait puis
         s'éteignait le temps d'un rendu. Avec elle, seul le premier clic compte : la table s'ouvre
         et la boîte reste choisie, ce qu'on attend de ce qu'on vient de désigner. Mesuré en
         écrivant le test — c'est lui qui a dit lequel des deux comportements sortait. */
      onClick={(evenement) => {
        if (evenement.detail > 1) return
        onChoisir()
      }}
      onDoubleClick={() => onOuvrir?.(boite.table)}
      onKeyDown={(evenement) => {
        // **`Entrée` ouvre, `Espace` choisit.** Le double-clic est le geste de la souris ; un geste
        // qui n'existerait qu'au double-clic serait invisible et inatteignable au clavier, ce que
        // le renommage des consoles a déjà tranché.
        if (evenement.key === 'Enter') {
          evenement.preventDefault()
          onOuvrir?.(boite.table)
        }
        if (evenement.key === ' ') {
          evenement.preventDefault()
          onChoisir()
        }
      }}
    >
      <div className={styles.tete} style={{ height: HAUTEUR_ENTETE }}>
        <Icon name="table" size={11} strokeWidth={1.8} className={styles.teteIcone} />
        <span className={styles.teteNom}>{boite.table}</span>
      </div>
      {boite.lignes.map((ligne) =>
        ligne.sorte === 'reste' ? (
          <div key="reste" className={styles.reste} style={{ height: HAUTEUR_LIGNE }}>
            {ligne.texte}
          </div>
        ) : (
          <div
            key={ligne.column}
            className={cx(
              styles.ligne,
              enEvidence.has(`${boite.id}.${ligne.column}`) && styles.ligneEnEvidence,
              colonnesTrouvees.has(`${boite.id}.${ligne.column}`) && styles.ligneTrouvee,
            )}
            /* **Le repère qui rend « le calcul tombe où le rendu tombe » vérifiable.** jsdom ne
               calcule aucune mise en page : que la ligne d'une colonne soit *réellement* au pixel où
               `disposition` a ancré son lien ne se mesure qu'en bout de chaîne, dans un navigateur.
               Ce repère est ce qui permet d'y désigner une ligne précise sans s'accrocher à un nom
               de classe engendré. */
            data-colonne={ligne.column}
            style={{ height: HAUTEUR_LIGNE }}
            /* **Une seule infobulle par ligne, qui la décrit en entier.** Le type est coupé par
               l'ellipse dès qu'il est long, la nullité n'a pas la place de s'écrire, et ce qu'une
               clé étrangère vise n'est lisible qu'en suivant le trait des yeux. Elle *décrit*, elle
               ne nomme pas : c'est un `title`, pas un `aria-label` (piège n° 4). */
            title={descriptionDeLigne(t, ligne.typeName, ligne.nullable, cibleDe(ligne.column))}
          >
            {ligne.key !== null && (
              <Icon
                name={ligne.key === 'primary' ? 'key' : 'fk'}
                size={9}
                strokeWidth={2}
                className={ligne.key === 'primary' ? styles.cle : styles.cleEtrangere}
              />
            )}
            <span
              className={cx(
                styles.nom,
                ligne.key === 'primary' && styles.nomCle,
                ligne.key === null && styles.nomSansCle,
              )}
            >
              {ligne.column}
            </span>
            <span className={styles.type}>{ligne.typeName}</span>
          </div>
        ),
      )}
    </div>
  )
}

/**
 * Une liste de noms lisible dans une infobulle.
 *
 * **Bornée à trente** : au-delà, une infobulle cesse d'être une infobulle. Ce qui compte est de
 * pouvoir répondre « lesquelles ? » — les trente premières et leur compte y suffisent, et le tri par
 * nom rend la suite devinable.
 */
function listeCourte(noms: readonly string[]): string {
  const PREMIERES = 30
  if (noms.length <= PREMIERES) return noms.join(', ')
  return `${noms.slice(0, PREMIERES).join(', ')}… (+ ${noms.length - PREMIERES})`
}

/** Le texte de l'infobulle d'une ligne : son type, sa nullité, et ce qu'elle référence. */
function descriptionDeLigne(
  t: ReturnType<typeof useT>,
  typeName: string,
  nullable: boolean,
  vers: Lien | undefined,
): string {
  const nullite = nullable ? t('diagram.ligne.nullable') : t('diagram.ligne.nonNullable')
  const base = `${typeName} · ${nullite}`
  if (!vers) return base
  return `${base} · ${t('diagram.ligne.reference', {
    cible: `${vers.cible}.${vers.colonnesCibles[0] ?? ''}`,
  })}`
}

/**
 * Le pied du diagramme.
 *
 * **Séparé de la vue**, comme `StructureStatusBar` l'est de `StructureView` : la barre d'état court
 * sous les trois colonnes de l'écran de travail, pas sous le centre. Le même partage, pour la même
 * raison.
 *
 * **Il recompte les liens plutôt que de les recevoir**, par `comptesDeLiens` — la même règle sans
 * la géométrie. La vue tient l'échelle et le mode d'affichage des colonnes, qui ne changent aucun
 * de ces nombres ; les faire remonter aurait couplé le pied à l'état interne du centre pour deux
 * entiers.
 *
 * Les liens dont l'autre bout n'est pas dans ce schéma ne sont pas tracés, faute de boîte où
 * arriver ; les tables au-delà du plafond ne sont pas demandées. **Les deux sont dits** : un
 * diagramme amputé en silence se lirait comme un schéma complet, ce qui est le pire défaut que
 * cette vue puisse avoir.
 */
export function DiagramStatusBar({
  tables,
  demandees,
  total,
  omises = [],
  loading = false,
}: {
  tables: readonly EntreeDeTable[]
  /** Les tables que le diagramme demande — `total` borné par le plafond de `useDiagramme`. */
  demandees: number
  /** Les tables du schéma. */
  total: number
  /** Celles que le plafond a écartées, pour que l'infobulle les **nomme**. */
  omises?: readonly string[]
  loading?: boolean
}) {
  const t = useT()
  const { liens, liensExternes } = useMemo(() => comptesDeLiens(tables), [tables])

  /**
   * Le premier morceau répond à « ce que je vois est-il tout ce qu'il y a ? », et il a **trois**
   * réponses, pas deux : la lecture n'est pas finie, elle l'est mais le schéma déborde du plafond,
   * ou elle l'est et le dessin est complet. Fondre les deux dernières laisserait « 60 / 128 » à
   * l'écran pour toujours, ce qui se lit comme une lecture qui n'aboutit pas.
   */
  const avancement =
    loading || tables.length < demandees
      ? t('diagram.statusBar.lues', { lues: tables.length, total: demandees })
      : demandees < total
        ? t('diagram.statusBar.plafonnees', { montrees: demandees, total })
        : t('diagram.statusBar.tables', { count: tables.length })

  const morceaux = [
    avancement,
    t('diagram.statusBar.liens', { count: liens }),
    liensExternes > 0 ? t('diagram.statusBar.externes', { count: liensExternes }) : null,
  ].filter((morceau): morceau is string => morceau !== null)

  return (
    <div className={styles.pied} role="status" aria-label={t('diagram.statusBar.ariaLabel')}>
      {morceaux.map((morceau, rang) => (
        <span
          key={morceau}
          // Le plafond est un choix, pas un incident : l'infobulle en donne la raison, là où la
          // bande de 26 px n'a la place que du nombre.
          /* **L'infobulle nomme ce qui manque**, et ne se contente pas d'en donner la raison.
             « soixante des cent vingt-quatre tables » a suscité la bonne question — « lesquelles ne
             sont pas affichées ? » — à laquelle l'écran ne savait pas répondre. Un compte dit qu'il
             manque quelque chose ; une liste dit quoi. */
          title={
            morceau === avancement && demandees < total
              ? t('diagram.statusBar.plafonneesRaison', {
                  plafond: demandees,
                  omises: listeCourte(omises),
                })
              : undefined
          }
        >
          {rang > 0 && <span className={styles.piedPoint}>·</span>}
          {morceau}
        </span>
      ))}
    </div>
  )
}
