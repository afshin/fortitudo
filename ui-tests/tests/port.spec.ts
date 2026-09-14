import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { initial, snapshot } from '../../src/model';
import { encodeShare } from '../../src/sharing';

const standalone = 'http://127.0.0.1:8765/dist/standalone/';

async function edit(page: Page, source: string) {
  await page.getByRole('textbox', { name: 'Source code' }).fill(source);
}
async function compile(page: Page) {
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText(
    'Compilation complete'
  );
}
async function tab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).first().click();
}

test('one compile fills outputs and comparison uses them @compat', async ({
  page
}, testInfo) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      if (message?.kind === 'compile') {
        const element = document.documentElement;
        element.dataset.compiles = String(
          Number(element.dataset.compiles ?? 0) + 1
        );
      }
      return send.call(
        this,
        message,
        Array.isArray(transfer) ? { transfer } : transfer
      );
    };
  });
  await page.goto(standalone);
  await edit(
    page,
    'extern "C" int square(int x) { return x*x; }\n' +
      'extern "C" int branch(int x) { return x > 2 ? square(x) : x+1; }'
  );
  await compile(page);
  await expect(
    page.getByLabel('Assembly output', { exact: true })
  ).toContainText('square');
  await tab(page, 'AST');
  await expect(page.getByLabel('AST output', { exact: true })).toContainText(
    'TranslationUnitDecl'
  );
  await expect(
    page.getByLabel('AST output', { exact: true })
  ).not.toContainText('$ clang');
  await tab(page, 'LLVM IR');
  await expect(page.getByLabel('LLVM IR — before passes output')).toContainText(
    'alloca'
  );
  await tab(page, 'Optimized IR');
  await expect(page.getByLabel('Optimized IR output')).toContainText('mul');
  await tab(page, 'Analysis');
  await expect(page.getByLabel('Analysis output')).toContainText(
    'DominatorTree'
  );
  await tab(page, 'Graphs');
  await expect(page.getByLabel('Function graph').locator('option')).toHaveCount(
    2
  );
  await expect(page.getByAltText('Compiler graph')).toBeVisible();
  await page.getByLabel('Function graph').selectOption({ index: 1 });
  await expect(page.getByAltText('Compiler graph')).toHaveJSProperty(
    'complete',
    true
  );
  await tab(page, 'Wasm Module');
  await expect(page.getByLabel('Wasm module output')).toContainText('i32(i32)');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('program.wasm');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(
    page.getByLabel('LLVM IR — before passes output').first()
  ).toBeVisible();
  await expect(page.getByLabel('Optimized IR output').last()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-compiles', '1');
  await page.screenshot({ path: testInfo.outputPath('comparison.png') });
  await page.reload();
  await expect(
    page.getByRole('tabpanel', { name: 'Comparison', exact: true })
  ).toBeVisible();
  await expect(
    page.getByLabel('LLVM IR — before passes output').first()
  ).toBeVisible();
  await expect(page.getByLabel('Optimized IR output').last()).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-compiles');
});

test('runner state, reset, NaN, and timeout @compat', async ({ page }) => {
  await page.goto(standalone);
  await edit(page, 'extern "C" int next() { static int x = 0; return ++x; }');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByLabel('Execution result')).toContainText('Return: 1');
  await page.getByRole('button', { name: 'Run function', exact: true }).click();
  await expect(page.getByLabel('Execution result')).toContainText('Return: 2');
  await page
    .getByRole('button', { name: 'Reset execution', exact: true })
    .click();
  await page.getByRole('button', { name: 'Run function', exact: true }).click();
  await expect(page.getByLabel('Execution result')).toContainText('Return: 1');
  await edit(page, 'extern "C" double value() { return __builtin_nan(""); }');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByLabel('Execution result')).toContainText(
    'Return: NaN'
  );
  await tab(page, 'Pipelines');
  await page.getByLabel('Execution timeout (seconds)').fill('0.1');
  await edit(
    page,
    'extern "C" int spin() { volatile unsigned x=0; while (1) x=x+1; }'
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByLabel('Run pane')).toContainText(
    'Execution timed out'
  );
  await edit(page, 'extern "C" int recovered() { return 42; }');
  await compile(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByLabel('Execution result')).toContainText('Return: 42');
});

test('LLVM, MLIR, commands, and invalid pass recovery @compat', async ({
  page
}) => {
  let drivers = 0;
  page.on('request', request => {
    if (request.url().endsWith('WasmBoltMlirOpt.so')) {
      drivers += 1;
    }
  });
  await page.goto(standalone);
  await page.getByLabel('Language', { exact: true }).selectOption('llvm');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await compile(page);
  expect(drivers).toBe(0);
  await tab(page, 'Terminal');
  await page
    .getByLabel('Compiler command')
    .fill(
      'opt "-passes=print<domtree>" -disable-output optimized.ll 2> tree.txt'
    );
  await page.getByRole('button', { name: 'Run command', exact: true }).click();
  await expect(page.getByLabel('Command log')).toContainText('Exit 0');
  await tab(page, 'Files');
  await page.getByLabel('Workspace file').selectOption('/workspace/tree.txt');
  await expect(page.getByLabel('File output')).toContainText('DominatorTree');
  await page.getByLabel('Language', { exact: true }).selectOption('mlir');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await compile(page);
  expect(drivers).toBe(1);
  await tab(page, 'MLIR');
  await expect(page.getByLabel('MLIR output')).toContainText('func.func @add');
  await tab(page, 'Graphs');
  await expect(page.getByAltText('Compiler graph')).toBeVisible();
  await tab(page, 'Pipelines');
  await page
    .getByLabel('MLIR pipeline', { exact: true })
    .fill('builtin.module(missing-pass)');
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Some outputs failed'
  );
  await page
    .getByLabel('MLIR pipeline', { exact: true })
    .fill('builtin.module(canonicalize,cse)');
  await compile(page);
  expect(drivers).toBe(1);
});

test('share links restore inputs without loading a compiler', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(standalone);
  await edit(page, '// λ\nint shared(int x) { return x+7; }');
  await tab(page, 'Pipelines');
  await page.getByLabel('LLVM pipeline', { exact: true }).fill('mem2reg');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Share link copied.');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain('fortitudo=');
  let loaded = false;
  const shared = await context.newPage();
  shared.on('request', request => {
    if (request.url().endsWith('Compiler.wasm')) {
      loaded = true;
    }
  });
  await shared.goto(url);
  await expect(
    shared.getByRole('textbox', { name: 'Source code' })
  ).toContainText('shared');
  await tab(shared, 'Pipelines');
  await expect(shared.getByLabel('LLVM pipeline', { exact: true })).toHaveValue(
    'mem2reg'
  );
  expect(loaded).toBe(false);
  await shared.close();
});

for (const [host, address] of [
  ['JupyterLab', 'http://127.0.0.1:8766/fortitudo/lab'],
  ['JupyterLite', 'http://127.0.0.1:8765/dist/site/lite/lab/index.html']
]) {
  test(`${host}: share links open without compilation`, async ({ page }) => {
    const source = 'int shared(int x) { return x + 23; }';
    const session = snapshot(initial());
    const url = new URL(address);
    url.searchParams.set('fortitudo', encodeShare({ ...session, source }));
    let compilerLoaded = false;
    page.on('request', request => {
      if (request.url().endsWith('Compiler.wasm')) {
        compilerLoaded = true;
      }
    });
    await page.goto(url.href);
    await expect(
      page.getByRole('textbox', { name: 'Source code' })
    ).toContainText(source);
    await expect(
      page.getByRole('button', { name: 'Compile', exact: true })
    ).toBeEnabled();
    expect(compilerLoaded).toBe(false);
    const edited = source + '\n// edited after opening the share';
    await page.getByRole('textbox', { name: 'Source code' }).fill(edited);
    await page
      .getByRole('tab', { name: 'Fortitudo', exact: true })
      .locator('.lm-TabBar-tabCloseIcon')
      .click();
    await expect(page.locator('#fortitudo-workbench')).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    await page.getByRole('menuitem', { name: /Command Palette/ }).click();
    const palette = page.locator('.lm-CommandPalette-input');
    await palette.fill('Open Fortitudo');
    await palette.press('Enter');
    await expect(
      page.getByRole('textbox', { name: 'Source code' }).locator('.cm-line')
    ).toHaveText(edited.split('\n'));
    expect(compilerLoaded).toBe(false);
  });
}
