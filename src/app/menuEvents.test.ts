import { describe, expect, it, vi } from 'vitest'
import { brancherEvenementsDeMenu } from './menuEvents'

describe('les événements du menu natif', () => {
  it('achemine chaque identifiant de menu vers son action, et ignore les inconnus', () => {
    const exporter = vi.fn()
    const importer = vi.fn()
    const dire = brancherEvenementsDeMenu({ exporter, importer })

    dire('fichier.exporter-dump')
    dire('fichier.importer-dump')
    // Un menu à venir émettra des identifiants que ce mapping ne connaît pas encore : un
    // inconnu est ignoré, jamais levé.
    dire('fichier.inconnu')

    expect(exporter).toHaveBeenCalledOnce()
    expect(importer).toHaveBeenCalledOnce()
  })

  it('ignore un identifiant inconnu sans lever', () => {
    // Contrôle positif de l'assertion précédente : sans ce test, « ignore les inconnus »
    // ne serait vérifié que par l'absence d'appel, pas par l'absence de levée.
    const dire = brancherEvenementsDeMenu({ exporter: vi.fn(), importer: vi.fn() })
    expect(() => dire('edition.copier')).not.toThrow()
  })
})
