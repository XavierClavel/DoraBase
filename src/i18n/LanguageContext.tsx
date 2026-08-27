import { createContext, type ReactNode, useContext, useMemo } from 'react'
import type { Preferences } from '../domain/config'
import { detecterLangueSysteme } from './detecterLangueSysteme'
import { DICTIONNAIRES } from './dictionaries'
import type { Dictionnaire, Locale } from './types'

/**
 * La langue affichée, **le même mécanisme que `themeApplique`** (`preferences.ts`).
 *
 * `preferences.language === 'systeme'` ne désigne aucun dictionnaire par lui-même : c'est un
 * repli qui se résout au moment de l'appliquer, jamais une valeur stockée. `systeme` est
 * injectable pour les tests — la détection réelle ne dépend que de `navigator`.
 */
export function langueAppliquee(
  preferences: Pick<Preferences, 'language'>,
  systeme: Locale = detecterLangueSysteme(),
): Locale {
  return preferences.language === 'systeme' ? systeme : preferences.language
}

type ValeurContexte = {
  locale: Locale
  t: (cle: string, parametres?: Record<string, string | number>) => string
}

const LanguageContext = createContext<ValeurContexte | null>(null)

function resoudre(dictionnaire: Dictionnaire, chemin: string) {
  return chemin.split('.').reduce<Dictionnaire[string] | undefined>((noeud, segment) => {
    if (noeud !== null && typeof noeud === 'object' && segment in noeud) {
      return (noeud as Dictionnaire)[segment]
    }
    return undefined
  }, dictionnaire)
}

/**
 * Monté **une fois, à la racine de l'application** (`App.tsx`), comme les jetons de thème
 * posés sur `document.documentElement` : la langue est une propriété de l'application, pas
 * d'un écran.
 */
export function LanguageProvider({
  preferences,
  children,
}: {
  preferences: Pick<Preferences, 'language'>
  children: ReactNode
}) {
  const locale = langueAppliquee(preferences)

  const valeur = useMemo<ValeurContexte>(() => {
    function t(cle: string, parametres: Record<string, string | number> = {}) {
      // **Le français en repli, jamais la clé brute — sauf si les deux dictionnaires
      // l'ignorent.** Une clé manquante en anglais ne doit pas afficher un texte anglais à
      // moitié traduit ; une clé manquante partout est un défaut de développement, visible
      // à l'écran plutôt que de faire planter le rendu.
      const entree = resoudre(DICTIONNAIRES[locale], cle) ?? resoudre(DICTIONNAIRES.fr, cle)
      // Une clé qui désigne un sous-objet plutôt qu'une feuille est une erreur d'appelant : elle
      // rend la clé brute, au même titre qu'une clé absente, plutôt que `[object Object]`.
      if (typeof entree === 'string') return entree
      if (typeof entree === 'function') return entree(parametres)
      return cle
    }
    return { locale, t }
  }, [locale])

  return <LanguageContext.Provider value={valeur}>{children}</LanguageContext.Provider>
}

function useContexteRequis(nomDuHook: string): ValeurContexte {
  const contexte = useContext(LanguageContext)
  if (contexte === null) throw new Error(`${nomDuHook} doit être appelé sous LanguageProvider`)
  return contexte
}

/** La fonction de traduction courante — `t('preferences.general.language.title')`. */
export function useT() {
  return useContexteRequis('useT').t
}

/** La langue résolue (`'fr'` ou `'en'`, jamais `'systeme'`) — pour `lang` sur le document, par exemple. */
export function useLocale(): Locale {
  return useContexteRequis('useLocale').locale
}
