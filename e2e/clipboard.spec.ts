import { expect, test } from '@playwright/test';

/**
 * Copy buttons on a page without the clipboard API, as on the portal served by IRIS over plain
 * HTTP on a network address (browsers offer navigator.clipboard only on HTTPS and localhost): the
 * text is still copied, and the page says so.
 */
test('copies a request over plain HTTP, where the browser has no clipboard API', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false });
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
    // What the browser's copy command copies: the selected text of the focused text area.
    const copied: string[] = [];
    (window as unknown as { copied: string[] }).copied = copied;
    const exec = document.execCommand.bind(document);
    document.execCommand = (command: string, showUI?: boolean, value?: string) => {
      if (command === 'copy')
        copied.push((document.activeElement as HTMLTextAreaElement | null)?.value ?? '');
      return exec(command, showUI, value);
    };
  });
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto(
    `/#/explorer/${encodeURIComponent('/v2/database-dir')}?op=${encodeURIComponent('POST /v2/database-dir/compact')}`,
  );
  await page.getByRole('button', { name: 'Request for curl, VS Code and Postman' }).click();
  await page.getByRole('tab', { name: /\.http/ }).click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Copied to clipboard' })).toBeVisible();
  await expect(page.locator('.mantine-Notification-root', { hasText: 'Copied to clipboard' })).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
  expect(copied.at(-1)).toContain('POST {{baseUrl}}/api/admin/v2/database-dir/compact');
  // The focus is back on the button, not on the text area the copy used. The button says "Copied to
  // clipboard" for two seconds only, which a busy machine can outlast by now: find it by either label.
  await expect(page.getByRole('button', { name: /^(Copy|Copied to clipboard)$/ })).toBeFocused();
});
