import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

// `tauri dev` ne fait pas respecter la CSP de `tauri.conf.json` : ce garde-fou n'existe
// qu'en release sans ce plugin, et une source externe ajoutée par erreur passerait
// silencieusement en développement. On pose donc la même famille de contrainte sur le
// serveur Vite — avec les seuls écarts que le serveur de dev exige lui-même :
// `ws://localhost:5173` pour le WebSocket du rechargement à chaud, et
// `'unsafe-inline' 'unsafe-eval'` sur `script-src` pour la transformation à la volée de
// Vite. Aucun de ces deux écarts n'a de raison d'exister en production.
function devCsp(): Plugin {
  return {
    name: 'dev-csp',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost ws://localhost:5173; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        )
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devCsp()],
  clearScreen: false,
  // La version affichée (barre d'état, `tauri.conf.json`) vient du build, pas de l'IPC :
  // `getVersion()` échouerait sous Playwright, qui exécute l'app dans Chromium sans
  // runtime Tauri, et rendrait les captures de référence non déterministes.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'safari16.4', cssTarget: 'safari16.4' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Le glob par défaut de Vitest (`**/*.spec.ts`) ramasse aussi `e2e/*.spec.ts`, qui
    // importe son propre `test` depuis `@playwright/test` — Vitest l'exécute alors avec
    // sa fonction `test()` globale au lieu de celle de Playwright, et le fichier échoue
    // au chargement avec « did not expect test() to be called here ». Trouvé en CI,
    // reproduit en local : `pnpm test` sortait en 1 en silence, la ligne de résumé des
    // tests ne comptant pas une suite qui a échoué au chargement. `scripts/` est inclus
    // explicitement, ses `.test.mjs` n'étant pas sous `src/`.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
})
