import { extractSymbols } from './extract-icons.mjs'

const html = `<svg><symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14"/></symbol>
<symbol id="logo" viewBox="0 0 512 512"><path d="M0 0h1v1H0z"/></symbol>
<symbol id="autre" viewBox="0 0 24 24"><path d="M0 0"/></symbol></svg>`

test('retient les symboles i-* et le logo, ignore le reste', () => {
  expect(extractSymbols(html).map((s) => s.id)).toEqual(['i-plus', 'logo'])
})

test('conserve le contenu du symbole tel quel', () => {
  expect(extractSymbols(html)[0].inner).toBe('<path d="M12 5v14"/>')
})

test('conserve le viewBox de chaque symbole', () => {
  expect(extractSymbols(html).map((s) => s.viewBox)).toEqual(['0 0 24 24', '0 0 512 512'])
})
