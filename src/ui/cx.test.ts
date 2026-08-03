import { cx } from './cx'

test('joint les chaînes non vides par un espace', () => {
  expect(cx('a', 'b', 'c')).toBe('a b c')
})

test('filtre undefined, null, false et chaîne vide', () => {
  expect(cx('a', undefined, 'b', null, false, '', 'c')).toBe('a b c')
})

test('renvoie une chaîne vide sans argument valable', () => {
  expect(cx(undefined, null, false)).toBe('')
})
