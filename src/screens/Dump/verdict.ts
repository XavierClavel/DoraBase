import type { DumpAvailability } from '../../domain/dump'
import { ENGINES } from '../NewConnection/engines'

/**
 * Le sens de l'opération. **Les messages en dépendent** : « pas encore disponible »
 * s'applique à l'export d'un MySQL comme à son import, mais le binaire cherché n'est pas le
 * même (`pg_dump` contre `psql`), et un message qui dirait « export » devant une modale
 * d'import ferait douter de ce qu'on est en train de faire.
 */
export type SensDuDump = 'export' | 'import'

/** La fonction de traduction, telle que `useT()` la rend. */
type Traduire = (cle: string, parametres?: Record<string, string | number>) => string

/** `17.4`, à partir d'une version projetée depuis Rust. */
export function versionLisible(version: { majeure: number; mineure: number }): string {
  return `${version.majeure}.${version.mineure}`
}

/**
 * Le titre de la modale, **et son nom accessible**, par verdict.
 *
 * Cinq messages distincts, parce que « indisponible » recouvre cinq situations : un outil
 * absent s'installe, un outil trop vieux se met à jour, un moteur pas encore fait s'attend,
 * et un moteur sans outil local ne viendra jamais. Un message commun ferait chercher une
 * solution là où il n'y en a pas, ou renoncer là où il suffit d'installer un paquet.
 *
 * **Les clés sont doublées par sens** (`readyExport` / `readyImport`) plutôt que composées
 * d'un fragment traduit : « l'export » et « l'import » ne se substituent pas proprement dans
 * une phrase anglaise, et un dictionnaire qui assemble des morceaux se casse à la première
 * langue qui accorde autrement.
 */
export function titreDuVerdict(
  availability: DumpAvailability,
  sens: SensDuDump,
  t: Traduire,
): string {
  const suffixe = sens === 'export' ? 'Export' : 'Import'
  switch (availability.kind) {
    case 'ready':
      return t(`dump.verdict.ready${suffixe}`)
    case 'toolMissing':
      return t('dump.verdict.toolMissing', { binary: availability.binary })
    case 'toolTooOld':
      return t('dump.verdict.toolTooOld')
    case 'notYetSupported':
      return t(`dump.verdict.notYetSupported${suffixe}`)
    case 'noLocalDump':
      return t(`dump.verdict.noLocalDump${suffixe}`)
  }
}

/** Ce que la modale explique sous le titre, pour chaque verdict. */
export function explicationDuVerdict(
  availability: DumpAvailability,
  sens: SensDuDump,
  t: Traduire,
): string {
  switch (availability.kind) {
    case 'ready':
      return t('dump.explanation.ready', {
        tool: availability.tool,
        version: versionLisible(availability.version),
      })
    case 'toolMissing':
      return t('dump.explanation.toolMissing', { binary: availability.binary })
    case 'toolTooOld':
      return t('dump.explanation.toolTooOld', {
        tool: versionLisible(availability.tool),
        server: versionLisible(availability.server),
      })
    case 'notYetSupported':
      return t(`dump.explanation.notYetSupported${sens === 'export' ? 'Export' : 'Import'}`, {
        engine: ENGINES[availability.engine].label,
      })
    case 'noLocalDump':
      return t('dump.explanation.noLocalDump', { engine: ENGINES[availability.engine].label })
  }
}
