import { expect, test } from '@playwright/test';

const site = 'http://127.0.0.1:8765/dist/site/';

test('site: compile and open JupyterLite', async ({ page }, testInfo) => {
  await page.goto(site);
  await page
    .getByRole('textbox', { name: 'Source code' })
    .fill('int square(int value) { return value * value; }');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
  await page.screenshot({ path: testInfo.outputPath('site.png') });

  const link = page.getByRole('link', { name: 'Open JupyterLite' });
  const popup = page.waitForEvent('popup');
  await link.click();
  const lite = await popup;
  await expect(lite).toHaveURL(`${site}lite/lab/index.html`);
  await lite.getByText('Open Fortitudo', { exact: true }).first().click();
  await lite
    .getByRole('textbox', { name: 'Source code' })
    .fill('int twice(int value) { return value + value; }');
  await lite.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(lite.getByLabel('Assembly output')).toContainText('twice');
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
});

for (const [file, outputs] of [
  ['Getting started.ipynb', ['C++ total: 42', 'square(7): 49']],
  ['C examples.ipynb', ['C square(7): 49', 'C total: 42']]
] as const) {
  test(`site: execute ${file} @compat`, async ({ page }, testInfo) => {
    const failures: string[] = [];
    page.on('pageerror', error => failures.push(error.message));
    const started = Date.now();
    await page.goto(
      `${site}lite/lab/index.html?path=${encodeURIComponent(file)}`
    );
    const notebook = page.locator('.jp-Notebook');
    await expect(notebook).toBeVisible();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
    await page
      .getByRole('menuitem', { name: 'Run All Cells', exact: true })
      .click();
    for (const output of outputs) {
      await expect(notebook.locator('.jp-OutputArea')).toContainText([output], {
        timeout: 120_000
      });
    }
    await expect(notebook.locator('.jp-OutputArea-error')).toHaveCount(0);
    expect(failures).toEqual([]);
    await testInfo.attach('kernel.json', {
      body: JSON.stringify({ file, elapsedMs: Date.now() - started }),
      contentType: 'application/json'
    });
  });
}
