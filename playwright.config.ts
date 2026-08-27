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
  // **Playwright ne met qu'un seul worker sous `CI`**, et personne ne l'avait demandé : c'est
  // son défaut. Les 251 tests s'exécutaient donc en file indienne, six minutes, au milieu du
  // job qui construit le bundle. Deux workers par tranche sur un runner à trois cœurs — le
  // serveur Vite occupe le reste, et pousser à trois ne gagne que de la contention. Mesuré en
  // local : 1 min 36 pour la suite entière à quatre workers, 1 min 48 et 1 min 12 pour les
  // deux tranches à deux workers — et aucun test instable dans les trois exécutions.
  workers: process.env.CI ? 2 : undefined,
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
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1360, height: 814 },
    // **Figée, comme la version** (voir `DORABASE_VERSION_DECOR` ci-dessus) — même raison, un
    // symptôme différent : depuis que « Système » résout `navigator.language` (26 août 2026), la
    // langue affichée par défaut suivrait le Chromium de la machine qui exécute la suite. Une CI et
    // un poste de développement n'ont pas la même locale système, ce qui aurait fait dépendre les
    // captures de fidélité et les assertions de texte — toutes en français — de la machine plutôt
    // que du code.
    locale: 'fr-FR',
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0 } },
})
