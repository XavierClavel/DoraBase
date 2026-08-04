import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // `forbidOnly` fait échouer la CI si un `test.only` reste oublié dans un commit — sans
  // ça, un tel oubli passerait la CI en silence en ne lançant qu'un sous-ensemble des
  // tests. `retries` absorbe la fragilité résiduelle d'un test e2e en CI sans jamais
  // masquer un échec local, qui reste immédiat.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `list` seul n'écrit rien sur disque : sans rapporteur `html`, l'artefact de CI
  // uploadé en cas d'échec serait vide — constaté en pratique, `playwright-report/`
  // n'existait pas après un échec.
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    // Servir une build résiduelle serait pire que perdre quelques secondes à en
    // redémarrer une : en CI, chaque exécution repart d'un serveur neuf.
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1360, height: 814 } },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0 } },
})
