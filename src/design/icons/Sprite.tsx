import spriteSvg from './sprite.svg?raw'

// `<use href="fichier.svg#id">` ne convient pas ici : une référence externe ne fait pas
// hériter `currentColor` (les icônes sont colorées par `stroke: currentColor`), et la CSP
// de l'application interdit de toute façon les origines externes. On importe donc le
// sprite en brut via `?raw` de Vite et on l'injecte dans le document ; `Icon` n'a plus
// qu'à référencer `#i-nom` par `<use>` interne.
//
// `Sprite` se monte une seule fois, à la racine de l'application (voir App.tsx). Le
// rendu est inconditionnel : sous `StrictMode`, React invoque la fonction de rendu deux
// fois pour détecter les effets de bord, et un drapeau au niveau du module (mis à `true`
// au premier appel) fait rendre `null` au second — celui que React commit. Un tel
// drapeau supprimerait donc le sprite du DOM réel en développement, sans jamais échouer
// au build (StrictMode ne double pas les rendus en production) : un écart dev/prod
// silencieux. Un double montage réel (erreur d'appel) produirait deux `<symbol>` de même
// identifiant, qui résolvent sans conséquence visible au premier — rien à défendre ici.
export function Sprite() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sprite généré localement (icons:build), pas de contenu utilisateur
  return <div style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: spriteSvg }} />
}
