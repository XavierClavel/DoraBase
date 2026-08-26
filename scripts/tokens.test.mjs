import { emitCss, emitTs, flatten, separerThemes } from './tokens.mjs'

const tree = {
  surface: { canvas: '#EFEAE0', paper: '#FBF7EF' },
  ink: { base: '#23201C', 2: 'rgba(35,32,28,.55)' },
}

test('aplatit en joignant par tiret et absorbe la clé base', () => {
  expect(flatten(tree)).toEqual({
    'surface-canvas': '#EFEAE0',
    'surface-paper': '#FBF7EF',
    ink: '#23201C',
    'ink-2': 'rgba(35,32,28,.55)',
  })
})

test('émet un bloc :root trié', () => {
  expect(emitCss(flatten(tree))).toContain('  --surface-canvas: #EFEAE0;')
  expect(emitCss(flatten(tree))).toMatch(/^:root \{/m)
})

test('émet un type TokenName et des références var()', () => {
  const ts = emitTs(flatten(tree))
  expect(ts).toContain("'surface-canvas': 'var(--surface-canvas)'")
  expect(ts).toContain('export type TokenName')
})

test('les deux sorties portent l’en-tête « ne pas éditer »', () => {
  for (const output of [emitCss(flatten(tree)), emitTs(flatten(tree))]) {
    expect(output.startsWith('/* Généré par pnpm tokens:build — ne pas éditer */\n')).toBe(true)
    expect(output).toContain('biome-ignore-all format')
  }
})

test('aplatit une imbrication à trois niveaux', () => {
  expect(flatten({ surface: { overlay: { base: '#000', hover: '#111' } } })).toEqual({
    'surface-overlay': '#000',
    'surface-overlay-hover': '#111',
  })
})

test('sépare le sous-arbre « nuit » du thème clair', () => {
  const { clair, nuit } = separerThemes({ ...tree, nuit: { ink: { base: '#EDE7DA' } } })
  expect(clair.nuit).toBeUndefined()
  expect(flatten(nuit)).toEqual({ ink: '#EDE7DA' })
  // Sans sous-arbre « nuit », la séparation rend un objet vide — pas `undefined`.
  expect(separerThemes(tree).nuit).toEqual({})
})

test('émet le sombre sur l’attribut **et** sous la requête média', () => {
  const css = emitCss(flatten(tree), { ink: '#EDE7DA' })
  expect(css).toMatch(/^:root\[data-theme="nuit"\] \{$/m)
  // Le `:not([data-theme="cahier"])` est ce qui laisse « Cahier » clair sur un macOS en sombre :
  // « Système » ne pose **aucun** attribut, donc c'est l'absence que la requête média rattrape.
  expect(css).toMatch(
    /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="cahier"\]\) \{/,
  )
  expect(css).toContain('    --ink: #EDE7DA;')
})

test('sans jeton sombre, le CSS n’a que le bloc clair', () => {
  const css = emitCss(flatten(tree))
  expect(css).not.toContain('data-theme')
  expect(css).not.toContain('prefers-color-scheme')
})

test('un jeton sombre sans équivalent clair arrête le générateur', () => {
  // Il ne casserait rien de visible — ni TypeScript, ni Vitest, ni l'œil : c'est ce qui en fait un
  // piège. `tokens.ts` ne connaît que les noms du thème clair.
  expect(() => emitCss(flatten(tree), { 'ink-inexistant': '#000' })).toThrow(/ink-inexistant/)
})
