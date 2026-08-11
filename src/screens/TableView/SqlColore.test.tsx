import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SqlColore } from './SqlColore'

/** Les classes appliquées, jeton par jeton — les couleurs elles-mêmes sont l'affaire de Playwright. */
function jetons(sql: string) {
  const { container } = render(<SqlColore texte={sql} />)
  return [...container.querySelectorAll('span')].map((span) => ({
    texte: span.textContent,
    classe: span.className,
  }))
}

test('les bornes de transaction ne sont pas colorées comme les instructions', () => {
  const vus = jetons("BEGIN;\nUPDATE t SET a = 'x';\nCOMMIT;")
  const begin = vus.find((jeton) => jeton.texte === 'BEGIN')
  const update = vus.find((jeton) => jeton.texte === 'UPDATE')
  // `BEGIN` est un mot-clé aussi : sans priorité, l'alternative générique le capterait et lui ôterait
  // la teinte qui le distingue. Le mockup en fait deux choses différentes — l'une encadre, l'autre
  // agit.
  expect(begin?.classe).not.toBe(update?.classe)
  expect(vus.find((jeton) => jeton.texte === 'COMMIT')?.classe).toBe(begin?.classe)
})

test('mots-clés, chaînes et nombres reçoivent trois classes distinctes', () => {
  const vus = jetons(`UPDATE t SET a = 'x' WHERE id = 42;`)
  const classes = new Set(
    ['UPDATE', 'SET', "'x'", '42'].map(
      (texte) => vus.find((jeton) => jeton.texte === texte)?.classe,
    ),
  )
  // Quatre jetons, trois classes : `UPDATE` et `SET` partagent la leur.
  expect(classes.size).toBe(3)
})

test('une chaîne contenant une apostrophe doublée reste un seul jeton', () => {
  const vus = jetons(`UPDATE t SET a = 'l''été' WHERE id = 1;`)
  // Découper à la première apostrophe interne colorerait « été » comme du code, et le lecteur
  // croirait à une erreur de génération là où le SQL est correct.
  expect(vus.some((jeton) => jeton.texte === "'l''été'")).toBe(true)
})

test('le texte est rendu intégralement, sans jeton perdu', () => {
  const sql =
    'BEGIN;\nUPDATE "public"."orders" SET "status" = \'shipped\' WHERE "id" = \'1\';\nCOMMIT;'
  const { container } = render(<SqlColore texte={sql} />)
  // **La garantie qui compte pour un bloc annoncé « SQL qui sera exécuté »** : la coloration ne doit
  // rien avaler. Un caractère perdu ferait relire un SQL différent de celui qui partira.
  expect(container.textContent).toBe(sql)
})
