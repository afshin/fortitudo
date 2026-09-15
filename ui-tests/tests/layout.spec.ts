import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

const hosts = {
  standalone: 'http://127.0.0.1:8765/dist/standalone/',
  jupyterlab: 'http://127.0.0.1:8766/fortitudo/lab',
  jupyterlite: 'http://127.0.0.1:8765/dist/site/lite/lab/index.html'
};

async function expectUnclippedTabs(group: Locator): Promise<void> {
  const tabs = group.getByRole('tab');
  for (const tab of await tabs.all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(() =>
        tab.evaluate(element => {
          const bar = element.closest('.lm-TabBar');
          const label = element.querySelector('.lm-TabBar-tabLabel');
          if (!bar || !label) {
            return false;
          }
          const bounds = bar.getBoundingClientRect();
          const text = label.getBoundingClientRect();
          const hit = document.elementFromPoint(
            text.x + text.width / 2,
            text.y + text.height / 2
          );
          return (
            text.top >= bounds.top &&
            text.bottom <= bounds.top + bar.clientHeight &&
            hit !== null &&
            element.contains(hit)
          );
        })
      )
      .toBe(true);
  }
}

for (const [host, url] of Object.entries(hosts)) {
  test(`${host}: output tabs fit and sharing follows the host @compat`, async ({
    page
  }, testInfo) => {
    // Reset layout only resets Fortitudo, not Jupyter's saved sidebar widths.
    // Keep this geometry test independent of other tests and browser runs.
    const address =
      host === 'jupyterlab'
        ? `${url}/workspaces/fortitudo-layout-${testInfo.project.name}?reset`
        : url;
    await page.goto(address);
    if (host !== 'standalone') {
      await page.getByText('Open Fortitudo', { exact: true }).click();
    }
    await expect(page.getByLabel('Source code')).toBeVisible();
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(
      host === 'standalone' ? 1 : 0
    );
    await expect(page.getByRole('tab', { name: 'Outputs' })).toHaveCount(0);
    const outputs = page.getByRole('region', {
      name: 'Outputs',
      exact: true
    });
    await expectUnclippedTabs(outputs);
    await page.setViewportSize({ width: 850, height: 720 });
    await expect(
      outputs
        .getByRole('tab', { name: 'Object', exact: true })
        .locator('.lm-TabBar-tabLabel')
    ).toBeInViewport({ ratio: 1 });
    await expectUnclippedTabs(outputs);
    await page.getByRole('button', { name: 'Compare' }).click();
    const comparison = page.getByRole('region', {
      name: 'Comparison outputs',
      exact: true
    });
    await expect(comparison).toBeVisible();
    await expect(
      outputs
        .getByRole('tab', { name: 'LLVM IR', exact: true })
        .locator('.lm-TabBar-tabLabel')
    ).toBeInViewport({ ratio: 1 });
    await expect(
      comparison
        .getByRole('tab', { name: 'Optimized IR', exact: true })
        .locator('.lm-TabBar-tabLabel')
    ).toBeInViewport({ ratio: 1 });
    await expectUnclippedTabs(comparison);
    await page.screenshot({ path: testInfo.outputPath('output-layout.png') });
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expect(comparison).toHaveCount(0);
    await expect(outputs).toBeVisible();
  });
}
