import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

const hosts = {
  standalone: 'http://127.0.0.1:8765/dist/standalone/',
  jupyterlab: 'http://127.0.0.1:8766/llvm-explorer/lab',
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
    // Jupyter saves sidebar widths separately from the explorer's layout.
    // Keep this geometry test independent of other tests and browser runs.
    const workspace = `llvm-explorer-layout-${testInfo.project.name}`;
    const address =
      host === 'jupyterlab' ? `${url}/workspaces/${workspace}?reset` : url;
    await page.goto(address);
    if (host !== 'standalone') {
      await page.getByText('Open LLVM Explorer', { exact: true }).click();
    }
    await expect(page.getByLabel('Source code')).toBeVisible();
    for (const name of ['Compare', 'Reset layout']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
        0
      );
    }
    const source = page.getByRole('textbox', { name: 'Source code' });
    const original = await source.locator('.cm-line').allTextContents();
    const aboutButton = page.getByRole('button', {
      name: 'About',
      exact: true
    });
    const about = page.getByRole('dialog', { name: 'About LLVM Explorer' });
    if (host === 'standalone') {
      await page.context().setOffline(true);
    }
    await aboutButton.focus();
    await aboutButton.press('Enter');
    await expect(about).toBeVisible();
    await expect(about).toContainText('Anutosh Bhat');
    await expect(about.getByRole('link', { name: 'WasmBolt' })).toHaveAttribute(
      'href',
      'https://github.com/anutosh491/WasmBolt'
    );
    await about
      .getByRole('button', { name: 'Install LLVM Explorer', exact: true })
      .click();
    await expect(
      about.locator('pre').filter({ hasText: 'pip install llvm-explorer' })
    ).toBeInViewport();
    await about.getByRole('button', { name: 'Execution', exact: true }).click();
    await expect(
      about.getByRole('heading', { name: 'Execution', exact: true })
    ).toBeInViewport();
    await expect(about).toContainText('Repeated calls retain module state.');
    await page.keyboard.press('Escape');
    await expect(about).toHaveCount(0);
    await expect(aboutButton).toBeFocused();
    await aboutButton.click();
    await page.screenshot({ path: testInfo.outputPath('about.png') });
    await about.getByRole('button', { name: 'Close About' }).click();
    await expect(about).toHaveCount(0);
    await expect(source.locator('.cm-line')).toHaveText(original);
    if (host === 'standalone') {
      await page.context().setOffline(false);
    }
    await source.fill('int undo_after_resize() { return 42; }');
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(
      host === 'standalone' ? 1 : 0
    );
    await expect(page.getByRole('tab', { name: 'Outputs' })).toHaveCount(0);
    const outputs = page.getByRole('region', {
      name: 'Outputs',
      exact: true
    });
    const heading = page.getByRole('heading', { name: 'Source', exact: true });
    await expect(heading).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Source' })).toHaveCount(0);
    await expect
      .poll(async () => {
        const source = await heading.boundingBox();
        const tabs = await outputs.locator('.lm-TabBar').boundingBox();
        return (
          source !== null &&
          tabs !== null &&
          Math.abs(source.y - tabs.y) < 1 &&
          Math.abs(source.height - tabs.height) < 1
        );
      })
      .toBe(true);
    await expectUnclippedTabs(outputs);
    await page.setViewportSize({ width: 850, height: 720 });
    await expect(
      outputs
        .getByRole('tab', { name: 'Object', exact: true })
        .locator('.lm-TabBar-tabLabel')
    ).toBeInViewport({ ratio: 1 });
    await expectUnclippedTabs(outputs);
    const previous = await source.boundingBox();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const source = await heading.boundingBox();
        const primary = await outputs.boundingBox();
        return (
          source !== null &&
          primary !== null &&
          Math.abs(source.x - primary.x) < 1 &&
          Math.abs(source.width - primary.width) < 1 &&
          primary.y >= source.y + source.height
        );
      })
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath('narrow-layout.png') });
    await page.setViewportSize({ width: 850, height: 720 });
    await expect
      .poll(async () => {
        const restored = await source.boundingBox();
        return (
          restored !== null &&
          previous !== null &&
          Math.abs(restored.width - previous.width) < 1
        );
      })
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath('output-layout.png') });
    await source.press('ControlOrMeta+z');
    await expect(source.locator('.cm-line')).toHaveText(original);
  });
}
