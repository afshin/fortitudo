# Contributing

Read [AGENTS.md](AGENTS.md) before editing. Git staging, commits, and history
operations belong to the user. Keep handwritten source and prose within 80
columns, use strict types, and keep domain code independent of hosts.

## Environment

Install Pixi, then run from this repository on macOS arm64 or Linux x64:

```sh
pixi install --locked
pixi run --as-is jlpm install --immutable
```

`pixi.lock` covers Python, Node, JupyterLab, the extension builder, JupyterLite,
and packaging tools. `yarn.lock` covers all JavaScript code and tests. Use jlpm
throughout. `--as-is` uses the already installed Pixi environment without
synchronizing it on each invocation. After changing `pixi.toml`, run
`pixi install` to update the environment and lock.

## First build

```sh
pixi run --as-is jlpm build:compiler
pixi run --as-is jlpm build:prod
pixi run --as-is python -m pip install --no-build-isolation --no-deps -e .
pixi run --as-is jupyter-builder develop . --overwrite
pixi run --as-is jlpm build:standalone
pixi run --as-is node scripts/lite.mjs
```

The compiler build downloads pinned toolchain packages and version-matched LLVM
sources, validates their checksums and source adjustments, then builds and
stages the runtime. Allow several gigabytes of disk space and several minutes
for the first build. It does not use or modify a sibling WasmBolt checkout.
Later frontend builds use the staged assets without rebuilding LLVM. Imported or
incomplete assets do not pass production checks.

The Lite builder discovers the installed extension. Install and link it before
building Lite. Its output is `lite/_output`; the standalone output is
`dist/standalone`. Both include their own copy of the compiler assets.

## Development loop

For JupyterLab, run these in separate terminals:

```sh
pixi run --as-is jlpm watch
pixi run --as-is jupyter lab
```

Reload JupyterLab after changes. When editing worker code, also run
`pixi run --as-is jlpm build:worker` and rebuild the extension before reloading.
The heavyweight compiler build stays outside this loop.

For standalone development:

```sh
pixi run --as-is jlpm dev:standalone
```

Vite serves the existing compiler directory without bundling its loader. Rebuild
worker code explicitly when it changes. To test production assets, use
`build:standalone` followed by `serve:standalone`.

For the Correxit-style Lite testbed:

```sh
pixi run --as-is jlpm build:lite
pixi run --as-is jlpm serve
```

## Checks

```sh
pixi run --as-is jlpm lint:check
pixi run --as-is jlpm typecheck
pixi run --as-is jlpm test
pixi run --as-is jlpm playwright install
pixi run --as-is jlpm test:browser
```

Build all three hosts before browser tests. Linux CI installs browser system
dependencies with `jlpm playwright install --with-deps`. Browser tests start
local servers, exercise non-root paths, and cover actual compiler behavior,
asset failures, cancellation, recovery, persistence, and offline compilation.
See [ui-tests/README.md](ui-tests/README.md) for the matrix.

Main, worker, unit-test, and browser-test TypeScript configurations are
separate. Worker code has worker globals rather than DOM globals. ESLint checks
Jupyter import boundaries and pure domain imports. Vite rejects Jupyter modules
in the standalone production build.

## Packaging

After building all hosts:

```sh
pixi run --as-is jlpm pack --out dist/fortitudo.tgz
pixi run --as-is python -m build --no-isolation
pixi run --as-is jlpm test:packages
pixi run --as-is python scripts/release.py
pixi run --as-is actionlint
```

The checks read the npm archive, wheel, source distribution, extension,
standalone site, and Lite site. Every compiler file must match the generated
manifest; the worker and manifest must match the current build too.

The release check validates package metadata, checks PyPI's file limit, runs
Twine and npm's publish dry run, and writes `dist/release.json` with archive
sizes and hashes. It does not publish. See [RELEASE.md](RELEASE.md) for registry
setup and the manually triggered release workflow. Keep `package.json` as the
version source; staging, commits, and tags remain the user's responsibility.
