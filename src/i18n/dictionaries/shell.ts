import type { Dictionnaire } from '../types'

// Rempli par l'écran « shell ». Voir dictionaries/index.ts pour l'assemblage.
export const shellFr: Dictionnaire = {
  miseAJour: {
    popoverTitle: (p) => `Version ${p.version}`,
    trigger: (p) => `${p.version} disponible`,
    noNotes: "Cette version n'a pas de notes.",
    install: 'Installer et redémarrer',
    installing: 'Téléchargement…',
    installFailed: "l'installation n'a pas abouti",
    warning: 'DoraBase se relance seul. Les consoles non enregistrées ne sont pas conservées.',
  },
  selectionIndicator: {
    prod: 'PROD',
    edition: 'Édition',
    readOnly: 'Lecture seule',
    productionAnnouncement: ' environnement de production',
    pendingChanges: (p) => ` ${p.count} modification${Number(p.count) > 1 ? 's' : ''} en attente`,
    status: {
      never: 'jamais connectée',
      connecting: 'connexion en cours',
      connected: (p) => `connectée · ${p.version}`,
      offline: (p) => `hors ligne · ${p.reason}`,
    },
  },
  statusBar: {
    projectCount: (p) => `${p.count} projet${Number(p.count) > 1 ? 's' : ''}`,
    paletteHint: '⌘K palette',
    version: (p) => `DoraBase ${p.version}`,
  },
  titleBar: {
    preferences: 'Préférences',
    preferencesDisabledTitle: 'Les préférences ne sont pas montées sur cet exemplaire de la barre.',
  },
}
export const shellEn: Dictionnaire = {
  miseAJour: {
    popoverTitle: (p) => `Version ${p.version}`,
    trigger: (p) => `${p.version} available`,
    noNotes: 'This version has no release notes.',
    install: 'Install and restart',
    installing: 'Downloading…',
    installFailed: 'the installation did not complete',
    warning: 'DoraBase restarts on its own. Unsaved consoles are not kept.',
  },
  selectionIndicator: {
    prod: 'PROD',
    edition: 'Editing',
    readOnly: 'Read only',
    productionAnnouncement: ' production environment',
    pendingChanges: (p) => ` ${p.count} pending change${Number(p.count) > 1 ? 's' : ''}`,
    status: {
      never: 'never connected',
      connecting: 'connecting',
      connected: (p) => `connected · ${p.version}`,
      offline: (p) => `offline · ${p.reason}`,
    },
  },
  statusBar: {
    projectCount: (p) => `${p.count} project${Number(p.count) > 1 ? 's' : ''}`,
    paletteHint: '⌘K palette',
    version: (p) => `DoraBase ${p.version}`,
  },
  titleBar: {
    preferences: 'Preferences',
    preferencesDisabledTitle: 'Preferences are not mounted on this instance of the bar.',
  },
}
