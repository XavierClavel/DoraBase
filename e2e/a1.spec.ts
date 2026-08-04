import { expect, test } from '@playwright/test'

test('A1 est conforme à la référence', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('a1-accueil.png', { fullPage: true })
})
