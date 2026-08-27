import type { Dictionnaire } from '../types'

// Rempli par l'écran « welcome ». Voir dictionaries/index.ts pour l'assemblage.
export const welcomeFr: Dictionnaire = {
  hero: {
    title: 'Prêt à explorer\xa0?',
    subtitle:
      "Crée un projet, branche ses bases, puis bascule de dev à prod d'un seul clic. Pas d'IDE à lancer.",
    newProject: 'Nouveau projet',
  },
  sidebar: {
    header: 'Mes projets',
    emptyTitle: 'Aucun projet',
    emptyText: 'Un projet regroupe plusieurs bases ; chacune se décline par environnement.',
    newProject: 'Nouveau projet',
  },
}

export const welcomeEn: Dictionnaire = {
  hero: {
    title: 'Ready to explore?',
    subtitle:
      'Create a project, connect its databases, then switch from dev to prod in one click. No IDE to launch.',
    newProject: 'New project',
  },
  sidebar: {
    header: 'My projects',
    emptyTitle: 'No projects',
    emptyText: 'A project groups several databases; each one comes in its own environment.',
    newProject: 'New project',
  },
}
