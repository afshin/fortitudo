# Browser acceptance tests

Run from the repository root using its single jlpm environment:

```sh
pixi run --as-is jlpm playwright install
pixi run --as-is jlpm test:browser
```

Inside a Pixi shell, omit `pixi run --as-is`. If your current directory is
`ui-tests`, select the root configuration explicitly:

```sh
jlpm playwright test --config ../playwright.config.mjs
```

Running `jlpm playwright test` from this directory without `--config` discovers
the test files but misses the root configuration. The test servers do not start,
so navigation fails with `ERR_CONNECTION_REFUSED`.

First build the compiler, production extension, standalone site, and Lite site
as described in CONTRIBUTING.md. The root Playwright configuration starts local
static and JupyterLab servers below non-root URLs. Locally it can reuse existing
servers on ports 8765 and 8766. The JupyterLab test server uses
`work/jupyter-config` for settings and saved workspaces so tests do not restore
your personal workspace. Servers started by Playwright stop when the run ends.

Chromium exercises all hosts and failure modes. Firefox and WebKit run the
standalone workflow and real compiler matrix. Results include compiler
measurements, screenshots, and traces for failures. Memory measurements observe
the worker's Wasm linear memory; they exclude browser overhead.

These tests use the actual shared workbench and actual compiler. They do not
need a kernel or a remote compilation service. The network-disconnect test
covers compilation after initialization, not offline page reload.

CI runs the full configured suite on main branch pushes, pull requests, and
release builds. It builds all hosts and installs the required browsers before
running `jlpm test:browser` from the repository root. Both publishing jobs wait
for these checks to pass.
