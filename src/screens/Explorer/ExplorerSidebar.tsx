import { useMemo, useState } from 'react'
import { Icon } from '../../design/icons/Icon'
import type { Project } from '../../domain/config'
import type { ColumnInfo, ConnectionState } from '../../domain/engine'
import { Badge } from '../../ui/Badge/Badge'
import { ColumnRow } from '../../ui/ColumnRow/ColumnRow'
import { Sidebar } from '../../ui/Sidebar/Sidebar'
import { SidebarFilterBar } from '../../ui/SidebarFilterBar/SidebarFilterBar'
import { SidebarSectionTitle } from '../../ui/SidebarSectionTitle/SidebarSectionTitle'
import { TreeRow } from '../../ui/TreeRow/TreeRow'
import { aplatir, type Charge, type Deplies, type Noeud } from './arbre'
import styles from './ExplorerSidebar.module.css'

type ExplorerSidebarProps = {
  projects: readonly Project[]
  deplies: Deplies
  charge: Charge
  etatDe: (
    project: string,
    database: string,
    environment: Project['activeEnvironment'],
  ) => ConnectionState
  selectedId?: string | null
  onToggle: (noeud: Noeud) => void
  onSelect: (noeud: Noeud) => void
  onAddDatabase?: () => void
  onRefresh?: () => void
  /**
   * La section contextuelle « Colonnes de *table* » des écrans de travail (`A5` → `A9`).
   *
   * Absente dans `A4`, où aucune table n'est ouverte : le handoff ne la montre que sous un
   * onglet actif. Les annotations « filtré » et « tri ↓ » du mockup viendront avec `10d`, qui
   * crée l'état qu'elles reflètent — les inventer ici afficherait un état que rien ne produit.
   */
  columns?: {
    table: string
    columns: readonly ColumnInfo[]
    loading?: boolean
  }
  /** Voir `Sidebar` : `fill` dans l'écran de travail, où un `SplitPane` porte la largeur. */
  width?: 'standard' | 'wide' | 'fill'
}

/** Au-delà, la liste se résume — le mockup montre sept colonnes puis « + 11 autres ». */
const APERCU_COLONNES = 7

/**
 * La sidebar de `A4` : filtre, arbre à quatre niveaux, pied.
 *
 * L'arbre est **aplati par `arbre.ts`**, fonction pure et testée sans DOM. Ce composant ne fait
 * que rendre la liste de nœuds et router les clics — `TreeRow` de `04` étant purement
 * présentationnelle, « elle ne connaît ni ses enfants, ni son état d'ouverture, ni le modèle de
 * données ».
 */
export function ExplorerSidebar({
  projects,
  deplies,
  charge,
  etatDe,
  selectedId = null,
  onToggle,
  onSelect,
  onAddDatabase,
  onRefresh,
  columns,
  width = 'wide',
}: ExplorerSidebarProps) {
  const [filtre, setFiltre] = useState('')

  const noeuds = useMemo(
    () => aplatir(projects, deplies, charge, etatDe),
    [projects, deplies, charge, etatDe],
  )

  const visibles = useMemo(() => filtrer(noeuds, filtre), [noeuds, filtre])

  return (
    <Sidebar
      width={width}
      filter={
        // Le compteur `n/m` de `04` sert ici : il dit combien de lignes **affichées** le filtre
        // retient, ce qui rappelle implicitement qu'il ne cherche pas au-delà.
        <SidebarFilterBar
          value={filtre}
          onChange={setFiltre}
          matchCount={filtre === '' ? undefined : visibles.length}
          totalCount={filtre === '' ? undefined : noeuds.length}
        />
      }
      footer={
        // `ConsoleFooterButton` de `04` n'est pas réemployé : son libellé est figé
        // (« Nouvelle console ») et sa hauteur est de 26 px, là où le pied de `A4` en fait 28 et
        // porte deux actions. Trois écarts sur un composant de dix lignes — le dupliquer serait
        // moins coûteux que le paramétrer, et `04` avait déjà noté sa dette de 26 px.
        <div className={styles.footer}>
          <button type="button" className={styles.add} onClick={onAddDatabase}>
            <Icon name="plus" size={12} strokeWidth={2.2} />
            Ajouter une base
          </button>
          <span className={styles.footerSpacer} />
          <button
            type="button"
            className={styles.refresh}
            onClick={onRefresh}
            aria-label="Rafraîchir"
          >
            <Icon name="refresh" size={13} strokeWidth={2} />
          </button>
        </div>
      }
    >
      {/* `role="tree"` et `treeitem` : l'arbre est aplati dans le DOM, donc `aria-level` porte la
          profondeur qu'une imbrication aurait donnée gratuitement. Sans lui, un lecteur d'écran
          annoncerait une liste plate de vingt éléments sans hiérarchie. */}
      <div role="tree" aria-label="Projets et bases" className={styles.tree}>
        {visibles.length === 0 && filtre !== '' && (
          <p className={styles.vide}>Aucune ligne affichée ne correspond à « {filtre} ».</p>
        )}
        {visibles.map((noeud) =>
          noeud.message ? (
            // Une ligne de message n'est pas un `treeitem` : ce n'est pas un nœud de l'arbre
            // mais un état de son chargement, et l'annoncer comme tel ferait compter un
            // enfant qui n'existe pas.
            <p key={noeud.id} className={styles.message} data-depth={noeud.depth}>
              {noeud.label}
            </p>
          ) : (
            <TreeRow
              key={noeud.id}
              // Le rôle est **sur la ligne elle-même**, qui est un `<button>` : une enveloppe le
              // portant mettrait l'élément interactif à l'intérieur du nœud d'arbre, où ni le
              // clic ni le focus ne le désignent.
              role="treeitem"
              aria-level={noeud.depth + 1}
              aria-expanded={noeud.chevron ? noeud.chevron === 'open' : undefined}
              aria-selected={noeud.id === selectedId}
              aria-label={noeud.announce}
              depth={noeud.depth}
              label={noeud.label}
              icon={noeud.icon as never}
              iconColor={noeud.iconColor}
              chevron={noeud.chevron}
              meta={noeud.meta}
              metaVariant={noeud.metaVariant}
              selected={noeud.id === selectedId}
              strong={noeud.kind === 'project'}
              trailing={
                noeud.badge ? (
                  <Badge tone={noeud.badge.tone} size="xs">
                    {noeud.badge.text}
                  </Badge>
                ) : undefined
              }
              onClick={() => {
                // Un clic sur une ligne dépliable fait les deux : il sélectionne *et* déplie. Le
                // mockup ne montre pas de zone de clic distincte pour le chevron, et en inventer
                // une réduirait la cible à onze pixels.
                onSelect(noeud)
                if (noeud.chevron) onToggle(noeud)
              }}
            />
          ),
        )}
      </div>
      {columns && (
        <section className={styles.colonnes}>
          <SidebarSectionTitle>Colonnes de {columns.table}</SidebarSectionTitle>
          {columns.loading ? (
            <p className={styles.message}>Chargement des colonnes…</p>
          ) : (
            <>
              {columns.columns.slice(0, APERCU_COLONNES).map((colonne) => (
                <ColumnRow
                  key={colonne.name}
                  label={colonne.name}
                  // La clé prime sur la catégorie : le mockup montre une icône de clé pour `id`
                  // et de clé étrangère pour `user_id`, et un glyphe de type pour les autres.
                  typeIcon={colonne.key === 'primary' ? 'key' : colonne.key ? 'fk' : undefined}
                  typeIconColor={colonne.key === 'primary' ? 'var(--gold)' : 'var(--info)'}
                  typeGlyph={colonne.key ? undefined : glypheDe(colonne.category)}
                  meta={colonne.typeName}
                />
              ))}
              {columns.columns.length > APERCU_COLONNES && (
                <ColumnRow label={`+ ${columns.columns.length - APERCU_COLONNES} autres`} summary />
              )}
            </>
          )}
        </section>
      )}
    </Sidebar>
  )
}

/**
 * Le glyphe de catégorie du mockup : `T` pour du texte, `#` pour un nombre, `⏱` pour une date.
 *
 * La catégorie vient de l'adaptateur (`06a`) et non d'une analyse du nom de type : dériver
 * « int8 » ou « bpchar » dans l'écran l'obligerait à connaître les types de sept moteurs.
 */
function glypheDe(category: ColumnInfo['category']): string {
  switch (category) {
    case 'number':
      return '#'
    case 'timestamp':
      return '⏱'
    case 'json':
      return '{}'
    case 'uuid':
      return 'ID'
    default:
      return 'T'
  }
}

/**
 * Le filtre, sur ce qui est **affiché**.
 *
 * Il ne peut pas trouver une table d'un schéma jamais déplié : elle n'a jamais traversé l'IPC.
 * Le placeholder de `SidebarFilterBar` — « Filtrer l'arborescence… », posé en `04` et confirmé
 * sur le mockup — le dit implicitement. La vraie réponse au besoin de chercher partout est la
 * recherche globale `⌘P`, hors périmètre de `09d`.
 *
 * **Les ancêtres d'une correspondance sont conservés** : filtrer sur « orders » sans garder son
 * schéma et sa base produirait une ligne orpheline, indentée sans parent visible.
 */
export function filtrer(noeuds: readonly Noeud[], filtre: string): Noeud[] {
  const terme = filtre.trim().toLowerCase()
  if (terme === '') return [...noeuds]

  const garde = new Set<string>()
  // Les ancêtres se retrouvent par la pile de profondeur : l'arbre étant aplati dans l'ordre du
  // parcours, le dernier nœud de profondeur n-1 est le parent.
  const pile: Noeud[] = []
  for (const noeud of noeuds) {
    pile.length = noeud.depth
    pile[noeud.depth] = noeud
    if (!noeud.message && noeud.label.toLowerCase().includes(terme)) {
      for (const ancetre of pile) if (ancetre) garde.add(ancetre.id)
    }
  }

  return noeuds.filter((noeud) => garde.has(noeud.id))
}
