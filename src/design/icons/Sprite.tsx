import spriteSvg from './sprite.svg?raw'

// `<use href="fichier.svg#id">` ne convient pas ici : une référence externe ne fait pas
// hériter `currentColor` (les icônes sont colorées par `stroke: currentColor`), et la CSP
// de l'application interdit de toute façon les origines externes. On importe donc le
// sprite en brut via `?raw` de Vite et on l'injecte une fois dans le document ; `Icon` n'a
// plus qu'à référencer `#i-nom` par `<use>` interne.
//
// Un module ne s'exécute qu'une fois par process JS : cette variable au niveau module
// suffit à garantir qu'un second montage de `Sprite` (StrictMode, ou plusieurs points de
// montage) ne réinjecte pas le sprite une deuxième fois dans le DOM.
let injected = false

export function Sprite() {
  if (injected) return null
  injected = true
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sprite généré localement (icons:build), pas de contenu utilisateur
  return <div style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: spriteSvg }} />
}
