// Compose des classes CSS Modules en filtrant les valeurs fausses.
//
// `noUncheckedIndexedAccess` type `styles[key]` en `string | undefined`, et la règle
// Biome `noNonNullAssertion` interdit le `!` qui lèverait l'ambiguïté. `cx` absorbe
// ce croisement une bonne fois : les six primitives du design system s'en servent
// pour composer leurs classes conditionnelles sans jamais toucher à un `!`.
type ClassValue = string | false | null | undefined

export function cx(...parts: ClassValue[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ')
}
