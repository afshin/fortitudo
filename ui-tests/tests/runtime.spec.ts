import { expect, test } from '@playwright/test';

import type { Output } from '../../src/compiler/protocol';
import type { Options, Result } from '../../src/compiler/types';

const standalone = 'http://127.0.0.1:8765/dist/standalone/';

test('real compiler: standards, headers, targets, repetition @compat', async ({
  page
}, testInfo) => {
  await page.goto(standalone);
  const measurements = await page.evaluate(async () => {
    const base = new URL('compiler/', document.baseURI).href;
    // Observe real Wasm memory allocation without adding a production API.
    const probe = `
      let memory;
      const Memory = WebAssembly.Memory;
      WebAssembly.Memory = class extends Memory {
        constructor(options) { super(options); memory = this; }
      };
      const send = self.postMessage.bind(self);
      self.postMessage = message => send({
        ...message, memoryBytes: memory?.buffer.byteLength ?? null
      });
      await import(${JSON.stringify(`${base}worker.js`)});
      send({ kind: "probe-ready" });
    `;
    const blob = URL.createObjectURL(
      new Blob([probe], {
        type: 'text/javascript'
      })
    );
    const worker = new Worker(blob, { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      worker.onmessage = () => resolve();
      worker.onerror = event => reject(new Error(event.message));
    });
    let id = 0;
    function send(message: object): Promise<
      Output & {
        memoryBytes: number | null;
      }
    > {
      return new Promise((resolve, reject) => {
        worker.onerror = event => reject(new Error(event.message));
        worker.onmessage = event => {
          if (event.data.kind === 'progress') {
            return;
          } else if (event.data.kind === 'error') {
            reject(new Error(event.data.message));
          } else {
            resolve(event.data);
          }
        };
        worker.postMessage({ ...message, id: ++id });
      });
    }
    try {
      const start = performance.now();
      const ready = await send({ kind: 'initialize', base });
      if (ready.kind !== 'ready') {
        throw new Error('Expected capabilities.');
      }
      const initializationMs = performance.now() - start;
      const results: {
        name: string;
        result: Result;
        memoryBytes: number | null;
      }[] = [];
      async function compile(name: string, source: string, options: Options) {
        const response = await send({
          kind: 'compile',
          request: {
            id: id + 1,
            source,
            options
          }
        });
        if (response.kind !== 'result') {
          throw new Error('Expected a compiler result.');
        }
        results.push({
          name,
          result: response.result,
          memoryBytes: response.memoryBytes
        });
      }
      const options: Options = {
        language: 'cpp',
        target: 'wasm32-unknown-emscripten',
        optimization: 2
      };
      await compile(
        'c++23-headers',
        [
          '#include <vector>',
          '#include <cstdint>',
          'constexpr int answer = 42;',
          'int size(const std::vector<std::uint32_t>& v) {',
          '  if consteval { return answer; } else { return v.size(); }',
          '}'
        ].join('\n'),
        options
      );
      await compile(
        'c23-headers',
        [
          '#include <stdint.h>',
          'constexpr int answer = 42;',
          'uint32_t value(void) { return answer; }'
        ].join('\n'),
        { ...options, language: 'c' }
      );
      await compile('syntax-error', 'int broken( {', options);
      for (const target of ready.info.targets) {
        for (const optimization of [0, 1, 2, 3] as const) {
          await compile(
            `${target}-O${optimization}`,
            'int square(int x) { return x * x; }',
            { ...options, target, optimization }
          );
        }
        if (target !== options.target) {
          await compile(
            `${target}-no-system-headers`,
            '#include <stdio.h>\nint value() { return 42; }',
            { ...options, target }
          );
        }
      }
      return {
        info: ready.info,
        initializationMs,
        initialMemoryBytes: ready.memoryBytes,
        results
      };
    } finally {
      worker.terminate();
      URL.revokeObjectURL(blob);
    }
  });
  await testInfo.attach('compiler-measurements.json', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json'
  });
  expect(measurements.info.targets).toHaveLength(3);
  for (const { name, result } of measurements.results) {
    if (name === 'syntax-error' || name.endsWith('-no-system-headers')) {
      expect(result.exitCode, name).not.toBe(0);
      expect(result.diagnostics.length, name).toBeGreaterThan(0);
    } else {
      expect(result.exitCode, `${name}: ${result.stderr}`).toBe(0);
      expect(result.assembly.length, name).toBeGreaterThan(0);
      expect(result.commands, name).toHaveLength(3);
    }
  }
});

test('asset types and lazy MLIR loading', async ({ page, request }) => {
  const requested: string[] = [];
  page.on('request', req => requested.push(req.url()));
  await page.goto(standalone);
  await page.getByRole('button', { name: 'Compile', exact: true }).click();
  await expect(page.getByLabel('Assembly output')).toContainText('i32.mul');
  expect(requested.some(url => url.endsWith('.so'))).toBe(false);
  for (const [name, type] of [
    ['worker.js', /javascript/],
    ['Compiler.js', /javascript/],
    ['Compiler.wasm', /application\/wasm/],
    ['Compiler.data', /application\/octet-stream/]
  ] as const) {
    const response = await request.head(`${standalone}compiler/${name}`);
    expect(response.status(), name).toBe(200);
    expect(response.headers()['content-type'], name).toMatch(type);
  }
});
