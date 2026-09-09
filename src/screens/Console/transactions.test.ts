import { expect, test } from 'vitest'
import { DICTIONNAIRES } from '../../i18n/dictionaries'
import { ENGINE_ORDER } from '../NewConnection/engines'
import { raisonSansTransaction, TRANSACTIONS_MANUELLES_PAR_MOTEUR } from './transactions'

test('les trois moteurs relationnels tiennent une transaction, les quatre autres non', () => {
  // La table est typée `Record<Engine, …>`, donc un huitième moteur fait échouer la compilation.
  // Ce que le compilateur ne dit pas, c'est **lesquels** : un `true` posé par distraction sur
  // MongoDB ferait promettre à l'écran une transaction que le Rust refuse.
  expect(TRANSACTIONS_MANUELLES_PAR_MOTEUR).toEqual({
    postgresql: true,
    mysql: true,
    sqlite: true,
    mongodb: false,
    bigquery: false,
    redis: false,
    snowflake: false,
  })
})

test('un moteur qui tient une transaction n’a rien à expliquer', () => {
  expect(raisonSansTransaction('postgresql')).toBeNull()
  // **Et une console sans moteur connu non plus** : la galerie et les vitrines montent la console
  // sans connexion, et une raison affichée là ferait chercher un réglage qui n'existe pas.
  expect(raisonSansTransaction(undefined)).toBeNull()
})

test('chaque refus désigne une clé qui existe dans les deux langues', () => {
  // **Le seul garde-fou de ce chemin.** `raisonSansTransaction` rend une *clé*, que l'écran traduit :
  // une clé absente s'afficherait telle quelle dans la barre d'outils — « console.transaction.
  // raisons.mongodb » — et rien d'autre ne le dirait. C'est le pendant du test de parité, sur des
  // clés que personne n'écrit à la main.
  const refuses = ENGINE_ORDER.filter((moteur) => !TRANSACTIONS_MANUELLES_PAR_MOTEUR[moteur])
  expect(refuses.length).toBeGreaterThan(0)
  for (const moteur of refuses) {
    const cle = raisonSansTransaction(moteur)
    if (cle === null)
      throw new Error(`${moteur} ne tient pas de transaction : il doit dire pourquoi`)
    for (const [langue, dictionnaire] of Object.entries(DICTIONNAIRES)) {
      const raison = cle
        .split('.')
        .reduce<unknown>(
          (noeud, segment) =>
            noeud !== null && typeof noeud === 'object'
              ? (noeud as Record<string, unknown>)[segment]
              : undefined,
          dictionnaire,
        )
      expect(typeof raison, `${cle} en ${langue}`).toBe('string')
    }
  }
})
