import { ABSENT, formatBytes, formatCount } from './format'

// --- Comptes ---

test('sous mille, le compte est rendu tel quel', () => {
  // « 999 » et non « 1.0 k », qui serait faux, ni « 0.9 k », qui perdrait de la précision.
  expect(formatCount(0)).toBe('0')
  expect(formatCount(7)).toBe('7')
  expect(formatCount(999)).toBe('999')
})

test('zéro rend « 0 », pas « 0.0 k »', () => {
  expect(formatCount(0)).toBe('0')
})

test('les valeurs du mockup sont reproduites', () => {
  expect(formatCount(1_900_000)).toBe('1.9 M')
  expect(formatCount(128_000)).toBe('128 k')
})

test('une décimale sous dix, aucune au-delà', () => {
  expect(formatCount(1_200)).toBe('1.2 k')
  expect(formatCount(12_000)).toBe('12 k')
  expect(formatCount(9_900)).toBe('9.9 k')
})

test('le palier est franchi à mille exactement', () => {
  expect(formatCount(1_000)).toBe('1.0 k')
  // La frontière : 999 reste brut, 1000 s'abrège. C'est là qu'un `>` au lieu d'un `>=` se voit.
  expect(formatCount(999)).toBe('999')
})

// Les comptes sont en puissances de 1000, les tailles en puissances de 1024. Les confondre
// afficherait « 1.0 k » pour 1024 lignes — proche, et faux.
test('les comptes emploient les puissances de mille, pas de 1024', () => {
  expect(formatCount(1_024)).toBe('1.0 k')
  expect(formatCount(1_000_000)).toBe('1.0 M')
})

test('les quatre paliers existent', () => {
  expect(formatCount(5_000)).toBe('5.0 k')
  expect(formatCount(5_000_000)).toBe('5.0 M')
  expect(formatCount(5_000_000_000)).toBe('5.0 G')
  expect(formatCount(5e12)).toBe('5.0 T')
})

// `06c` traduit `reltuples = -1` — « jamais analysée » — en `0` côté Rust. Un négatif qui
// arriverait quand même ne doit pas rendre « -1 ».
test('un compte négatif rend le tiret, jamais un nombre négatif', () => {
  expect(formatCount(-1)).toBe(ABSENT)
})

test('une valeur non finie rend le tiret', () => {
  expect(formatCount(Number.NaN)).toBe(ABSENT)
  expect(formatCount(Number.POSITIVE_INFINITY)).toBe(ABSENT)
})

// --- Tailles ---

test('sous 1024 octets, la taille est en B', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(1023)).toBe('1023 B')
})

test('la valeur du mockup est reproduite', () => {
  // 2.1 GB : ce que le panneau de détail affiche pour `orders`.
  expect(formatBytes(2.1 * 1024 ** 3)).toBe('2.1 GB')
})

test('les tailles emploient les puissances de 1024', () => {
  expect(formatBytes(1024)).toBe('1.0 KB')
  expect(formatBytes(1024 ** 2)).toBe('1.0 MB')
  expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
})

test('les unités gardent la forme du handoff, pas la forme exacte', () => {
  // « GB » et non « GiB » : plus exact, et absent du mockup.
  expect(formatBytes(1024 ** 3)).toContain('GB')
  expect(formatBytes(1024 ** 3)).not.toContain('GiB')
})

test('l’unité s’arrête à PB plutôt que de manquer', () => {
  expect(formatBytes(1024 ** 6)).toContain('PB')
})

test('une taille négative rend le tiret', () => {
  expect(formatBytes(-1)).toBe(ABSENT)
})
