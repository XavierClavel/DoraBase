import { describe, expect, it } from 'vitest'
import type { ColumnInfo, Relation } from '../../domain/engine'
import {
  type Boite,
  cheminEntre,
  type Disposition,
  disposition,
  type EntreeDeTable,
  type Etape,
  idDeTable,
  LARGEUR_BOITE_MAX,
  LARGEUR_BOITE_MIN,
  type Lien,
} from './disposition'

/**
 * Le décor de ces tests **distingue ce qui pourrait se confondre** (règles n° 5 et n° 18).
 *
 * Trois pièges y sont désamorcés exprès :
 *
 * - **les colonnes d'une clé n'ont pas le même rang de part et d'autre.** Si `orders.user_id` était
 *   en position 1 comme `users.id`, une ancre inversée donnerait le même pixel et l'inversion
 *   passerait — c'est le défaut du 10 août 2026 côté Rust, où `users.id` et `orders.id` étaient tous
 *   deux en position 1 ;
 * - **les noms de tables ne se trient pas dans l'ordre des couches.** `users` vient après
 *   `order_items` par l'alphabet et avant lui par le graphe : un placement qui se contenterait de
 *   trier par nom rendrait l'inverse ;
 * - **les types ont des longueurs franchement différentes**, sans quoi une largeur calculée sur le
 *   mauvais champ mesurerait la même chose.
 */
function colonne(partiel: Partial<ColumnInfo> & Pick<ColumnInfo, 'position' | 'name'>): ColumnInfo {
  return {
    typeName: 'int8',
    category: 'number',
    nullable: false,
    default: null,
    identity: null,
    key: null,
    comment: null,
    frequency: null,
    ...partiel,
  }
}

function sortante(
  contrainte: string,
  colonne: string,
  cible: string,
  schemaCible = 'public',
  colonneCible = 'id',
): Relation {
  return {
    constraintName: contrainte,
    direction: 'outgoing',
    columns: [colonne],
    targetSchema: schemaCible,
    targetTable: cible,
    targetColumns: [colonneCible],
  }
}

function entrante(
  contrainte: string,
  colonne: string,
  source: string,
  colonneSource: string,
): Relation {
  return {
    constraintName: contrainte,
    direction: 'incoming',
    columns: [colonne],
    targetSchema: 'public',
    targetTable: source,
    targetColumns: [colonneSource],
  }
}

const USERS: EntreeDeTable = {
  schema: 'public',
  name: 'users',
  columns: [
    colonne({ position: 1, name: 'id', key: 'primary' }),
    colonne({ position: 2, name: 'email', typeName: 'text' }),
  ],
  relations: [],
}

const ORDERS: EntreeDeTable = {
  schema: 'public',
  name: 'orders',
  columns: [
    colonne({ position: 1, name: 'id', key: 'primary' }),
    colonne({ position: 2, name: 'placed_at', typeName: 'timestamptz' }),
    colonne({ position: 3, name: 'user_id', key: 'foreign' }),
  ],
  relations: [sortante('orders_user_id_fkey', 'user_id', 'users')],
}

const ORDER_ITEMS: EntreeDeTable = {
  schema: 'public',
  name: 'order_items',
  columns: [
    colonne({ position: 1, name: 'id', key: 'primary' }),
    colonne({ position: 2, name: 'order_id', key: 'foreign' }),
  ],
  relations: [sortante('order_items_order_id_fkey', 'order_id', 'orders')],
}

const TROIS = [ORDER_ITEMS, ORDERS, USERS]

function boite(vue: Disposition, table: string): Boite {
  const trouvee = vue.boites.find((candidate) => candidate.table === table)
  if (!trouvee) throw new Error(`aucune boîte pour ${table}`)
  return trouvee
}

function lien(vue: Disposition, contrainte: string): Lien {
  const trouve = vue.liens.find((candidat) => candidat.contrainte === contrainte)
  if (!trouve) throw new Error(`aucun lien pour ${contrainte}`)
  return trouve
}

/** L'ordonnée d'une ligne de colonne, en coordonnées de la toile. */
function ordonneeDe(cadre: Boite, column: string): number {
  const ligne = cadre.lignes.find(
    (candidate) => candidate.sorte === 'colonne' && candidate.column === column,
  )
  if (!ligne) throw new Error(`${column} n’est pas une ligne visible de ${cadre.table}`)
  return cadre.y + ligne.y
}

describe('les couches', () => {
  it('place une table à gauche de celles qu’elle référence', () => {
    const vue = disposition(TROIS)

    expect(boite(vue, 'order_items').couche).toBe(0)
    expect(boite(vue, 'orders').couche).toBe(1)
    expect(boite(vue, 'users').couche).toBe(2)
    // La couche décide l'abscisse, et rien d'autre ne doit pouvoir l'inverser.
    expect(boite(vue, 'order_items').x).toBeLessThan(boite(vue, 'orders').x)
    expect(boite(vue, 'orders').x).toBeLessThan(boite(vue, 'users').x)
  })

  it('ne dépend pas de l’ordre dans lequel les tables arrivent', () => {
    // Les structures arrivent une par une, dans l'ordre où le serveur répond. Un dessin qui en
    // dépendrait se réorganiserait à chaque lecture — et deux exécutions ne se compareraient pas.
    const ordre = disposition([USERS, ORDER_ITEMS, ORDERS])
    const inverse = disposition([ORDERS, USERS, ORDER_ITEMS])
    expect(inverse).toEqual(ordre)
  })

  it('pose une table en face de celles auxquelles elle est liée, non au centre de la toile', () => {
    /*
     * **Le défaut rapporté sur un schéma réel, et la raison de ce test.**
     *
     * La première version centrait chaque colonne sur la hauteur de la plus haute. C'était juste
     * quand les colonnes se ressemblaient, et faux dès qu'une seule les dépassait : une première
     * colonne de cinquante tables plaçait les quatre tables de la dernière à **trois mille pixels
     * du haut**, seules au milieu d'un vide que rien ne remplissait — « un très grand espace vide,
     * puis quatre tables tout à droite ».
     *
     * # Ce que le décor doit rendre distinguable
     *
     * Une première version de ce test **restait verte sous sabotage** : ses tables non liées
     * partaient dans la grille des isolées, si bien que la colonne de gauche n'en comptait plus
     * qu'une et que le haut de la colonne était aussi le bon endroit. Un empilement brut y
     * satisfaisait donc l'assertion.
     *
     * Celui-ci a huit tables **toutes liées** à gauche, et deux à droite : `autre`, que les sept
     * premières référencent, et `cible`, que seule la **huitième** référence. `cible` doit donc
     * descendre tout en bas de la colonne — là où un empilement brut la mettrait tout en haut.
     */
    const cible: EntreeDeTable = {
      schema: 'public',
      name: 'zz_cible',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    const autre: EntreeDeTable = {
      schema: 'public',
      name: 'zz_autre',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    const gauche = Array.from({ length: 8 }, (_, rang) => ({
      schema: 'public',
      name: `a${rang}`,
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'vers_id', key: 'foreign' }),
      ],
      relations: [
        sortante(`a${rang}_vers_id_fkey`, 'vers_id', rang === 7 ? 'zz_cible' : 'zz_autre'),
      ],
    }))
    const vue = disposition([...gauche, autre, cible])

    const centre = (cadre: Boite) => cadre.y + cadre.height / 2
    const derniere = boite(vue, 'a7')
    const posee = boite(vue, 'zz_cible')

    // Aucune n'est partie dans la grille : elles sont toutes liées, et c'est ce qui rend ce décor
    // capable de mesurer le placement vertical.
    expect(vue.boites.some((cadre) => cadre.isolee)).toBe(false)
    // **Le fait gardé** : `cible` se pose en face de la seule table qui la référence, à une
    // demi-boîte près.
    expect(Math.abs(centre(posee) - centre(derniere))).toBeLessThan(posee.height)
    // Et le contrôle qui mord : elle est **sous** `autre`, donc dans le bas de la colonne — un
    // empilement brut, comme l'ancien centrage, la mettrait au-dessus.
    expect(posee.y).toBeGreaterThan(boite(vue, 'zz_autre').y)
    expect(centre(posee)).toBeGreaterThan(vue.hauteur / 2)
  })

  it('pose une table au barycentre de ses voisines, quand elles sont plusieurs', () => {
    // Le pendant vertical du barycentre qui ordonne déjà les colonnes : là il décide de l'ordre,
    // ici de la position. Deux voisines très écartées doivent laisser leur cible entre les deux.
    const haute: EntreeDeTable = {
      schema: 'public',
      name: 'aaa',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'cible_id', key: 'foreign' }),
      ],
      relations: [sortante('aaa_cible_id_fkey', 'cible_id', 'zz_cible')],
    }
    const milieu: EntreeDeTable = {
      schema: 'public',
      name: 'bbb',
      columns: Array.from({ length: 9 }, (_, rang) =>
        colonne({ position: rang + 1, name: `remplissage_${rang}`, typeName: 'text' }),
      ),
      relations: [],
    }
    const basse: EntreeDeTable = {
      schema: 'public',
      name: 'ccc',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'cible_id', key: 'foreign' }),
      ],
      relations: [sortante('ccc_cible_id_fkey', 'cible_id', 'zz_cible')],
    }
    const cible: EntreeDeTable = {
      schema: 'public',
      name: 'zz_cible',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    // `bbb` n'est liée à rien : elle part dans la grille, et n'écarte donc pas `aaa` de `ccc`. Ce
    // sont les hauteurs des deux liées qui décident, ce qui suffit à distinguer le barycentre du
    // haut de la colonne.
    const vue = disposition([haute, milieu, basse, cible])

    const centre = (cadre: Boite) => cadre.y + cadre.height / 2
    const attendu = (centre(boite(vue, 'aaa')) + centre(boite(vue, 'ccc'))) / 2
    expect(Math.abs(centre(boite(vue, 'zz_cible')) - attendu)).toBeLessThan(2)
    expect(boite(vue, 'bbb').isolee).toBe(true)
  })

  it('ramène une feuille contre la table qu’elle référence', () => {
    /*
     * **Le défaut rapporté : « des liens extrêmement longs ».**
     *
     * La relaxation place chaque table à sa colonne **minimale** : une table qu'aucune autre ne
     * référence reste en colonne 0, même quand rien ne l'y oblige. Sur un schéma réel, une table
     * centrale — `users`, `account` — est poussée loin à droite par la plus longue chaîne qui la
     * référence, et **toutes** ses autres référentes lui tirent un trait depuis la colonne 0.
     *
     * Mesuré sur ce décor avant le resserrage : six liens de neuf colonnes de portée, 1862 px
     * chacun. Après : une colonne, 86 px — l'écart horizontal, donc le minimum possible.
     */
    const chaine = Array.from({ length: 10 }, (_, rang) => ({
      schema: 'public',
      name: `chaine_${rang}`,
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'suivant_id', key: 'foreign' }),
      ],
      relations: rang < 9 ? [sortante(`c${rang}`, 'suivant_id', `chaine_${rang + 1}`)] : [],
    }))
    // Six feuilles vers la **dernière** de la chaîne : c'est la forme qui produisait le défaut.
    const feuilles = Array.from({ length: 6 }, (_, rang) => ({
      schema: 'public',
      name: `feuille_${rang}`,
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'central_id', key: 'foreign' }),
      ],
      relations: [sortante(`f${rang}`, 'central_id', 'chaine_9')],
    }))
    const vue = disposition([...chaine, ...feuilles])

    // Le décor doit bien produire dix colonnes, sinon il ne mesure pas ce qu'il prétend : c'est la
    // longue chaîne qui pousse la table centrale au loin.
    expect(Math.max(...vue.boites.map((cadre) => cadre.couche)) + 1).toBe(10)

    const couche = new Map(vue.boites.map((cadre) => [cadre.id, cadre.couche]))
    const portees = vue.liens.map(
      (lien) => (couche.get(lien.cible) ?? 0) - (couche.get(lien.source) ?? 0),
    )
    // **Chaque lien ne franchit qu'une colonne.** C'est le fait gardé, et il est mesuré en colonnes
    // plutôt qu'en pixels : une largeur dépend des noms du décor, une portée non.
    expect(Math.max(...portees)).toBe(1)
    // Et les feuilles sont bien en avant-dernière colonne, contre la table centrale.
    expect(couche.get(idDeTable('public', 'feuille_0'))).toBe(8)
    expect(couche.get(idDeTable('public', 'chaine_9'))).toBe(9)
  })

  it('ne fait jamais reculer un lien : la source reste à gauche de sa cible', () => {
    // **L'invariant que le resserrage pourrait casser.** Rapprocher une table de ses voisines ne
    // doit pas la faire passer *devant* une table qu'elle référence : le tracé changerait de nature
    // — il partirait à gauche — et le sens de lecture du dessin avec lui.
    const enEtoile: EntreeDeTable[] = [
      {
        schema: 'public',
        name: 'centre',
        columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
        relations: [],
      },
      ...Array.from({ length: 5 }, (_, rang) => ({
        schema: 'public',
        name: `branche_${rang}`,
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'centre_id', key: 'foreign' }),
        ],
        relations: [sortante(`b${rang}`, 'centre_id', 'centre')],
      })),
      // Une chaîne qui allonge le graphe, pour que le resserrage ait de la place où bouger.
      {
        schema: 'public',
        name: 'amont',
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'branche_id', key: 'foreign' }),
        ],
        relations: [sortante('amont_fkey', 'branche_id', 'branche_0')],
      },
    ]
    const vue = disposition(enEtoile)
    const couche = new Map(vue.boites.map((cadre) => [cadre.id, cadre.couche]))
    for (const lien of vue.liens) {
      if (lien.source === lien.cible) continue
      expect(
        couche.get(lien.source) ?? 0,
        `${lien.contrainte} recule : ${lien.source} → ${lien.cible}`,
      ).toBeLessThan(couche.get(lien.cible) ?? 0)
    }
  })

  it('ne déplace pas une table qui n’y gagnerait rien', () => {
    /*
     * **La stabilité fait partie du résultat.**
     *
     * Une table qui a autant de liens entrants que sortants gagnerait exactement ce qu'elle perdrait
     * en bougeant — la longueur totale vaut `d × (entrants − sortants)` plus une constante, donc
     * elle est *constante* quand les deux comptes s'égalent. La déplacer ferait changer le dessin
     * sans rien y gagner, et deux dispositions des mêmes données ne se compareraient plus.
     *
     * # Ce que le décor doit rendre distinguable
     *
     * Une première version prenait `TROIS`, où la table à degrés égaux — `orders` — a son plafond
     * **à sa propre place** : rien ne pouvait la déplacer, et le test restait vert même en envoyant
     * les degrés égaux au plafond (règle n° 1). Ici `m_milieu` a un plafond quatre colonnes plus
     * loin, parce qu'une chaîne pousse sa référencée au bout : elle *peut* bouger, et ne doit pas.
     */
    const chaine = Array.from({ length: 6 }, (_, rang) => ({
      schema: 'public',
      name: `x${rang}`,
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'suivant_id', key: 'foreign' }),
      ],
      relations: [sortante(`x${rang}_fkey`, 'suivant_id', rang < 5 ? `x${rang + 1}` : 'z_cible')],
    }))
    const vue = disposition([
      ...chaine,
      {
        schema: 'public',
        name: 'z_cible',
        columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
        relations: [],
      },
      {
        schema: 'public',
        name: 'm_milieu',
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'cible_id', key: 'foreign' }),
        ],
        relations: [sortante('m_milieu_fkey', 'cible_id', 'z_cible')],
      },
      {
        schema: 'public',
        name: 'm_amont',
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'milieu_id', key: 'foreign' }),
        ],
        relations: [sortante('m_amont_fkey', 'milieu_id', 'm_milieu')],
      },
    ])

    // La prémisse : la chaîne pousse bien `z_cible` au bout, donc `m_milieu` a de la place devant
    // elle. Sans cela, ce test se vérifierait lui-même.
    expect(boite(vue, 'z_cible').couche).toBe(6)
    // **Le fait gardé** : `m_milieu` a un entrant et un sortant, donc elle reste où la relaxation
    // l'a mise — et non collée à `z_cible` en colonne 5.
    expect(boite(vue, 'm_milieu').couche).toBe(1)
    // Et sa référente, elle, n'a que du sortant : elle la suit de près.
    expect(boite(vue, 'm_amont').couche).toBe(0)
  })

  it('ne commence jamais au-dessus de sa marge', () => {
    // Une boîte peut se poser plus haut que zéro — son souhait vient d'une voisine plus haute
    // qu'elle. Un dessin dont le coin haut-gauche serait négatif sortirait de sa zone défilante par
    // le haut, là où aucun défilement ne va.
    const vue = disposition(TROIS)
    for (const cadre of vue.boites) {
      expect(cadre.y).toBeGreaterThanOrEqual(0)
      expect(cadre.x).toBeGreaterThanOrEqual(0)
    }
    expect(Math.min(...vue.boites.map((cadre) => cadre.y))).toBeGreaterThan(0)
  })

  it('un cycle n’ajoute pas une colonne par table du schéma', () => {
    /*
     * **Le défaut le plus grave des trois, et celui qu'aucun décor n'avait vu.**
     *
     * Le calcul des couches relâchait `couche(cible) ≥ couche(source) + 1` sur **tous** les liens,
     * borné au nombre de tables. Sur un cycle, cette relaxation ne se stabilise jamais : chaque tour
     * rehausse chaque table du cycle, et la borne devient la réponse. Le commentaire qui vivait là
     * affirmait le contraire — « un cycle plafonne simplement à la longueur du chemin qu'il
     * permet » — et c'était faux : il plafonne au nombre de tables du **schéma**.
     *
     * Mesuré sur ce décor exact : **quatre-vingt-onze colonnes** et une toile de 20 164 px de large
     * pour trente tables, les trois tables du cycle abandonnées aux colonnes 88 à 90 pendant que les
     * vingt-sept autres tenaient dans les deux premières. C'est le signalement mot pour mot : « des
     * tables tout à droite, et des flèches extrêmement longues ».
     *
     * **Pourquoi le décor du cycle qui existait ne pouvait pas le voir** : il n'avait que deux
     * tables, où une borne de deux itérations ne peut pas faire de mal. Un décor trop petit ne
     * mesure que le décor (règle n° 5). Celui-ci a trente tables et un cycle de trois, le rapport
     * qui rend l'explosion visible.
     */
    const etoile: EntreeDeTable[] = [
      {
        schema: 'public',
        name: 'hub',
        columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
        relations: [],
      },
      ...Array.from({ length: 26 }, (_, rang) => ({
        schema: 'public',
        name: `f${String(rang).padStart(2, '0')}`,
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'hub_id', key: 'foreign' }),
        ],
        relations: [sortante(`f${rang}_fkey`, 'hub_id', 'hub')],
      })),
      ...[
        ['cyc_a', 'cyc_b'],
        ['cyc_b', 'cyc_c'],
        ['cyc_c', 'cyc_a'],
      ].map(([nom, cible]) => ({
        schema: 'public',
        name: nom as string,
        columns: [
          colonne({ position: 1, name: 'id', key: 'primary' }),
          colonne({ position: 2, name: 'suivant_id', key: 'foreign' }),
        ],
        relations: [sortante(`${nom}_fkey`, 'suivant_id', cible as string)],
      })),
    ]
    const vue = disposition(etoile)

    expect(vue.boites).toHaveLength(30)
    /*
     * **Le nombre de colonnes est celui du plus long chemin acyclique, non celui des tables.**
     * Ici : `cyc_a → cyc_b → cyc_c` en fait trois, une feuille vers le moyeu en fait deux. Trois
     * donc — et c'est cette égalité stricte qui mord, une inégalité large laisserait passer
     * quatre-vingt-onze.
     */
    expect(Math.max(...vue.boites.map((cadre) => cadre.couche)) + 1).toBe(3)
    // Et aucune table n'est abandonnée au loin : la toile reste de l'ordre de trois colonnes.
    expect(vue.largeur).toBeLessThan(1200)
  })

  it('déclare le même lien « arrière » quel que soit l’ordre des tables', () => {
    /*
     * Quel lien d'un cycle est écarté du calcul des couches dépend du parcours en profondeur : il
     * doit donc dépendre des **identités**, et non de l'ordre dans lequel les structures arrivent —
     * celui-ci est celui où le serveur répond, une par une.
     *
     * # Ce que le décor doit rendre distinguable
     *
     * Une première version donnait un seul lien sortant à chaque table : trier les sortants d'un
     * nœud n'y changeait rien, et le test restait vert sans le tri (règle n° 1). Ici `noeud` en a
     * **deux**, et — c'est le point — ils sont déclarés dans deux tables différentes : l'un en
     * sortie chez `noeud`, l'autre en **entrée** chez `q_puits`, comme le catalogue les rend. Leur
     * ordre de collecte suit donc l'ordre des tables, et sans tri c'est lui qui déciderait quel lien
     * du cycle est déclaré arrière — donc l'ordre des colonnes.
     */
    const noeud: EntreeDeTable = {
      schema: 'public',
      name: 'noeud',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'p_id', key: 'foreign' }),
        colonne({ position: 3, name: 'q_id', key: 'foreign' }),
      ],
      relations: [sortante('noeud_p_fkey', 'p_id', 'p_milieu')],
    }
    const pMilieu: EntreeDeTable = {
      schema: 'public',
      name: 'p_milieu',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'q_id', key: 'foreign' }),
      ],
      relations: [sortante('p_q_fkey', 'q_id', 'q_puits')],
    }
    const qPuits: EntreeDeTable = {
      schema: 'public',
      name: 'q_puits',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'p_id', key: 'foreign' }),
      ],
      relations: [
        // Le second lien de `noeud`, vu de l'autre bout — c'est ce que le catalogue rend.
        entrante('noeud_q_fkey', 'id', 'noeud', 'q_id'),
        // Et le lien qui referme le cycle avec `p_milieu`.
        sortante('q_p_fkey', 'p_id', 'p_milieu'),
      ],
    }

    const reference = disposition([noeud, pMilieu, qPuits])
    // Le décor doit bien porter un cycle, sinon il n'y a pas d'arc arrière à choisir.
    expect(reference.liens).toHaveLength(4)
    for (const ordre of [
      [qPuits, pMilieu, noeud],
      [pMilieu, qPuits, noeud],
      [qPuits, noeud, pMilieu],
    ]) {
      expect(disposition(ordre)).toEqual(reference)
    }
  })

  it('termine sur un cycle, et le trace à l’envers', () => {
    // Deux tables qui se référencent : une relaxation non bornée n'en sortirait jamais, et un
    // parcours récursif y demanderait un marquage. Le fait à garder est qu'on obtient un dessin.
    const a: EntreeDeTable = {
      schema: 'public',
      name: 'a',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'b_id', key: 'foreign' }),
      ],
      relations: [sortante('a_b_id_fkey', 'b_id', 'b')],
    }
    const b: EntreeDeTable = {
      schema: 'public',
      name: 'b',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'a_id', key: 'foreign' }),
      ],
      relations: [sortante('b_a_id_fkey', 'a_id', 'a')],
    }
    const vue = disposition([a, b])

    expect(vue.boites).toHaveLength(2)
    expect(vue.liens).toHaveLength(2)
    // L'un des deux liens part forcément vers la gauche : il sort alors par le bord **gauche** de
    // sa source, faute de quoi son tracé traverserait les deux boîtes qu'il relie.
    const arriere = vue.liens.find((candidat) => candidat.arrivee.x < candidat.depart.x)
    expect(arriere).toBeDefined()
    const source = boite(vue, (arriere as Lien).source.split('.')[1] as string)
    expect((arriere as Lien).depart.x).toBe(source.x)
  })
})

describe('les liens', () => {
  it('s’ancre sur la ligne de la colonne, des deux côtés', () => {
    const vue = disposition(TROIS)
    const fk = lien(vue, 'orders_user_id_fkey')

    // **La propriété qui fait tout l'intérêt d'un diagramme de schéma** : la flèche dit *quelle*
    // colonne référence *quelle* colonne, pas seulement quelle table.
    expect(fk.depart.y).toBe(ordonneeDe(boite(vue, 'orders'), 'user_id'))
    expect(fk.arrivee.y).toBe(ordonneeDe(boite(vue, 'users'), 'id'))
    // Le contrôle négatif du décor : les deux ancres sont à des hauteurs différentes dans leur
    // boîte, donc une inversion des deux bouts ne peut pas passer inaperçue.
    const rangDeLaFk = boite(vue, 'orders').lignes.findIndex(
      (ligne) => ligne.sorte === 'colonne' && ligne.column === 'user_id',
    )
    const rangDeLaCible = boite(vue, 'users').lignes.findIndex(
      (ligne) => ligne.sorte === 'colonne' && ligne.column === 'id',
    )
    expect(rangDeLaFk).not.toBe(rangDeLaCible)
  })

  it('part du bord droit de la source et arrive au bord gauche de la cible', () => {
    const vue = disposition(TROIS)
    const fk = lien(vue, 'orders_user_id_fkey')
    const orders = boite(vue, 'orders')
    const users = boite(vue, 'users')

    expect(fk.depart.x).toBe(orders.x + orders.width)
    expect(fk.arrivee.x).toBe(users.x)
    expect(fk.chemin).toMatch(/^M \d/)
    // Aucun `NaN` dans le tracé : un attribut `d` invalide l'effacerait sans rien dire.
    expect(fk.chemin).not.toContain('NaN')
  })

  it('ne compte qu’un lien quand les deux tables déclarent la même clé', () => {
    // Le catalogue rend la clé **des deux côtés** : sortante chez `orders`, entrante chez `users`.
    // Les deux décrivent la même contrainte ; les tracer toutes deux doublerait chaque flèche.
    const usersAvecEntrante: EntreeDeTable = {
      ...USERS,
      relations: [entrante('orders_user_id_fkey', 'id', 'orders', 'user_id')],
    }
    const vue = disposition([ORDERS, usersAvecEntrante])

    expect(vue.liens).toHaveLength(1)
    const fk = lien(vue, 'orders_user_id_fkey')
    expect(fk.source).toBe(idDeTable('public', 'orders'))
    expect(fk.cible).toBe(idDeTable('public', 'users'))
    expect(fk.colonnes).toEqual(['user_id'])
    expect(fk.colonnesCibles).toEqual(['id'])
  })

  it('déduit le lien d’une seule entrante, quand la table qui référence n’a pas été lue', () => {
    // Les structures arrivent une par une : `users` peut être lue avant `orders`. Une entrante
    // suffit alors à savoir que la flèche existe, et dans quel sens.
    const usersSeule: EntreeDeTable = {
      ...USERS,
      relations: [entrante('orders_user_id_fkey', 'id', 'orders', 'user_id')],
    }
    const vue = disposition([usersSeule, ORDERS])
    expect(lien(vue, 'orders_user_id_fkey').source).toBe(idDeTable('public', 'orders'))
  })

  it('distingue deux clés étrangères entre les deux mêmes tables', () => {
    // `created_by` et `updated_by` vers `users` : une identité de lien réduite au couple de tables
    // en aurait fondu une dans l'autre, et le diagramme n'aurait montré qu'une flèche sur deux.
    const documents: EntreeDeTable = {
      schema: 'public',
      name: 'documents',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'created_by', key: 'foreign' }),
        colonne({ position: 3, name: 'updated_by', typeName: 'int8', nullable: true }),
      ],
      relations: [
        sortante('documents_created_by_fkey', 'created_by', 'users'),
        sortante('documents_updated_by_fkey', 'updated_by', 'users'),
      ],
    }
    const vue = disposition([documents, USERS])

    expect(vue.liens).toHaveLength(2)
    expect(lien(vue, 'documents_created_by_fkey').depart.y).not.toBe(
      lien(vue, 'documents_updated_by_fkey').depart.y,
    )
  })

  it('compte les clés dont l’autre bout n’est pas là, sans les tracer', () => {
    // Un schéma n'est pas un monde clos. Ne rien tracer est la seule option — la boîte n'existe
    // pas — mais le taire ferait lire le diagramme comme complet.
    const vue = disposition([ORDERS])
    expect(vue.liens).toHaveLength(0)
    expect(vue.liensExternes).toBe(1)
  })

  it('boucle sur la droite quand une table se référence elle-même', () => {
    // `parent_id` est trop courant pour se contenter de ne rien tracer, et une table ne peut pas
    // être à gauche d'elle-même : le lien réflexif est écarté du calcul des couches.
    const rules: EntreeDeTable = {
      schema: 'public',
      name: 'pricing_rules',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'label', typeName: 'text' }),
        colonne({ position: 3, name: 'parent_id', key: 'foreign', nullable: true }),
      ],
      relations: [sortante('pricing_rules_parent_id_fkey', 'parent_id', 'pricing_rules')],
    }
    const vue = disposition([rules])

    expect(boite(vue, 'pricing_rules').couche).toBe(0)
    const boucle = lien(vue, 'pricing_rules_parent_id_fkey')
    const cadre = boite(vue, 'pricing_rules')
    expect(boucle.depart.x).toBe(cadre.x + cadre.width)
    expect(boucle.arrivee.x).toBe(cadre.x + cadre.width)
    expect(boucle.depart.y).toBe(ordonneeDe(cadre, 'parent_id'))
    expect(boucle.arrivee.y).toBe(ordonneeDe(cadre, 'id'))
  })

  it('n’ancre jamais un lien sur une ligne masquée', () => {
    // L'invariant qui justifie que `LIGNES_APERCU` soit un plancher et non un plafond : une flèche
    // qui arriverait sur « + 12 autres » pointerait un endroit qui ne dit pas pourquoi.
    const large: EntreeDeTable = {
      schema: 'public',
      name: 'large',
      columns: [
        ...Array.from({ length: 20 }, (_, rang) =>
          colonne({ position: rang + 1, name: `remplissage_${rang}`, typeName: 'text' }),
        ),
        colonne({ position: 21, name: 'user_id', key: 'foreign' }),
      ],
      relations: [sortante('large_user_id_fkey', 'user_id', 'users')],
    }
    const vue = disposition([large, USERS])

    // La colonne de la clé est en vingt-et-unième position : au-delà de l'aperçu, et pourtant là.
    expect(ordonneeDe(boite(vue, 'large'), 'user_id')).toBe(
      lien(vue, 'large_user_id_fkey').depart.y,
    )
    for (const trace of vue.liens) {
      const source = vue.boites.find((cadre) => cadre.id === trace.source) as Boite
      const cible = vue.boites.find((cadre) => cadre.id === trace.cible) as Boite
      expect(trace.depart.y).toBe(ordonneeDe(source, trace.colonnes[0] as string))
      expect(trace.arrivee.y).toBe(ordonneeDe(cible, trace.colonnesCibles[0] as string))
    }
  })
})

describe('le tracé', () => {
  /**
   * Les commandes d'un attribut `d`, avec leur point courant.
   *
   * **Un vrai petit analyseur, et c'est un correctif.** La première version retirait les `Q` du
   * tracé puis comparait les points restants : elle mettait ainsi face à face le point d'*avant* un
   * arrondi et celui d'*après*, qui diffèrent des deux côtés par construction — un virage change
   * bien les deux coordonnées. Elle dénonçait donc un tracé parfaitement orthogonal. Ce qu'il faut
   * mesurer est chaque segment **droit**, du point courant à sa cible.
   */
  function commandes(chemin: string) {
    const jetons = chemin.match(/[MLQ][^MLQ]*/g) ?? []
    const lues: {
      sorte: string
      de: { x: number; y: number }
      vers: { x: number; y: number }
      controle?: { x: number; y: number }
    }[] = []
    let courant = { x: 0, y: 0 }
    for (const jeton of jetons) {
      const sorte = jeton[0] as string
      const n = (jeton.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      if (sorte === 'M') {
        courant = { x: n[0] as number, y: n[1] as number }
        continue
      }
      if (sorte === 'L') {
        const vers = { x: n[0] as number, y: n[1] as number }
        lues.push({ sorte, de: courant, vers })
        courant = vers
        continue
      }
      const controle = { x: n[0] as number, y: n[1] as number }
      const vers = { x: n[2] as number, y: n[3] as number }
      lues.push({ sorte, de: courant, vers, controle })
      courant = vers
    }
    return lues
  }

  const memeAxe = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01

  it('n’a que des segments horizontaux ou verticaux, et de vrais virages', () => {
    // **Le remède au reproche fait au premier dessin** : des courbes de Bézier, chacune juste, et
    // qui se confondaient dès que deux clés visaient la même région. Deux traits orthogonaux qui se
    // croisent se lisent comme un croisement ; deux courbes qui se rapprochent se lisent comme une
    // seule ligne épaisse.
    const liens = disposition(TROIS).liens
    expect(liens.length).toBeGreaterThan(0)
    for (const trace of liens) {
      const lues = commandes(trace.chemin)
      expect(lues.length, `tracé vide pour ${trace.contrainte}`).toBeGreaterThan(0)
      for (const commande of lues) {
        if (commande.sorte === 'L') {
          expect(
            memeAxe(commande.de, commande.vers),
            `${trace.contrainte} : segment en biais de (${commande.de.x},${commande.de.y}) à (${commande.vers.x},${commande.vers.y})`,
          ).toBe(true)
          continue
        }
        // Un virage est un **coin** : son point de contrôle est aligné avec chacun de ses deux
        // bouts, l'un horizontalement et l'autre verticalement. Un point de contrôle placé
        // ailleurs ferait de l'arrondi une courbe libre, ce qui est exactement ce qu'on a retiré.
        const controle = commande.controle as { x: number; y: number }
        expect(memeAxe(commande.de, controle)).toBe(true)
        expect(memeAxe(controle, commande.vers)).toBe(true)
      }
    }
  })

  it('donne un trait droit quand les deux bouts sont à la même hauteur', () => {
    // Le cas le plus fréquent d'un schéma bien rangé. Un coude de rayon nul y laisserait des
    // artefacts d'arrondi, et un `Q` dégénéré n'est pas un trait.
    const gauche: EntreeDeTable = {
      schema: 'public',
      name: 'gauche',
      columns: [colonne({ position: 1, name: 'cible_id', key: 'foreign' })],
      relations: [sortante('gauche_cible_id_fkey', 'cible_id', 'droite')],
    }
    const droite: EntreeDeTable = {
      schema: 'public',
      name: 'droite',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    const vue = disposition([gauche, droite])
    const trait = lien(vue, 'gauche_cible_id_fkey')

    expect(trait.depart.y).toBe(trait.arrivee.y)
    expect(trait.chemin).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
  })

  it('sépare les couloirs de deux liens qui entrent dans la même colonne', () => {
    /*
     * **Le fait qui rend un dessin lisible sans le sélectionner.** Deux clés qui visent la même
     * colonne de tables partageaient un même segment vertical : impossible de suivre l'une des
     * deux du regard. Chacune a désormais son couloir.
     *
     * Le décor place deux tables *différentes* à gauche, chacune référençant `users` par une
     * colonne à une hauteur différente : sans cela, leurs deux verticales pourraient coïncider
     * légitimement.
     */
    const premiere: EntreeDeTable = {
      schema: 'public',
      name: 'aaa',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'user_id', key: 'foreign' }),
      ],
      relations: [sortante('aaa_user_id_fkey', 'user_id', 'users')],
    }
    const seconde: EntreeDeTable = {
      schema: 'public',
      name: 'bbb',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'libelle', typeName: 'text' }),
        colonne({ position: 3, name: 'user_id', key: 'foreign' }),
      ],
      relations: [sortante('bbb_user_id_fkey', 'user_id', 'users')],
    }
    const vue = disposition([premiere, seconde, USERS])

    const verticaleDe = (contrainte: string) => {
      // Le segment vertical d'un coude est celui dont les deux bouts partagent une abscisse : c'est
      // l'abscisse du couloir.
      const nombres = (lien(vue, contrainte).chemin.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
      // `M x y L x' y Q … x'' … L x'' …` : l'abscisse du couloir est celle du point de contrôle.
      return nombres[4] as number
    }
    expect(verticaleDe('aaa_user_id_fkey')).not.toBe(verticaleDe('bbb_user_id_fkey'))
    // Et les deux couloirs restent **dans la gouttière**, à gauche de la boîte visée : un couloir
    // qui la dépasserait ferait passer un trait sous elle.
    const users = boite(vue, 'users')
    for (const contrainte of ['aaa_user_id_fkey', 'bbb_user_id_fkey']) {
      expect(verticaleDe(contrainte)).toBeLessThan(users.x)
    }
  })

  it('donne son propre couloir à chaque clé réflexive d’une même table', () => {
    // Deux `parent_id` sur la même table — un arbre et une chaîne de versions — se superposeraient
    // exactement, une boucle n'ayant qu'un seul chemin naturel.
    const rules: EntreeDeTable = {
      schema: 'public',
      name: 'pricing_rules',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'parent_id', key: 'foreign', nullable: true }),
        colonne({ position: 3, name: 'remplace_id', key: 'foreign', nullable: true }),
      ],
      relations: [
        sortante('pricing_rules_parent_id_fkey', 'parent_id', 'pricing_rules'),
        sortante('pricing_rules_remplace_id_fkey', 'remplace_id', 'pricing_rules'),
      ],
    }
    const vue = disposition([rules])
    const loin = (contrainte: string) =>
      Math.max(...(lien(vue, contrainte).chemin.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number))
    expect(loin('pricing_rules_parent_id_fkey')).not.toBe(loin('pricing_rules_remplace_id_fkey'))
  })
})

describe('les colonnes montrées', () => {
  const vingtCinq: EntreeDeTable = {
    schema: 'public',
    name: 'audit_events',
    columns: [
      colonne({ position: 1, name: 'id', key: 'primary' }),
      ...Array.from({ length: 24 }, (_, rang) =>
        colonne({ position: rang + 2, name: `champ_${rang}`, typeName: 'text' }),
      ),
    ],
    relations: [],
  }

  it('résume ce qui ne tient pas, avec le libellé de l’appelant', () => {
    const vue = disposition([vingtCinq], { libelleDuReste: (n) => `+ ${n} autres colonnes` })
    const cadre = boite(vue, 'audit_events')
    const resume = cadre.lignes.at(-1)

    expect(resume?.sorte).toBe('reste')
    expect(resume).toMatchObject({ compte: 25 - 8, texte: '+ 17 autres colonnes' })
    // Huit colonnes plus la ligne de résumé : c'est ce que l'aperçu promet.
    expect(cadre.lignes).toHaveLength(9)
  })

  it('garde la colonne de la clé primaire, où qu’elle soit', () => {
    const tardive: EntreeDeTable = {
      ...vingtCinq,
      columns: [
        ...Array.from({ length: 24 }, (_, rang) =>
          colonne({ position: rang + 1, name: `champ_${rang}`, typeName: 'text' }),
        ),
        colonne({ position: 25, name: 'code', key: 'primary', typeName: 'text' }),
      ],
    }
    const cadre = boite(disposition([tardive]), 'audit_events')
    expect(cadre.lignes.some((ligne) => ligne.sorte === 'colonne' && ligne.column === 'code')).toBe(
      true,
    )
  })

  it('montre tout, sur demande, et ne résume plus rien', () => {
    const cadre = boite(disposition([vingtCinq], { toutesLesColonnes: true }), 'audit_events')
    expect(cadre.lignes).toHaveLength(25)
    expect(cadre.lignes.every((ligne) => ligne.sorte === 'colonne')).toBe(true)
  })

  it('garde l’ordre de déclaration, et non les clés d’abord', () => {
    // Une boîte se lit comme un `\d` : les colonnes y sont dans l'ordre de la table. Remonter les
    // clés en tête aurait fait d'une boîte de diagramme un objet différent d'une liste de colonnes.
    const cadre = boite(disposition(TROIS), 'orders')
    expect(cadre.lignes.map((ligne) => (ligne.sorte === 'colonne' ? ligne.column : '…'))).toEqual([
      'id',
      'placed_at',
      'user_id',
    ])
  })

  it('marque les colonnes qu’un lien touche', () => {
    // `users.id` ne porte aucune clé étrangère : c'est le fait d'être référencée qui la distingue,
    // et c'est cette marque qui empêche l'aperçu de la masquer.
    const vue = disposition(TROIS)
    const referencee = boite(vue, 'users').lignes.find(
      (ligne) => ligne.sorte === 'colonne' && ligne.column === 'id',
    )
    expect(referencee).toMatchObject({ relation: true, key: 'primary' })
    const ordinaire = boite(vue, 'users').lignes.find(
      (ligne) => ligne.sorte === 'colonne' && ligne.column === 'email',
    )
    expect(ordinaire).toMatchObject({ relation: false, key: null })
  })
})

describe('les tables isolées', () => {
  const isolee = (nom: string): EntreeDeTable => ({
    schema: 'public',
    name: nom,
    columns: [
      colonne({ position: 1, name: 'id', key: 'primary' }),
      colonne({ position: 2, name: 'libelle', typeName: 'text' }),
    ],
    relations: [],
  })

  it('vont en grille, et non dans la première colonne du flux', () => {
    /*
     * **La seconde moitié du défaut rapporté.** Une table qu'aucun lien ne touche était de
     * profondeur 0 comme les autres, donc empilée dans la première colonne — et sur un schéma réel
     * celle-ci en compte des dizaines, ce qui donnait une colonne de plusieurs milliers de pixels
     * décidant à elle seule de la hauteur de la toile. Une liste se lit en grille.
     */
    const douze = Array.from({ length: 12 }, (_, rang) => isolee(`libre_${rang}`))
    const vue = disposition([...douze, ORDERS, USERS])

    const rangees = vue.boites.filter((cadre) => cadre.isolee)
    expect(rangees).toHaveLength(12)
    // Plusieurs colonnes **et** plusieurs rangées : c'est ce qui fait une grille plutôt qu'une
    // bande ou une colonne.
    expect(new Set(rangees.map((cadre) => cadre.x)).size).toBeGreaterThan(1)
    expect(new Set(rangees.map((cadre) => cadre.y)).size).toBeGreaterThan(1)
    // Les tables du graphe, elles, ne sont pas isolées : sans ce contrôle, tout marquer « isolée »
    // satisfairait aussi ce test.
    expect(boite(vue, 'orders').isolee).toBe(false)
    expect(boite(vue, 'users').isolee).toBe(false)
  })

  it('sont sous le graphe, jamais mêlées à lui', () => {
    const vue = disposition([isolee('libre'), ORDERS, USERS])
    const basDuGraphe = Math.max(
      ...vue.boites.filter((cadre) => !cadre.isolee).map((cadre) => cadre.y + cadre.height),
    )
    expect(boite(vue, 'libre').y).toBeGreaterThan(basDuGraphe)
  })

  it('rendent une grille compacte quand le schéma n’a aucune clé', () => {
    // Le cas limite voulu : neuf tables sans relation donnaient une colonne de neuf boîtes. La
    // grille en fait trois rangées de trois, donc une toile trois fois moins haute et lisible d'un
    // regard.
    const neuf = Array.from({ length: 9 }, (_, rang) => isolee(`libre_${rang}`))
    const vue = disposition(neuf)

    expect(vue.liens).toHaveLength(0)
    expect(vue.boites.every((cadre) => cadre.isolee)).toBe(true)
    const hauteurDUneBoite = (vue.boites[0] as Boite).height
    // Trois rangées : franchement moins que les neuf d'une colonne, et la borne le dit sans
    // recopier la formule de la grille.
    expect(vue.hauteur).toBeLessThan(hauteurDUneBoite * 5)
    expect(new Set(vue.boites.map((cadre) => cadre.x)).size).toBe(3)
  })

  it('ne comptent pas une table dont la seule clé sort du schéma', () => {
    // Elle n'a pas de lien **traçable**, donc rien ne la relie dans le dessin : sa place est la
    // grille. Le compte de liens externes, lui, la signale déjà dans la barre d'état.
    const versAilleurs: EntreeDeTable = {
      schema: 'public',
      name: 'audit',
      columns: [colonne({ position: 1, name: 'snapshot_id', key: 'foreign' })],
      relations: [sortante('audit_snapshot_fkey', 'snapshot_id', 'snapshots', 'archive')],
    }
    const vue = disposition([versAilleurs, ORDERS, USERS])
    expect(boite(vue, 'audit').isolee).toBe(true)
    expect(vue.liensExternes).toBe(1)
  })
})

describe('les largeurs', () => {
  it('suivent le contenu, entre un plancher et un plafond', () => {
    const courte: EntreeDeTable = {
      schema: 'public',
      name: 'a',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    const longue: EntreeDeTable = {
      schema: 'public',
      name: 'b',
      columns: [
        colonne({
          position: 1,
          name: 'une_colonne_au_nom_interminable_qui_ne_tiendra_pas',
          typeName: 'character varying(255)[]',
        }),
      ],
      relations: [],
    }
    const vue = disposition([courte, longue])

    expect(boite(vue, 'a').width).toBe(LARGEUR_BOITE_MIN)
    expect(boite(vue, 'b').width).toBe(LARGEUR_BOITE_MAX)
  })

  it('tiennent le libellé du résumé, qui n’est borné par aucun nom de colonne', () => {
    // La seule ligne dont la longueur ne vient pas des données serait aussi la seule à déborder si
    // la mesure l'ignorait.
    const courtesColonnes: EntreeDeTable = {
      schema: 'public',
      name: 'x',
      columns: Array.from({ length: 12 }, (_, rang) =>
        colonne({ position: rang + 1, name: `c${rang}`, typeName: 'int' }),
      ),
      relations: [],
    }
    const etroite = boite(disposition([courtesColonnes]), 'x').width
    const avecResume = boite(
      disposition([courtesColonnes], {
        libelleDuReste: (n) => `+ ${n} autres colonnes masquées ici`,
      }),
      'x',
    ).width
    expect(avecResume).toBeGreaterThan(etroite)
  })

  it('donnent à la toile la taille de ce qu’elle contient', () => {
    const vue = disposition(TROIS)
    const droite = Math.max(...vue.boites.map((cadre) => cadre.x + cadre.width))
    const bas = Math.max(...vue.boites.map((cadre) => cadre.y + cadre.height))
    expect(vue.largeur).toBeGreaterThan(droite)
    expect(vue.hauteur).toBeGreaterThanOrEqual(bas)
  })
})

it('rend une toile vide sans table, sans inventer de dimension', () => {
  // Un schéma sans table est un fait, pas une attente : la vue le dira, et une toile de 48 px de
  // marge n'aurait rien à montrer.
  expect(disposition([])).toEqual({
    boites: [],
    liens: [],
    largeur: 0,
    hauteur: 0,
    liensExternes: 0,
  })
})

describe('le chemin entre deux tables', () => {
  /** Une seconde table qui référence `users` : c'est elle qui rend le parcours non orienté. */
  const INVOICES: EntreeDeTable = {
    schema: 'public',
    name: 'invoices',
    columns: [
      colonne({ position: 1, name: 'id', key: 'primary' }),
      colonne({ position: 2, name: 'billed_to', key: 'foreign' }),
    ],
    relations: [sortante('invoices_billed_to_fkey', 'billed_to', 'users')],
  }

  /** Le chemin sous une forme qui se lit dans une assertion : « de.colonne → vers.colonne ». */
  function lu(etapes: readonly Etape[] | null): readonly string[] | null {
    if (etapes === null) return null
    return etapes.map((etape) => {
      const gauche = etape.remonte ? etape.lien.colonnesCibles : etape.lien.colonnes
      const droite = etape.remonte ? etape.lien.colonnes : etape.lien.colonnesCibles
      return `${etape.de}.${gauche.join('+')} ${etape.remonte ? '←' : '→'} ${etape.vers}.${droite.join('+')}`
    })
  }

  it('rend la clé qui relie deux tables voisines', () => {
    const vue = disposition(TROIS)

    expect(lu(cheminEntre(vue.liens, 'public.orders', 'public.users'))).toEqual([
      'public.orders.user_id → public.users.id',
    ])
  })

  it('rend la même clé vue de l’autre bout, et le dit', () => {
    /*
     * **Le sens du chemin n'est pas celui de la clé**, et c'est `remonte` qui les sépare. Partir de
     * `users` donne exactement le même lien, franchi à l'envers : dire l'inverse ferait écrire la
     * jointure dans le mauvais sens, ce qu'aucun autre champ ne rattraperait.
     */
    const vue = disposition(TROIS)

    expect(lu(cheminEntre(vue.liens, 'public.users', 'public.orders'))).toEqual([
      'public.users.id ← public.orders.user_id',
    ])
  })

  it('traverse les tables intermédiaires, dans l’ordre où on les parcourt', () => {
    const vue = disposition(TROIS)

    // C'est la réponse que le dessin seul ne donnait pas : `order_items` et `users` ne se touchent
    // pas, et c'est précisément le cas où l'on ne sait pas répondre soi-même.
    expect(lu(cheminEntre(vue.liens, 'public.order_items', 'public.users'))).toEqual([
      'public.order_items.order_id → public.orders.id',
      'public.orders.user_id → public.users.id',
    ])
  })

  it('relie deux tables qui référencent la même troisième', () => {
    /*
     * **Le contrôle qui dit que le parcours n'est pas orienté**, et le cas le plus courant de tous :
     * `orders` et `invoices` ne se référencent pas l'une l'autre, elles visent toutes deux `users`.
     * Un parcours qui ne suivrait que le sens des flèches ne trouverait rien à dire d'elles — or
     * c'est exactement la jointure qu'on cherche à écrire.
     */
    const vue = disposition([...TROIS, INVOICES])

    expect(lu(cheminEntre(vue.liens, 'public.orders', 'public.invoices'))).toEqual([
      'public.orders.user_id → public.users.id',
      'public.users.id ← public.invoices.billed_to',
    ])
  })

  it('rend `null` quand rien ne relie les deux tables', () => {
    const seule: EntreeDeTable = {
      schema: 'public',
      name: 'zz_seule',
      columns: [colonne({ position: 1, name: 'id', key: 'primary' })],
      relations: [],
    }
    const vue = disposition([...TROIS, seule])

    // `null` et non un tableau vide : « aucun chemin » n'est pas « un chemin de zéro étape », qui
    // est ce que rend une table comparée à elle-même.
    expect(cheminEntre(vue.liens, 'public.orders', 'public.zz_seule')).toBeNull()
    expect(cheminEntre(vue.liens, 'public.orders', 'public.orders')).toEqual([])
  })

  it('prend le plus court, et non le premier venu', () => {
    /*
     * **Le décor doit rendre une file et une pile distinguables** (règle n° 5), et la première
     * version ne le faisait pas : elle opposait un chemin d'un saut à un chemin de deux, or le saut
     * unique part du **départ**, donc il est vu au premier tour quel que soit l'ordre de visite. Un
     * parcours en profondeur y répondait juste, et le test restait vert sous sabotage.
     *
     * Celui-ci oppose deux et trois sauts, et le détour est celui que le tri des liens visite en
     * **second** — donc celui qu'une pile dépilerait en premier. Une pile rendrait ici les trois
     * étapes du détour ; la file rend les deux qui suffisent, qui sont la jointure à écrire.
     */
    const detour: EntreeDeTable = {
      schema: 'public',
      name: 'zz_detour',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'second_id', key: 'foreign' }),
      ],
      relations: [sortante('zz_detour_second_id_fkey', 'second_id', 'zz_second')],
    }
    const second: EntreeDeTable = {
      schema: 'public',
      name: 'zz_second',
      columns: [
        colonne({ position: 1, name: 'id', key: 'primary' }),
        colonne({ position: 2, name: 'user_id', key: 'foreign' }),
      ],
      relations: [sortante('zz_second_user_id_fkey', 'user_id', 'users')],
    }
    const embranchement: EntreeDeTable = {
      ...ORDER_ITEMS,
      columns: [
        ...ORDER_ITEMS.columns,
        colonne({ position: 3, name: 'zz_detour_id', key: 'foreign' }),
      ],
      relations: [
        ...ORDER_ITEMS.relations,
        sortante('order_items_zz_detour_id_fkey', 'zz_detour_id', 'zz_detour'),
      ],
    }
    const vue = disposition([embranchement, ORDERS, USERS, detour, second])

    expect(lu(cheminEntre(vue.liens, 'public.order_items', 'public.users'))).toEqual([
      'public.order_items.order_id → public.orders.id',
      'public.orders.user_id → public.users.id',
    ])
  })

  it('ne compte pas une clé réflexive comme une étape', () => {
    /*
     * Un `parent_id` est trop courant pour ne pas se présenter, et il ne mène à personne. **Rien
     * dans le parcours ne le nomme** : une table déjà vue est écartée, et une clé réflexive vise
     * précisément celle d'où l'on part. La garde explicite qui vivait là a été retirée — le
     * sabotage a montré qu'elle ne gardait rien que celle-ci ne gardait déjà.
     */
    const arbre: EntreeDeTable = {
      ...ORDERS,
      columns: [...ORDERS.columns, colonne({ position: 4, name: 'parent_id', key: 'foreign' })],
      relations: [...ORDERS.relations, sortante('orders_parent_id_fkey', 'parent_id', 'orders')],
    }
    const vue = disposition([ORDER_ITEMS, arbre, USERS])

    expect(lu(cheminEntre(vue.liens, 'public.order_items', 'public.users'))).toEqual([
      'public.order_items.order_id → public.orders.id',
      'public.orders.user_id → public.users.id',
    ])
  })

  it('ne dépend pas de l’ordre dans lequel les tables arrivent', () => {
    // Les structures arrivent une par une : un chemin qui changerait d'une lecture à l'autre ferait
    // afficher deux réponses différentes à la même question.
    const ordre = disposition([...TROIS, INVOICES])
    const inverse = disposition([INVOICES, USERS, ORDERS, ORDER_ITEMS])

    expect(lu(cheminEntre(inverse.liens, 'public.orders', 'public.invoices'))).toEqual(
      lu(cheminEntre(ordre.liens, 'public.orders', 'public.invoices')),
    )
  })
})
