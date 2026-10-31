import { test, expect } from '@playwright/test';

// The tests share one database state (reset by `pnpm e2e` before the run), so they run in order
// and only the first one loads the sample tickets.
test.describe.configure({ mode: 'serial' });

test('load samples, edit, approve and see Sent (mock)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('synthetic data, mock inbox, mock send');
  await expect(page.getByText('No tickets yet')).toBeVisible();

  await page.getByRole('button', { name: 'Load sample tickets' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Loaded 8 synthetic tickets/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: /Cannot log in/ }).click();
  await expect(page.getByRole('heading', { name: 'Reply draft' })).toBeVisible();
  await expect(page.getByText('Evidence:')).toBeVisible();
  await expect(page.locator('strong', { hasText: 'supported' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /\[1\].*·.*·\s*v\d+/ })).toBeVisible();

  const textarea = page.getByRole('textbox', { name: 'Reply text' });
  await textarea.fill('Hi Sam, use the Forgot password link on the login page. Best, Support');
  await page.getByRole('button', { name: /Edit & approve \(send mock\)/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Mock send');
  await expect(dialog).toContainText('sam@acme.example');
  await dialog.getByRole('button', { name: 'Confirm approve (mock)' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Sent (mock)' })).toBeVisible();

  await page.goto('/metrics');
  const tile = page.locator('div').filter({ has: page.getByText('Replies sent (mock)', { exact: true }) }).last();
  await expect(tile).toBeVisible();
  const count = Number((await tile.locator('dd').innerText()).trim());
  expect(count).toBeGreaterThanOrEqual(1);
});

test('an unmatched sender and an injection email are flagged, and a placeholder cannot be sent as is', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Slack setup/ }).click();
  await expect(page.getByText(/Unmatched sender/)).toBeVisible();

  await page.getByRole('link', { name: /^Question/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'looks like instructions' })).toBeVisible();

  await page.getByRole('link', { name: /Partnership idea/ }).click();
  await expect(page.getByRole('heading', { name: 'Reply draft' })).toBeVisible();
  const approve = page.getByRole('button', { name: /approve/i }).first();
  await expect(approve).toBeDisabled();
  await page.getByRole('textbox', { name: 'Reply text' }).fill('Thanks for reaching out. A teammate will follow up.');
  await expect(approve).toBeEnabled();
});

test('rejecting needs a reason, ends in rejected and sends nothing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Where is my invoice/ }).click();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm reject' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Reason for rejecting (required)').fill('Wrong tone for this customer');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByRole('status').filter({ hasText: /^Rejected:/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'nothing was delivered' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /approve/i })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Filter by status' }).getByRole('link', { name: 'rejected' }).click();
  await expect(page.getByRole('link', { name: /Where is my invoice/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Cannot log in/ })).toHaveCount(0);
});
