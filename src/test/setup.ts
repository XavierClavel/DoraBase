import '@testing-library/jest-dom/vitest'

// Node 26 expose un `localStorage` global expérimental, inactif sans `--localstorage-file` :
// son accesseur renvoie `undefined`. Sous Vitest, ce getter natif masque celui de jsdom —
// vérifié par sondes : `sessionStorage` de jsdom est bien un objet, `localStorage` non, et
// jsdom seul (hors Vitest) le fournit correctement. Le descripteur global est
// `configurable: true`, donc surchargeable ici.
//
// Sans ce correctif, tout accès à `localStorage` dans un test lève
// « Cannot read properties of undefined ». Les composants qui l'entourent d'un `try/catch`
// (voir `SplitPane`) dégradent proprement et **passeraient leurs tests sans rien
// persister** : c'est justement ce qui rendrait le défaut invisible. Le vrai runtime
// (WKWebView sous Tauri) n'est pas concerné.
if (globalThis.localStorage === undefined) {
  const entries = new Map<string, string>()

  const storage: Storage = {
    get length() {
      return entries.size
    },
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(String(key)) ?? null,
    setItem: (key, value) => {
      entries.set(String(key), String(value))
    },
    removeItem: (key) => {
      entries.delete(String(key))
    },
    clear: () => {
      entries.clear()
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })
}
