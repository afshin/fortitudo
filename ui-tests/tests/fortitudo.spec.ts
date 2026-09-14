import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const standalone = 'http://127.0.0.1:8765/dist/standalone/';
const hosts = {
  standalone,
  jupyterlab: 'http://127.0.0.1:8766/fortitudo/lab',
  jupyterlite: 'http://127.0.0.1:8765/lite/_output/lab/index.html'
};

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  if (url !== standalone) {
    const launch = page.getByText('Open Fortitudo', { exact: true });
    const workbench = page.locator('#fortitudo-workbench');
    await expect(launch.first().or(workbench).first()).toBeVisible();
    if (!(await workbench.isVisible())) {
      await launch.first().click();
    }
  }
  await expect(
    page.getByRole('textbox', { name: 'Source code' })
  ).toBeVisible();
}

async function edit(page: Page, source: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Source code' });
  await editor.fill(source);
  await expect(editor.locator('.cm-line')).toHaveText(source.split('\n'));
}

async function compile(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Compilation complete'
    })
  ).toBeVisible();
}

for (const [host, url] of Object.entries(hosts)) {
  test(`${host}: edit, compile, inspect, restore${
    host === 'standalone' ? ' @compat' : ''
  }`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, url);
    await page.getByLabel('Language', { exact: true }).selectOption('cpp');
    await page
      .getByLabel('Target', { exact: true })
      .selectOption('wasm32-unknown-emscripten');
    await edit(page, 'int square(int x) { return x * x; }');
    const started = Date.now();
    await compile(page);
    await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
    await testInfo.attach('initial-compile.json', {
      body: JSON.stringify({ host, elapsedMs: Date.now() - started }),
      contentType: 'application/json'
    });
    await edit(page, 'int twice(int x) { return x + x; }');
    await expect(
      page.getByText('Out of date — compile to update')
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Source code' })
      .press('ControlOrMeta+Enter');
    await expect(page.getByLabel('Assembly output')).toContainText('twice');
    await edit(page, 'int broken() { return missing; }');
    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    const diagnostic = page.getByRole('button', {
      name: /error Line 1: use of undeclared identifier 'missing'/
    });
    await expect(diagnostic).toBeVisible();
    await diagnostic.click();
    await expect(
      page.getByRole('textbox', { name: 'Source code' })
    ).toBeFocused();
    await edit(page, 'int restored(int x) { return x + 9; }');
    await page.getByLabel('Optimization', { exact: true }).selectOption('3');
    await page.getByRole('button', { name: 'Close Fortitudo' }).click();
    await expect(page.locator('#fortitudo-workbench')).toHaveCount(0);
    await page.getByText('Open Fortitudo', { exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: 'Source code' })).toHaveText(
      'int restored(int x) { return x + 9; }'
    );
    await expect(page.getByLabel('Optimization', { exact: true })).toHaveValue(
      '3'
    );
    await expect(page.getByLabel('Assembly output')).toContainText(
      'Compile your source'
    );
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Source code' })).toHaveText(
      'int restored(int x) { return x + 9; }'
    );
    await expect(page.getByLabel('Assembly output')).toContainText(
      'Compile your source'
    );
    await page.screenshot({ path: testInfo.outputPath(`${host}.png`) });
    expect(errors).toEqual([]);
  });
}

test('invalid saved state falls back with feedback', async ({ page }) => {
  await page.goto(standalone);
  await page.evaluate(() => {
    localStorage.setItem('fortitudo:session:v1', '{"version":99}');
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Saved state is invalid');
  await expect(
    page.getByRole('textbox', { name: 'Source code' })
  ).toContainText('square');
});

test('missing assets, cancellation during loading, and retry', async ({
  page
}) => {
  await page.route('**/compiler/manifest.json', route =>
    route.fulfill({
      status: 404,
      body: 'Missing'
    })
  );
  await open(page, standalone);
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('404');
  await page.unroute('**/compiler/manifest.json');
  let release = () => {};
  const waiting = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/compiler/Compiler.wasm', async route => {
    await waiting;
    await route.continue().catch(() => {});
  });
  await page.getByRole('button', { name: 'Retry compilation' }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true })
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cancelled');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await compile(page);
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
});

test('corrupt Wasm produces a runtime failure and can recover', async ({
  page
}) => {
  await page.route('**/compiler/Compiler.wasm', route =>
    route.fulfill({
      contentType: 'application/wasm',
      body: 'invalid wasm'
    })
  );
  await open(page, standalone);
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry compilation' })
  ).toBeEnabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Retry compilation' }).click();
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
});

test('editing, cancellation during compilation, and retry', async ({
  page
}) => {
  await open(page, standalone);
  await compile(page);
  await edit(
    page,
    [
      'template<int N> int sum(int x) {',
      '  if constexpr (N == 0) return x;',
      '  else return sum<N - 1>(x) + sum<N - 1>(x + 1);',
      '}',
      'int slow(int x) { return sum<500>(x); }'
    ].join('\n')
  );
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Compiling');
  await edit(page, 'int after_cancel(int x) { return x + 7; }');
  await expect(
    page.getByRole('button', { name: 'Compile', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cancelled');
  await compile(page);
  await expect(page.getByLabel('Assembly output')).toContainText(
    'after_cancel'
  );
});

test('initialized compiler can compile changed source offline', async ({
  page,
  context
}) => {
  await open(page, standalone);
  await compile(page);
  await context.setOffline(true);
  await edit(page, 'int offline(int x) { return x - 3; }');
  await compile(page);
  await expect(page.getByLabel('Assembly output')).toContainText('offline');
  await context.setOffline(false);
});

test('redocking and resetting panes preserves editing state', async ({
  page
}) => {
  await open(page, standalone);
  await edit(page, 'int docked() { return 12; }');
  const source = page.getByRole('tabpanel', { name: 'Source', exact: true });
  const tab = page.getByRole('tab', { name: 'Diagnostics', exact: true });
  const from = await tab.boundingBox();
  const to = await source.boundingBox();
  if (!from || !to) {
    throw new Error('The workbench panes are not laid out.');
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 20
  });
  await page.mouse.up();
  await expect(
    page.locator('#fortitudo-workbench').getByRole('tablist')
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.locator('#fortitudo-workbench').getByRole('tablist')
  ).toHaveCount(2);
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source code' })).toHaveText(
    'int docked() { return 12; }'
  );
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await expect(
    page.locator('#fortitudo-workbench').getByRole('tablist')
  ).toHaveCount(3);
  await page.setViewportSize({ width: 650, height: 720 });
  await expect(
    page.getByRole('button', { name: 'Compile', exact: true })
  ).toBeInViewport();
  await compile(page);
  await expect(page.getByLabel('Assembly output')).toContainText('docked');
});

for (const asset of ['Compiler.js', 'Compiler.data']) {
  test(`missing ${asset} fails initialization and permits retry`, async ({
    page
  }) => {
    await page.route(`**/compiler/${asset}`, route =>
      route.fulfill({
        status: 404,
        body: 'Missing'
      })
    );
    await open(page, standalone);
    await page.getByRole('button', { name: 'Compile', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Retry compilation' })
    ).toBeEnabled();
    await page.unrouteAll();
    await page.getByRole('button', { name: 'Retry compilation' }).click();
    await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
  });
}
