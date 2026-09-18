import { expect, test } from '@playwright/test';

const sites = {
  site: 'http://127.0.0.1:8765/dist/site/',
  local: 'http://127.0.0.1:8767/'
};

for (const [host, site] of Object.entries(sites)) {
  test.describe(host, () => {
    test.beforeEach(async ({ context }) => {
      await context.route('https://api.github.com/**', route => route.abort());
      if (host === 'local') {
        await context.route(/^https?:/, route =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort()
        );
      }
    });

    test('accessible navigation icons @compat', async ({ page }, testInfo) => {
      const failures: string[] = [];
      page.on('pageerror', error => failures.push(error.message));
      await page.goto(site);
      const navigation = page.getByRole('navigation', {
        name: 'LLVM Explorer links'
      });
      const jupyter = navigation.getByRole('link', {
        name: 'Try in Jupyter',
        exact: true
      });
      const github = navigation.getByRole('link', {
        name: 'afshin/llvm-explorer on GitHub',
        exact: true
      });
      await expect(jupyter).toHaveAttribute(
        'title',
        'Try in Jupyter — C23 and C++23 notebooks'
      );
      await expect(github).toHaveAttribute(
        'title',
        'afshin/llvm-explorer on GitHub'
      );
      for (const link of [jupyter, github]) {
        await expect(link).toBeVisible();
        await expect(link).toHaveText('');
        await expect(link.locator('img')).toHaveAttribute('alt', '');
        await expect
          .poll(() =>
            link
              .locator('img')
              .evaluate(
                image =>
                  image instanceof HTMLImageElement && image.naturalWidth > 0
              )
          )
          .toBe(true);
      }
      await jupyter.focus();
      await expect(jupyter).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(github).toBeFocused();
      await navigation.screenshot({
        path: testInfo.outputPath('navigation.png')
      });
      await page.emulateMedia({ colorScheme: 'dark' });
      await navigation.screenshot({
        path: testInfo.outputPath('navigation-dark.png')
      });
      await page.setViewportSize({ width: 390, height: 850 });
      await navigation.screenshot({
        path: testInfo.outputPath('navigation-narrow.png')
      });
      await page.reload();
      await expect(jupyter).toBeVisible();
      await expect(github).toBeVisible();
      await expect(
        page.getByRole('textbox', { name: 'Source code' })
      ).toBeVisible();
      expect(failures).toEqual([]);
    });

    test('compile and navigate to JupyterLite @compat', async ({
      page
    }, testInfo) => {
      await page.goto(site);
      await page
        .getByRole('textbox', { name: 'Source code' })
        .fill('int square(int value) { return value * value; }');
      await page.getByRole('button', { name: 'Compile', exact: true }).click();
      await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
      await expect(
        page.getByRole('link', { name: 'afshin/llvm-explorer on GitHub' })
      ).toHaveAttribute('href', 'https://github.com/afshin/llvm-explorer');
      await page.screenshot({ path: testInfo.outputPath('site.png') });

      const link = page.getByRole('link', {
        name: 'Try in Jupyter',
        exact: true
      });
      const pages = page.context().pages().length;
      await expect(link).not.toHaveAttribute('target', '_blank');
      await link.click();
      await expect(page).toHaveURL(`${site}lite/lab/index.html`);
      expect(page.context().pages()).toHaveLength(pages);
      const home = page.getByRole('link', { name: 'LLVM Explorer home' });
      await expect(home).toHaveAttribute('href', site);
      await expect(page.locator('#jp-MainLogo')).toHaveCount(1);
      await expect(home.locator('img')).toHaveAttribute(
        'src',
        `${site}lite/icon.svg`
      );
      await expect
        .poll(() =>
          home
            .locator('img')
            .evaluate(
              image =>
                image instanceof HTMLImageElement && image.naturalWidth > 0
            )
        )
        .toBe(true);
      await page
        .getByText('Open LLVM Explorer', { exact: true })
        .first()
        .click();
      await page
        .getByRole('textbox', { name: 'Source code' })
        .fill('int twice(int value) { return value + value; }');
      await page.getByRole('button', { name: 'Compile', exact: true }).click();
      await expect(page.getByLabel('Assembly output')).toContainText('twice');
      await page.screenshot({ path: testInfo.outputPath('jupyterlite.png') });
      await home.click();
      expect(page.context().pages()).toHaveLength(pages);
      await expect(page).toHaveURL(site);
      await expect(
        page.getByRole('textbox', { name: 'Source code' })
      ).toContainText('int square(int value)');
      await page.goBack();
      await expect(page).toHaveURL(`${site}lite/lab/index.html`);
      await page.goBack();
      await expect(page).toHaveURL(site);
      const source = page.getByRole('textbox', { name: 'Source code' });
      await expect(source).toContainText('int square(int value)');
      await source.fill('int after_back() { return 1; }');
      await expect(source).toContainText('after_back');
    });

    for (const [language, file, outputs] of [
      ['C++23', 'C++ examples.ipynb', ['C++ total: 42', 'square(7): 49']],
      ['C23', 'C examples.ipynb', ['C square(7): 49', 'C total: 42']]
    ] as const) {
      test(`execute ${language} notebook @compat`, async ({
        page
      }, testInfo) => {
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
          await expect(notebook.locator('.jp-OutputArea')).toContainText(
            [output],
            {
              timeout: 120_000
            }
          );
        }
        await expect(notebook.locator('.jp-OutputArea-error')).toHaveCount(0);
        await notebook
          .getByRole('link', { name: 'LLVM Explorer guide' })
          .first()
          .click();
        const guide = page.locator('.jp-MarkdownViewer');
        await expect(
          guide.getByRole('heading', { name: 'LLVM Explorer guide' })
        ).toBeVisible();
        await expect(guide).toContainText(
          'Repeated calls retain module state.'
        );
        expect(failures).toEqual([]);
        await testInfo.attach('kernel.json', {
          body: JSON.stringify({ file, elapsedMs: Date.now() - started }),
          contentType: 'application/json'
        });
      });
    }
  });
}
