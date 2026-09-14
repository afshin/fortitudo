# Fortitudo

Fortitudo is a browser-only C/C++ compiler explorer for JupyterLab, JupyterLite,
and a standalone Lumino application. All three hosts use the same workbench and
compiler worker. No kernel or remote compiler is needed.

The [web app](https://afshin.github.io/fortitudo/) opens the standalone
explorer. Select **Open JupyterLite** to use the explorer alongside C23 and
C++23 notebooks. Both applications run in the browser.

Edit a function, choose a language, target, and optimization level, then select
**Compile** or press **Ctrl/Cmd+Enter**. Inspect assembly and compiler messages;
select a diagnostic to jump to its source location. Compilation runs in a
worker, so editing remains available. **Cancel** terminates that worker; the
next compile loads a fresh one.

The defaults are C++23, WebAssembly, and O2. C23 and O0–O3 are available. The
packaged LLVM runtime reports WebAssembly, x86-64, and AArch64 backends. Native
targets produce assembly with Clang built-in headers only; the packaged C/C++
system headers are for WebAssembly.

Source, options, and pane layout are saved by the host. Jupyter also keeps a
browser copy scoped to the current workspace, protecting recent edits while its
workspace writes are deferred. Reopening restores editing state without
compiling. Output is explicitly marked out of date when source or options
change. Invalid saved state opens a usable default session with feedback.

## Running locally

The prebuilt extension requires JupyterLab 4.6 or later. Once the release is
published, install it with:

```sh
python -m pip install fortitudo
```

Restart JupyterLab and select **Open Fortitudo** in the launcher or command
palette. The wheel includes the compiler; installing it does not require Node or
a compiler build. The npm package also includes the runtime and exports the
shared workbench for applications that supply their own Lumino host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete Pixi setup and build
sequence. The compiler is a separate heavyweight build; frontend builds require
its generated assets and verify their hashes.

For an already built checkout:

```sh
pixi run --as-is jupyter lab
pixi run --as-is jlpm serve
pixi run --as-is jlpm serve:standalone
```

In JupyterLab or JupyterLite, select **Open Fortitudo** in the launcher or
command palette. The Lite testbed is served on port 8080; the standalone preview
prints its local address. These commands run in separate terminals.

Built standalone and Lite directories can be served below a URL prefix. Keep
each site's `compiler` assets at their generated relative location. Serve `.js`
as JavaScript, `.wasm` as `application/wasm`, and `.data` as
`application/octet-stream`. Compilation works offline after initialization;
offline page reload is a separate feature.

## Architecture

- Pure model, request construction, and diagnostic parsing.
- One instance-owned store outside React.
- Lumino commands orchestrate semantic changes and compiler effects.
- Functional React views, with explicit store and CodeMirror bridges.
- A shared Lumino workbench owns workers and view lifecycles, with tab panels
  inside resizable split panels. Jupyter owns docking of the workbench itself.
- Thin Jupyter and standalone adapters supply shell and persistence.

The shared package entry exports these contracts. Only `src/jupyter/` imports
JupyterLab packages; the plugin retains `fortitudo:plugin`.

## C and C++ notebooks

Our JupyterLite site includes xeus-cpp 0.10.0, with C23 and C++23 kernels. Open
**Getting started.ipynb** or **C examples.ipynb** and choose **Run → Run All
Cells**. The examples use packaged standard library headers, define functions,
and reuse state across cells.

The notebook interpreter runs in its own browser worker. It is independent of
Fortitudo's assembly compiler: code, options, and results are not synchronized
between them. Its Clang version also differs from the explorer's LLVM runtime.
The first kernel start downloads the interpreter and its libraries. Browser
memory limits apply; native processes, native platform APIs, and arbitrary
native libraries are unavailable.

These kernels are included in our Lite site, not installed into native
JupyterLab by the Fortitudo Python package.

## Runtime and limits

The runtime is reproduced from WasmBolt with LLVM 23.1.0 and Emscripten 4.0.9.
[runtime/README.md](runtime/README.md) records its origin, pins, licenses, and
build details. Generated `compiler/manifest.json` records asset sizes and
SHA-256 hashes. Browser test attachments record timings and Wasm memory
observations.

The current compiler is large and reserves 256 MiB of initial Wasm memory, with
memory growth enabled and a 32 MiB stack. Browser memory limits still apply.
Cancellation releases the worker; a later compile must initialize another.
Initialization and runtime failures offer a retry path. Ordinary compiler errors
retain diagnostics and raw output.

This implementation produces assembly. IR/AST views, MLIR tools, graphs,
execution, a terminal, sharing, arbitrary flags, automatic compilation, and
automatic timeouts are deferred. The optional upstream MLIR driver remains
packaged to preserve the runtime build, but is not downloaded eagerly.

## Acknowledgments

Fortitudo’s browser compiler runtime is based on
[WasmBolt](https://github.com/anutosh491/WasmBolt), created by Anutosh Bhat and
released under the MIT License. We reuse WasmBolt’s compiler module, LLVM
lifecycle adaptations, and compilation pipeline, with an adapted build recipe.
Fortitudo adds the shared React/Lumino workbench, compiler worker service, and
JupyterLab, JupyterLite, and standalone integrations. WasmBolt’s original
copyright and license notice are included in our distributions.

The compiler itself is provided by LLVM/Clang and built for WebAssembly using
Emscripten.

Our notebook environment uses
[xeus-cpp](https://github.com/compiler-research/xeus-cpp), CppInterOp, and
[jupyterlite-xeus](https://github.com/jupyterlite/xeus), with browser packages
from [emscripten-forge](https://github.com/emscripten-forge/recipes). Their work
makes interactive C and C++ notebooks possible without a server. The Lite build
preserves package license notices alongside the kernel assets.

## License

Fortitudo is BSD-3-Clause licensed. The compiler incorporates WasmBolt and other
separately licensed software. Required notices are included in
`runtime/licenses/` and copied into each distribution.
