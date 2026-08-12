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

// CodeMirror (`12b`) **mesure** son texte pour placer le curseur et calculer les hauteurs de ligne :
// il appelle `getClientRects()` sur un `Range`, que jsdom n'implémente pas. Sans ce complément, la
// vue lève neuf exceptions non gérées par run — et Vitest fait échouer la suite entière, alors que
// tous les tests passent : un mode d'échec particulièrement déroutant.
//
// **Un tableau vide est la bonne réponse ici**, pas une mesure inventée : dire « aucun rectangle »
// laisse CodeMirror conclure qu'il ne peut pas mesurer, ce qui est exactement la vérité sous jsdom.
// Rendre des dimensions plausibles ferait croire à une mise en page qui n'existe pas — et c'est
// Playwright qui vérifie tout ce qui dépend d'une mesure réelle.
if (typeof Range !== 'undefined' && Range.prototype.getClientRects === undefined) {
  Range.prototype.getClientRects = () =>
    Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}
