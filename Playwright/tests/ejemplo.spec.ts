import { test, expect } from '@playwright/test';

test('abre google y verifica titulo', async ({ page }) => {
  await page.goto('https://www.google.com');
  await expect(page).toHaveTitle(/Google/);
});
