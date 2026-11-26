import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Administrator password').fill('test-only-password-8942');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity.' })).toBeVisible();
}
test('landing, consent, missing-key error and mobile layout', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A little care. A real conversation.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('made-up name');
  await page.getByRole('button', { name: 'Agree & start call' }).click();
  await expect(page.locator('.error-notice')).toContainText('Voice setup is needed');
  await expect(page.getByRole('button', { name: 'Start new call' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start call', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'docs/preview-mobile.png', fullPage: true });
});
test('unauthorized patient views and cross-origin changes are rejected', async ({ request }) => {
  expect((await request.get('/api/admin/data')).status()).toBe(401);
  expect(
    (
      await request.post('/api/admin/action', {
        headers: { origin: 'https://untrusted.example' },
        data: { action: 'reset', confirmation: 'RESET DEMO DATA' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/session', {
        headers: { origin: 'http://localhost:3100' },
        data: { sdp: 'v=0 fake offer' },
      })
    ).status(),
  ).toBe(401);
});
test('admin books, reschedules and cancels a synthetic appointment', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'New demo booking' }).click();
  await page.getByLabel('Synthetic patient name').fill('E2E Synthetic Caller');
  await page.getByLabel('Available demo slot').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm demo booking' }).click();
  await expect(page.getByRole('status')).toContainText('Demo database updated');
  const row = page.getByRole('row').filter({ hasText: 'E2E Synthetic Caller' }).first();
  await expect(row).toContainText('confirmed');
  const ref = await row.locator('strong').first().innerText();
  await row.getByRole('button', { name: 'Reschedule' }).click();
  await page.getByLabel('New slot').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm reschedule' }).click();
  await expect(page.getByRole('status')).toContainText('updated');
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('row')
    .filter({ hasText: ref })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page.getByRole('row').filter({ hasText: ref })).toContainText('cancelled');
  await page.screenshot({ path: 'docs/preview-admin.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Administrator password')).toBeVisible();
});
test('knowledge, schedule editing and aggregate usage are accessible only after login', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Doctors & slots', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fictional doctor directory' })).toBeVisible();
  await page.getByRole('button', { name: 'Block slot' }).first().click();
  await expect(page.getByRole('button', { name: 'Open slot' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open slot' }).first().click();
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verified public information' })).toBeVisible();
  await page.getByRole('button', { name: 'Usage & settings', exact: true }).click();
  await expect(
    page.getByText('This local estimate is not authoritative billing', { exact: false }),
  ).toBeVisible();
});
test('desktop visual and no unexpected browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/preview-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
