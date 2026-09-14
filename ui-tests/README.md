# Browser acceptance tests

Run from the repository root using its single jlpm environment:

```sh
pixi run --as-is jlpm playwright install
pixi run --as-is jlpm test:browser
```

First build the compiler, production extension, standalone site, and Lite site
as described in CONTRIBUTING.md. The root Playwright configuration starts local
static and JupyterLab servers below non-root URLs. Locally it can reuse existing
servers on ports 8765 and 8766.

Chromium exercises all hosts and failure modes. Firefox and WebKit run the
standalone workflow and real compiler matrix. Results include compiler
measurements, screenshots, and traces for failures. Memory measurements observe
the worker's Wasm linear memory; they exclude browser overhead.

These tests use the actual shared workbench and actual compiler. They do not
need a kernel or a remote compilation service. The network-disconnect test
covers compilation after initialization, not offline page reload.
