import type { Dictionnaire } from '../types'

// Rempli par l'écran « structure ». Voir dictionaries/index.ts pour l'assemblage.
export const structureFr: Dictionnaire = {
  ddl: {
    panelLabel: (p) => `DDL de ${p.schema}.${p.table}`,
    titre: 'DDL',
    copier: 'Copier',
    mentionAvant: 'Reconstruit depuis le catalogue : équivalent au',
    mentionApres: 'd’origine, pas identique.',
    ouvrirDansLaConsole: 'Ouvrir dans la console',
    ouvrirDansLaConsoleDesactive: 'Aucune base ouverte : la console n’aurait rien à interroger.',
  },
  view: {
    lecture: 'Lecture de la structure…',
    aucuneTable: 'Ouvrez une table pour en voir la structure.',
    colonnesTableLabel: (p) => `Colonnes de ${p.schema}.${p.table}`,
    aucuneColonneNeCorrespond: (p) => `Aucune colonne ne correspond à « ${p.filtre} ».`,
    filtrerPlaceholder: 'Filtrer',
    filtrerAriaLabel: 'Filtrer les colonnes par nom ou par type',
    entetes: {
      rang: '#',
      colonne: 'colonne',
      type: 'type',
      nullable: 'null',
      defaut: 'défaut',
      cle: 'clé',
      commentaire: 'commentaire',
    },
    clePrimaire: 'clé primaire',
    cleEtrangere: 'clé étrangère',
    colonneDeduite: 'déduit du catalogue par DoraBase',
    colonneCommentee: 'commentaire de la colonne',
    comptes: {
      colonnes: (p) => `${Number(p.count)} colonne${Number(p.count) > 1 ? 's' : ''}`,
      index: (p) => `${Number(p.count)} index`,
      contraintes: (p) => `${Number(p.count)} contrainte${Number(p.count) > 1 ? 's' : ''}`,
    },
    panneaux: {
      titreIndex: 'Index',
      titreContraintes: 'Contraintes & triggers',
      aucunIndex: 'Aucun index.',
      aucuneContrainte: 'Aucune contrainte, aucun déclencheur.',
    },
  },
  statusBar: {
    ariaLabel: 'État de la structure',
    colonnes: (p) => `${Number(p.count)} colonnes`,
    index: (p) => `${Number(p.count)} index`,
    contraintes: (p) => `${Number(p.count)} contraintes`,
    lignes: (p) => `${Number(p.count)} lignes`,
  },
}

export const structureEn: Dictionnaire = {
  ddl: {
    panelLabel: (p) => `DDL for ${p.schema}.${p.table}`,
    titre: 'DDL',
    copier: 'Copy',
    mentionAvant: 'Rebuilt from the catalog: equivalent to the original',
    mentionApres: ', not identical.',
    ouvrirDansLaConsole: 'Open in console',
    ouvrirDansLaConsoleDesactive: 'No database open: the console would have nothing to query.',
  },
  view: {
    lecture: 'Reading structure…',
    aucuneTable: 'Open a table to see its structure.',
    colonnesTableLabel: (p) => `Columns of ${p.schema}.${p.table}`,
    aucuneColonneNeCorrespond: (p) => `No column matches “${p.filtre}”.`,
    filtrerPlaceholder: 'Filter',
    filtrerAriaLabel: 'Filter columns by name or type',
    entetes: {
      rang: '#',
      colonne: 'column',
      type: 'type',
      nullable: 'null',
      defaut: 'default',
      cle: 'key',
      commentaire: 'comment',
    },
    clePrimaire: 'primary key',
    cleEtrangere: 'foreign key',
    colonneDeduite: 'inferred from the catalog by DoraBase',
    colonneCommentee: 'column comment',
    comptes: {
      colonnes: (p) => `${Number(p.count)} column${Number(p.count) === 1 ? '' : 's'}`,
      index: (p) => `${Number(p.count)} index${Number(p.count) === 1 ? '' : 'es'}`,
      contraintes: (p) => `${Number(p.count)} constraint${Number(p.count) === 1 ? '' : 's'}`,
    },
    panneaux: {
      titreIndex: 'Index',
      titreContraintes: 'Constraints & triggers',
      aucunIndex: 'No index.',
      aucuneContrainte: 'No constraints, no triggers.',
    },
  },
  statusBar: {
    ariaLabel: 'Structure status',
    colonnes: (p) => `${Number(p.count)} columns`,
    index: (p) => `${Number(p.count)} index`,
    contraintes: (p) => `${Number(p.count)} constraints`,
    lignes: (p) => `${Number(p.count)} rows`,
  },
}
