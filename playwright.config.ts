import { defineConfig } from '@playwright/test'

// Plusieurs worktrees de ce dépôt vivent côte à côte sur cette machine, et chacun lance son
// propre `pnpm dev`. Le premier démarré prend 5173, les suivants glissent sur 5174, 5175… Avec
// `reuseExistingServer`, une exécution de Playwright servait alors **l'application d'une autre
// branche** sans rien dire : trois références de `a1.spec.ts` ont été capturées ainsi, et le
// fichier `a2-nouvelle-connexion.spec.ts` a été déclaré « rouge depuis toujours » pour cette
// seule raison.
//
// D'où les deux moitiés de la parade : un port par worktree, choisi par l'appelant, et un
// serveur qu'on démarre toujours soi-même, en `--strictPort` pour qu'un port déjà pris fasse
// **échouer** l'exécution au lieu de la dérouter.
const port = Number(process.env.DORABASE_E2E_PORT ?? 5173)

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
    command: `pnpm dev --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    // La barre d'état affiche la version, donc **chaque capture pleine page la contient**. Figée
    // pour le décor, les références survivent aux publications au lieu de rougir à chaque
    // relèvement. La raison longue est dans `vite.config.ts`, au `define`.
    env: { DORABASE_VERSION_DECOR: '9.9.9' },
  },
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1360, height: 814 } },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0 } },
})
