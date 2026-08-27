import type { Dictionnaire } from '../types'

// Rempli par l'écran « newProject ». Voir dictionaries/index.ts pour l'assemblage.
export const newProjectFr: Dictionnaire = {
  title: 'Nouveau projet',
  cancel: 'Annuler',
  continueButton: 'Continuer',
  stepper: {
    project: 'PROJET',
    connection: 'CONNEXION',
  },
  nameLabel: 'Nom du projet',
  namePlaceholder: 'Atelier Nord',
  note: 'Un projet regroupe plusieurs bases ; chacune se déclare dans un environnement.',
  environmentsTitle: 'Environnements',
  environmentLabel: (p) => `Libellé de l’environnement ${p.index}`,
  environmentFallback: (p) => `l’environnement ${p.index}`,
  productionFor: (p) => `Production pour ${p.label}`,
  productionText: 'Production',
  remove: (p) => `Retirer ${p.label}`,
  removeLastTitle: 'Un projet a besoin d’au moins un environnement.',
  addEnvironment: '+ Ajouter un environnement',
  errors: {
    nameRequired: 'Donnez un nom au projet.',
    nameTaken: (p) => `Un projet s’appelle déjà « ${p.name} ».`,
    labelRequired: 'Chaque environnement a besoin d’un libellé.',
    duplicateLabel: (p) => `Deux environnements s’appellent « ${p.label} ».`,
  },
}

export const newProjectEn: Dictionnaire = {
  title: 'New project',
  cancel: 'Cancel',
  continueButton: 'Continue',
  stepper: {
    project: 'PROJECT',
    connection: 'CONNECTION',
  },
  nameLabel: 'Project name',
  namePlaceholder: 'Atelier Nord',
  note: 'A project groups several databases; each one is declared in an environment.',
  environmentsTitle: 'Environments',
  environmentLabel: (p) => `Label for environment ${p.index}`,
  environmentFallback: (p) => `environment ${p.index}`,
  productionFor: (p) => `Production for ${p.label}`,
  productionText: 'Production',
  remove: (p) => `Remove ${p.label}`,
  removeLastTitle: 'A project needs at least one environment.',
  addEnvironment: '+ Add an environment',
  errors: {
    nameRequired: 'Give the project a name.',
    nameTaken: (p) => `A project is already named “${p.name}”.`,
    labelRequired: 'Every environment needs a label.',
    duplicateLabel: (p) => `Two environments are named “${p.label}”.`,
  },
}
