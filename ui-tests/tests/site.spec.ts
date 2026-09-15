import { expect, test } from '@playwright/test';

const site = 'http://127.0.0.1:8765/dist/site/';

test('site: compile and navigate to JupyterLite @compat', async ({
  page
}, testInfo) => {
  await page.goto(site);
  await page
    .getByRole('textbox', { name: 'Source code' })
    .fill('int square(int value) { return value * value; }');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
  await page.screenshot({ path: testInfo.outputPath('site.png') });

  const link = page.getByRole('link', { name: 'Try in Jupyter', exact: true });
  const pages = page.context().pages().length;
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  await expect(page).toHaveURL(`${site}lite/lab/index.html`);
  expect(page.context().pages()).toHaveLength(pages);
  await page.getByText('Open Fortitudo', { exact: true }).first().click();
  await page
    .getByRole('textbox', { name: 'Source code' })
    .fill('int twice(int value) { return value + value; }');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByLabel('Assembly output')).toContainText('twice');
  await page.goBack();
  await expect(page).toHaveURL(site);
  await expect(
    page.getByRole('textbox', { name: 'Source code' })
  ).toContainText('int square(int value)');
});

for (const [file, outputs] of [
  ['C++ examples.ipynb', ['C++ total: 42', 'square(7): 49']],
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
    await notebook
      .getByRole('link', { name: 'Fortitudo guide' })
      .first()
      .click();
    const guide = page.locator('.jp-MarkdownViewer');
    await expect(
      guide.getByRole('heading', { name: 'Fortitudo guide' })
    ).toBeVisible();
    await expect(guide).toContainText('Repeated calls retain module state.');
    expect(failures).toEqual([]);
    await testInfo.attach('kernel.json', {
      body: JSON.stringify({ file, elapsedMs: Date.now() - started }),
      contentType: 'application/json'
    });
  });
}
