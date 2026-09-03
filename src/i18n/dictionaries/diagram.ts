import type { Dictionnaire } from '../types'

// Le diagramme de structure d'un schéma. Voir dictionaries/index.ts pour l'assemblage.
export const diagramFr: Dictionnaire = {
  boite: {
    // Le nom accessible d'une boîte. **Les espaces y sont explicites** et les deux comptes en font
    // partie : c'est l'information, et elle n'est écrite nulle part ailleurs (piège n° 1).
    label: (p) =>
      `${p.table} · ${p.colonnes} colonne${Number(p.colonnes) > 1 ? 's' : ''} · ${p.liens} lien${
        Number(p.liens) > 1 ? 's' : ''
      }`,
    reste: (p) => `+ ${p.count} autre${Number(p.count) > 1 ? 's' : ''}`,
  },
  ligne: {
    nullable: 'peut être nul',
    nonNullable: 'jamais nul',
    reference: (p) => `référence ${p.cible}`,
  },
  colonnes: {
    // **Le libellé dit ce que le réglage fait, non ce qu'il filtre.** « Clés | Toutes » se lisait
    // comme un filtre sur une nature de colonne, sans annoncer que des lignes étaient masquées.
    toutes: 'Toutes les colonnes',
  },
  chargement: 'Lecture…',
  recherche: {
    // **« table ou colonne », parce que le champ cherche les deux** : annoncer « une table » ferait
    // chercher ailleurs pour une colonne, et ne rien annoncer laisserait deviner.
    placeholder: 'Chercher une table, une colonne…',
    label: 'Chercher une table ou une colonne dans le diagramme',
    compte: (p) => `${p.count} trouvée${Number(p.count) > 1 ? 's' : ''}`,
    aucune: 'aucune',
  },
  zoom: {
    moins: 'Réduire',
    plus: 'Agrandir',
    reinitialiser: (p) => `Échelle ${p.pourcentage} % — revenir à 100 %`,
  },
  vide: {
    aucuneTable: (p) => `Le schéma ${p.schema} ne contient aucune table.`,
    lecture: (p) => `Lecture des structures… ${p.lues} / ${p.total}`,
  },
  statusBar: {
    ariaLabel: 'Résumé du diagramme',
    tables: (p) => `${p.count} table${Number(p.count) > 1 ? 's' : ''}`,
    lues: (p) => `${p.lues} / ${p.total} tables lues`,
    plafonnees: (p) => `${p.montrees} des ${p.total} tables`,
    // **Le critère, puis les noms.** « n des m tables » disait qu'il manquait quelque chose sans
    // dire quoi ni selon quelle règle — la question s'est posée telle quelle.
    plafonneesRaison: (p) =>
      `Le diagramme s’arrête à ${p.plafond} tables, prises dans l’ordre alphabétique. ` +
      `Absentes du dessin : ${p.omises}`,
    liens: (p) => `${p.count} lien${Number(p.count) > 1 ? 's' : ''}`,
    externes: (p) => `${p.count} hors du schéma`,
  },
}

export const diagramEn: Dictionnaire = {
  boite: {
    label: (p) =>
      `${p.table} · ${p.colonnes} column${Number(p.colonnes) === 1 ? '' : 's'} · ${p.liens} link${
        Number(p.liens) === 1 ? '' : 's'
      }`,
    reste: (p) => `+ ${p.count} more`,
  },
  ligne: {
    nullable: 'nullable',
    nonNullable: 'not null',
    reference: (p) => `references ${p.cible}`,
  },
  colonnes: {
    toutes: 'All columns',
  },
  chargement: 'Reading…',
  recherche: {
    placeholder: 'Find a table, a column…',
    label: 'Find a table or a column in the diagram',
    compte: (p) => `${p.count} found`,
    aucune: 'none',
  },
  zoom: {
    moins: 'Zoom out',
    plus: 'Zoom in',
    reinitialiser: (p) => `Scale ${p.pourcentage} % — back to 100 %`,
  },
  vide: {
    aucuneTable: (p) => `Schema ${p.schema} contains no table.`,
    lecture: (p) => `Reading structures… ${p.lues} / ${p.total}`,
  },
  statusBar: {
    ariaLabel: 'Diagram summary',
    tables: (p) => `${p.count} table${Number(p.count) === 1 ? '' : 's'}`,
    lues: (p) => `${p.lues} / ${p.total} tables read`,
    plafonnees: (p) => `${p.montrees} of ${p.total} tables`,
    plafonneesRaison: (p) =>
      `The diagram stops at ${p.plafond} tables, taken in alphabetical order. ` +
      `Missing from the drawing: ${p.omises}`,
    liens: (p) => `${p.count} link${Number(p.count) === 1 ? '' : 's'}`,
    externes: (p) => `${p.count} outside the schema`,
  },
}
